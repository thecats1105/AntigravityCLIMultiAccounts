const test = require("node:test");
const assert = require("node:assert");
const {
  syncStoreFromLive,
  getAccountKey,
} = require("../lib/store/accounts.cjs");
const { deepCopy } = require("../lib/store/io.cjs");

const STORE_VERSION = "0.2.0";
const NOW = Date.now();

function liveOauthToken(suffix) {
  return {
    auth_method: "consumer",
    token: {
      access_token: `access-${suffix}`,
      refresh_token: `refresh-${suffix}`,
      expiry: new Date(NOW + 3600000).toISOString(),
      token_type: "Bearer",
    },
  };
}

function makeLiveState(sub, email, suffix) {
  return { identity: { sub, email }, oauthToken: liveOauthToken(suffix) };
}

test("syncStoreFromLive: upserts live account, keyed by sub", () => {
  const store = { version: STORE_VERSION, accounts: [] };
  const result = syncStoreFromLive(
    store,
    makeLiveState("sub-a", "a@test.com", "a"),
    deepCopy,
    STORE_VERSION,
  );

  assert.strictEqual(result.changed, true);
  assert.strictEqual(result.skipped, undefined);
  assert.strictEqual(result.store.accounts.length, 1);
  assert.strictEqual(result.store.accounts[0].key, "sub:sub-a");
  assert.strictEqual(
    result.store.accounts[0].credentials.oauthToken.token.access_token,
    "access-a",
  );
  assert.strictEqual(
    result.store.accounts[0].metadata.emailAddress,
    "a@test.com",
  );
});

test("syncStoreFromLive: preserves alias/lastUsedAt on re-sync, even if email changes", () => {
  const first = syncStoreFromLive(
    { version: STORE_VERSION, accounts: [] },
    makeLiveState("sub-a", "a@test.com", "a"),
    deepCopy,
    STORE_VERSION,
  );
  first.store.accounts[0].alias = "work";
  first.store.accounts[0].lastUsedAt = "2026-01-01T00:00:00.000Z";

  // Same sub (same Google account), different reported email/token snapshot.
  const second = syncStoreFromLive(
    first.store,
    makeLiveState("sub-a", "a-renamed@test.com", "a2"),
    deepCopy,
    STORE_VERSION,
  );
  assert.strictEqual(second.store.accounts[0].alias, "work");
  assert.strictEqual(
    second.store.accounts[0].lastUsedAt,
    "2026-01-01T00:00:00.000Z",
  );
  assert.strictEqual(
    second.store.accounts[0].credentials.oauthToken.token.access_token,
    "access-a2",
  );
  assert.strictEqual(
    second.store.accounts[0].metadata.emailAddress,
    "a-renamed@test.com",
  );
});

test("syncStoreFromLive: live tokens matching another slot -> skipped with warning, store unchanged", () => {
  const sharedToken = liveOauthToken("a");
  const store = {
    version: STORE_VERSION,
    accounts: [
      {
        key: "sub:sub-a",
        metadata: { sub: "sub-a", emailAddress: "a@test.com" },
        credentials: { oauthToken: sharedToken },
      },
    ],
  };
  // Live claims to be account B (different sub) but carries account A's exact tokens.
  const liveState = {
    identity: { sub: "sub-b", email: "b@test.com" },
    oauthToken: sharedToken,
  };
  const result = syncStoreFromLive(store, liveState, deepCopy, STORE_VERSION);

  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.changed, false);
  assert.match(result.warning, /different account/);
  assert.strictEqual(result.store.accounts.length, 1);
  assert.strictEqual(result.store.accounts[0].key, "sub:sub-a");
});

test("syncStoreFromLive: throws on missing identity / oauth token", () => {
  assert.throws(() =>
    syncStoreFromLive(
      { accounts: [] },
      { identity: null, oauthToken: liveOauthToken("x") },
      deepCopy,
      STORE_VERSION,
    ),
  );
  assert.throws(() =>
    syncStoreFromLive(
      { accounts: [] },
      { identity: { sub: "sub-a" }, oauthToken: {} },
      deepCopy,
      STORE_VERSION,
    ),
  );
});

test("getAccountKey: sub preferred, email fallback", () => {
  assert.strictEqual(getAccountKey({ sub: "123" }), "sub:123");
  assert.strictEqual(
    getAccountKey({ emailAddress: "X@Y.com" }),
    "email:x@y.com",
  );
  assert.strictEqual(
    getAccountKey({ sub: "123", emailAddress: "x@y.com" }),
    "sub:123",
  );
  assert.throws(() => getAccountKey({}));
});
