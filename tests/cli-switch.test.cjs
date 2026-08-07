const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const CLI = path.join(__dirname, "..", "ag-switch.cjs");
const NOW = Date.now();
const LIVE_IDENTITY = JSON.stringify({
  sub: "sub-live-a",
  email: "live-a@test.com",
});

function makeFixtures({ storedSlotHasNoRefreshToken = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-switch-cli-test-"));
  const oauthTokenPath = path.join(dir, "antigravity-oauth-token");
  const storePath = path.join(dir, "store.json");
  const backupDir = path.join(dir, "backups");

  const oauthToken = {
    auth_method: "consumer",
    token: {
      access_token: "live-access-a",
      refresh_token: "live-refresh-a",
      expiry: new Date(NOW + 3600000).toISOString(),
      token_type: "Bearer",
    },
  };

  const storedSlot = {
    key: "sub:sub-stored-b",
    metadata: { sub: "sub-stored-b", emailAddress: "stored-b@test.com" },
    credentials: {
      oauthToken: {
        auth_method: "consumer",
        token: {
          access_token: "stored-access-b",
          refresh_token: storedSlotHasNoRefreshToken
            ? undefined
            : "stored-refresh-b",
          expiry: new Date(NOW + 3600000).toISOString(),
          token_type: "Bearer",
        },
      },
    },
    capturedAt: new Date(NOW - 100000).toISOString(),
    lastSyncedAt: new Date(NOW - 100000).toISOString(),
  };

  fs.writeFileSync(oauthTokenPath, JSON.stringify(oauthToken, null, 2), "utf8");
  fs.writeFileSync(
    storePath,
    JSON.stringify({ version: "0.2.0", accounts: [storedSlot] }, null, 2),
    "utf8",
  );

  return { dir, oauthTokenPath, storePath, backupDir };
}

function runCli(fixtures, args) {
  return execFileSync(
    process.execPath,
    [
      CLI,
      ...args,
      "--oauth-token",
      fixtures.oauthTokenPath,
      "--store",
      fixtures.storePath,
      "--backup-dir",
      fixtures.backupDir,
      "--live-identity",
      LIVE_IDENTITY,
    ],
    { encoding: "utf8" },
  );
}

test("switch to valid stored slot: swaps the live oauth token file, captures outgoing account first", () => {
  const fixtures = makeFixtures();
  const output = runCli(fixtures, ["0"]);

  assert.match(output, /Switched active account to \[0\]/);

  const oauthToken = JSON.parse(
    fs.readFileSync(fixtures.oauthTokenPath, "utf8"),
  );
  assert.strictEqual(oauthToken.token.access_token, "stored-access-b");

  const store = JSON.parse(fs.readFileSync(fixtures.storePath, "utf8"));
  assert.strictEqual(store.accounts.length, 2);
  const outgoing = store.accounts.find((e) => e.key === "sub:sub-live-a");
  assert.ok(
    outgoing,
    "outgoing live account must be captured into the store before switching",
  );
  assert.strictEqual(
    outgoing.credentials.oauthToken.token.access_token,
    "live-access-a",
  );
  assert.strictEqual(outgoing.metadata.emailAddress, "live-a@test.com");

  fs.rmSync(fixtures.dir, { recursive: true, force: true });
});

test("switch to slot with no refresh token: aborts, live file untouched, exit 1", () => {
  const fixtures = makeFixtures({ storedSlotHasNoRefreshToken: true });
  const oauthBefore = fs.readFileSync(fixtures.oauthTokenPath, "utf8");

  let failed = null;
  try {
    runCli(fixtures, ["0"]);
  } catch (error) {
    failed = error;
  }

  assert.ok(failed, "CLI must exit non-zero");
  assert.strictEqual(failed.status, 1);
  assert.match(String(failed.stdout), /Switch aborted/);

  assert.strictEqual(
    fs.readFileSync(fixtures.oauthTokenPath, "utf8"),
    oauthBefore,
  );

  fs.rmSync(fixtures.dir, { recursive: true, force: true });
});

test("regression: sync captures live account into store, keyed by sub", () => {
  const fixtures = makeFixtures();
  const output = runCli(fixtures, ["sync"]);

  assert.match(output, /Synced current account/);
  const store = JSON.parse(fs.readFileSync(fixtures.storePath, "utf8"));
  assert.ok(store.accounts.some((e) => e.key === "sub:sub-live-a"));

  fs.rmSync(fixtures.dir, { recursive: true, force: true });
});
