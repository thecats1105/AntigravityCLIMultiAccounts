const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  readLiveState,
  writeLiveState,
  writeStore,
} = require("../lib/store/io.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agy-switch-io-test-"));
}

function makeOptions(dir) {
  return {
    oauthTokenPath: path.join(dir, "antigravity-oauth-token"),
    storePath: path.join(dir, "store.json"),
    backupDir: path.join(dir, "backups"),
  };
}

test("writeLiveState: writes the oauth token file and backs up the previous one", () => {
  const dir = tempDir();
  const options = makeOptions(dir);
  fs.writeFileSync(
    options.oauthTokenPath,
    JSON.stringify({ auth_method: "consumer", token: { access_token: "old" } }),
    "utf8",
  );

  writeLiveState(
    {
      oauthToken: {
        auth_method: "consumer",
        token: {
          access_token: "new",
          refresh_token: "r",
          expiry: "2030-01-01T00:00:00Z",
        },
      },
    },
    options,
  );

  const liveState = readLiveState(options);
  assert.strictEqual(liveState.oauthToken.token.access_token, "new");
  assert.ok(
    fs
      .readdirSync(options.backupDir)
      .some((name) => name.startsWith("antigravity-oauth-token.")),
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test(
  "writeLiveState: preserves restrictive permissions on the oauth token file",
  { skip: process.platform === "win32" },
  () => {
    const dir = tempDir();
    const options = makeOptions(dir);
    fs.writeFileSync(options.oauthTokenPath, "{}", {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.chmodSync(options.oauthTokenPath, 0o600);

    writeLiveState(
      {
        oauthToken: {
          auth_method: "consumer",
          token: { access_token: "a", refresh_token: "r" },
        },
      },
      options,
    );

    assert.strictEqual(fs.statSync(options.oauthTokenPath).mode & 0o777, 0o600);
    fs.rmSync(dir, { recursive: true, force: true });
  },
);

test("writeStore: writes and backs up the account store", () => {
  const dir = tempDir();
  const options = makeOptions(dir);
  writeStore({ version: "0.2.0", accounts: [] }, options);
  writeStore({ version: "0.2.0", accounts: [{ key: "sub:123" }] }, options);

  const store = JSON.parse(fs.readFileSync(options.storePath, "utf8"));
  assert.strictEqual(store.accounts.length, 1);
  assert.ok(
    fs
      .readdirSync(options.backupDir)
      .some((name) => name.startsWith("store.json.")),
  );

  fs.rmSync(dir, { recursive: true, force: true });
});
