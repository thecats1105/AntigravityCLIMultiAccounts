const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runSwitchPipeline } = require("../lib/actions/switch-pipeline.cjs");
const { assessCredentials } = require("../lib/auth/guard.cjs");
const io = require("../lib/store/io.cjs");
const messages = require("../lib/output/messages.cjs");

const NOW = Date.now();

function makeFixtures() {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agy-switch-pipeline-test-"),
  );
  const options = {
    oauthTokenPath: path.join(dir, "antigravity-oauth-token"),
    storePath: path.join(dir, "store.json"),
    backupDir: path.join(dir, "backups"),
  };

  const liveOauthToken = {
    auth_method: "consumer",
    token: {
      access_token: "live-a",
      refresh_token: "live-refresh-a",
      expiry: new Date(NOW + 3600000).toISOString(),
    },
  };
  const expiredSlot = {
    key: "sub:sub-b",
    index: 0,
    metadata: { sub: "sub-b", emailAddress: "b@test.com" },
    credentials: {
      oauthToken: {
        auth_method: "consumer",
        token: {
          access_token: "stale-access-b",
          refresh_token: "stale-refresh-b",
          expiry: new Date(NOW - 3600000).toISOString(),
        },
      },
    },
  };
  const store = {
    version: "0.2.0",
    accounts: [JSON.parse(JSON.stringify(expiredSlot))],
  };

  fs.writeFileSync(
    options.oauthTokenPath,
    JSON.stringify(liveOauthToken, null, 2),
    "utf8",
  );
  fs.writeFileSync(options.storePath, JSON.stringify(store, null, 2), "utf8");

  return {
    dir,
    options,
    store,
    selected: { ...expiredSlot, credentials: store.accounts[0].credentials },
  };
}

function baseContext(fixtures, overrides = {}) {
  return {
    selected: fixtures.selected,
    store: fixtures.store,
    options: fixtures.options,
    deepCopy: io.deepCopy,
    writeLiveState: io.writeLiveState,
    writeStore: io.writeStore,
    assessCredentials,
    detectAgySessions: () => ({ detected: true, count: 0 }),
    now: () => NOW,
    log: () => {},
    messages,
    ...overrides,
  };
}

test("pipeline: expired slot -> refresh 200 -> token persisted to store BEFORE live write", async () => {
  const fixtures = makeFixtures();
  const sequence = [];

  const context = baseContext(fixtures, {
    refreshToken: async () => ({
      ok: true,
      token: {
        access_token: "rotated-access-b",
        refresh_token: "rotated-refresh-b",
        expiry: new Date(NOW + 3600000).toISOString(),
        token_type: "Bearer",
      },
    }),
    writeStore: (store, options) => {
      sequence.push("store");
      io.writeStore(store, options);
    },
    writeLiveState: (snapshot, options) => {
      sequence.push("live");
      const persisted = JSON.parse(fs.readFileSync(options.storePath, "utf8"));
      const slot = persisted.accounts.find((e) => e.key === "sub:sub-b");
      assert.strictEqual(
        slot.credentials.oauthToken.token.refresh_token,
        "rotated-refresh-b",
        "refreshed token must already be on disk in the store before the live swap",
      );
      io.writeLiveState(snapshot, options);
    },
  });

  const result = await runSwitchPipeline(context);

  assert.strictEqual(result.switched, true);
  assert.strictEqual(result.refreshed, true);
  assert.deepStrictEqual(sequence, ["store", "live"]);

  const liveState = io.readLiveState(fixtures.options);
  assert.strictEqual(
    liveState.oauthToken.token.access_token,
    "rotated-access-b",
  );

  fs.rmSync(fixtures.dir, { recursive: true, force: true });
});

test("pipeline: refresh fails -> switch still proceeds with the stored (unrefreshed) token", async () => {
  const fixtures = makeFixtures();

  const context = baseContext(fixtures, {
    refreshToken: async () => ({
      ok: false,
      code: "network",
      message: "unreachable",
    }),
  });

  const result = await runSwitchPipeline(context);

  assert.strictEqual(
    result.switched,
    true,
    "a failed best-effort refresh must not abort the switch",
  );
  assert.strictEqual(result.refreshed, false);
  assert.strictEqual(result.refreshSkipped, true);

  const liveState = io.readLiveState(fixtures.options);
  assert.strictEqual(
    liveState.oauthToken.token.access_token,
    "stale-access-b",
    "unrefreshed token is restored as-is",
  );

  fs.rmSync(fixtures.dir, { recursive: true, force: true });
});

test("pipeline: no refresh token at all -> abort, no file writes at all", async () => {
  const fixtures = makeFixtures();
  fixtures.selected.credentials.oauthToken.token.refresh_token = undefined;
  fixtures.store.accounts[0].credentials.oauthToken.token.refresh_token =
    undefined;
  const oauthBefore = fs.readFileSync(fixtures.options.oauthTokenPath, "utf8");
  const storeBefore = fs.readFileSync(fixtures.options.storePath, "utf8");
  const sequence = [];

  const context = baseContext(fixtures, {
    writeStore: () => {
      sequence.push("store");
    },
    writeLiveState: () => {
      sequence.push("live");
    },
  });

  const result = await runSwitchPipeline(context);

  assert.strictEqual(result.switched, false);
  assert.strictEqual(result.abort.code, "refresh-expired");
  assert.deepStrictEqual(sequence, []);
  assert.strictEqual(
    fs.readFileSync(fixtures.options.oauthTokenPath, "utf8"),
    oauthBefore,
  );
  assert.strictEqual(
    fs.readFileSync(fixtures.options.storePath, "utf8"),
    storeBefore,
  );

  fs.rmSync(fixtures.dir, { recursive: true, force: true });
});

test("pipeline: valid slot -> no refresh call, straight switch", async () => {
  const fixtures = makeFixtures();
  fixtures.selected.credentials.oauthToken.token.expiry = new Date(
    NOW + 3600000,
  ).toISOString();
  fixtures.store.accounts[0].credentials.oauthToken.token.expiry = new Date(
    NOW + 3600000,
  ).toISOString();
  let refreshCalls = 0;

  const context = baseContext(fixtures, {
    refreshToken: async () => {
      refreshCalls += 1;
      return { ok: false, code: "network", message: "should not be called" };
    },
  });

  const result = await runSwitchPipeline(context);

  assert.strictEqual(result.switched, true);
  assert.strictEqual(result.refreshed, false);
  assert.strictEqual(refreshCalls, 0);

  fs.rmSync(fixtures.dir, { recursive: true, force: true });
});
