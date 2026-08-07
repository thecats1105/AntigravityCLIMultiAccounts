const test = require('node:test');
const assert = require('node:assert');
const { assessCredentials, verifyLiveIdentity, ACCESS_TOKEN_SAFETY_MS } = require('../lib/auth/guard.cjs');
const { getAccountKey } = require('../lib/store/accounts.cjs');

const NOW = 1_800_000_000_000;

function validOauthToken(overrides = {}) {
  return {
    auth_method: 'consumer',
    token: {
      access_token: 'access-token-fixture',
      refresh_token: 'refresh-token-fixture',
      expiry: new Date(NOW + 60 * 60 * 1000).toISOString(),
      token_type: 'Bearer',
      ...overrides,
    },
  };
}

test('assessCredentials: valid access token -> ok', () => {
  assert.strictEqual(assessCredentials(validOauthToken(), NOW).verdict, 'ok');
});

test('assessCredentials: expired access token -> need-refresh', () => {
  const result = assessCredentials(validOauthToken({ expiry: new Date(NOW - 1000).toISOString() }), NOW);
  assert.strictEqual(result.verdict, 'need-refresh');
});

test('assessCredentials: access token expiring inside safety margin -> need-refresh', () => {
  const result = assessCredentials(validOauthToken({ expiry: new Date(NOW + ACCESS_TOKEN_SAFETY_MS - 1).toISOString() }), NOW);
  assert.strictEqual(result.verdict, 'need-refresh');
});

test('assessCredentials: missing/invalid expiry -> need-refresh (conservative)', () => {
  assert.strictEqual(assessCredentials(validOauthToken({ expiry: undefined }), NOW).verdict, 'need-refresh');
  assert.strictEqual(assessCredentials(validOauthToken({ expiry: 'not-a-date' }), NOW).verdict, 'need-refresh');
});

test('assessCredentials: missing refresh token -> refresh-expired', () => {
  assert.strictEqual(assessCredentials(validOauthToken({ refresh_token: undefined }), NOW).verdict, 'refresh-expired');
});

test('assessCredentials: missing token -> refresh-expired', () => {
  assert.strictEqual(assessCredentials(undefined, NOW).verdict, 'refresh-expired');
  assert.strictEqual(assessCredentials({ auth_method: 'consumer' }, NOW).verdict, 'refresh-expired');
});

test('verifyLiveIdentity: clean live state -> ok', () => {
  const liveState = { identity: { sub: 'sub-a', email: 'a@test.com' }, oauthToken: validOauthToken() };
  const store = { accounts: [] };
  assert.strictEqual(verifyLiveIdentity(liveState, store, getAccountKey).ok, true);
});

test('verifyLiveIdentity: live tokens matching own slot -> ok', () => {
  const liveState = { identity: { sub: 'sub-a', email: 'a@test.com' }, oauthToken: validOauthToken() };
  const store = {
    accounts: [{ key: 'sub:sub-a', credentials: { oauthToken: validOauthToken() } }],
  };
  assert.strictEqual(verifyLiveIdentity(liveState, store, getAccountKey).ok, true);
});

test('verifyLiveIdentity: live tokens matching a DIFFERENT slot -> rejected (poisoning)', () => {
  const sharedToken = validOauthToken();
  const liveState = { identity: { sub: 'sub-b', email: 'b@test.com' }, oauthToken: sharedToken };
  const store = {
    accounts: [{ key: 'sub:sub-a', credentials: { oauthToken: sharedToken } }],
  };
  const result = verifyLiveIdentity(liveState, store, getAccountKey);
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /different account/);
});

test('verifyLiveIdentity: missing identity -> rejected', () => {
  const liveState = { identity: null, oauthToken: validOauthToken() };
  const result = verifyLiveIdentity(liveState, { accounts: [] }, getAccountKey);
  assert.strictEqual(result.ok, false);
});

test('verifyLiveIdentity: unusable live token -> rejected', () => {
  const liveState = { identity: { sub: 'sub-a' }, oauthToken: { token: { access_token: 'x' } } };
  const result = verifyLiveIdentity(liveState, { accounts: [] }, getAccountKey);
  assert.strictEqual(result.ok, false);
});
