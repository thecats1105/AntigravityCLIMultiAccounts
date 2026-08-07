const test = require('node:test');
const assert = require('node:assert');
const { refreshToken, mergeRefreshedToken, CANDIDATE_CLIENT_IDS } = require('../lib/auth/refresh.cjs');

function storedToken() {
  return {
    access_token: 'old-access',
    refresh_token: 'old-refresh',
    expiry: '2020-01-01T00:00:00Z',
    token_type: 'Bearer',
  };
}

test('refreshToken: 200 on first client id -> merged token, no second attempt', async () => {
  const calls = [];
  const result = await refreshToken(storedToken(), {
    httpPost: async (endpoint, body) => {
      calls.push({ endpoint, body });
      return {
        statusCode: 200,
        body: JSON.stringify({ token_type: 'Bearer', access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
      };
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.token.access_token, 'new-access');
  assert.strictEqual(result.token.refresh_token, 'new-refresh');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].body.client_id, CANDIDATE_CLIENT_IDS[0]);
  assert.strictEqual(calls[0].body.grant_type, 'refresh_token');
});

test('refreshToken: 400 on first client id -> tries second candidate', async () => {
  const clientIdsSeen = [];
  const result = await refreshToken(storedToken(), {
    httpPost: async (_endpoint, body) => {
      clientIdsSeen.push(body.client_id);
      if (clientIdsSeen.length === 1) return { statusCode: 400, body: '{"error":"invalid_client"}' };
      return { statusCode: 200, body: JSON.stringify({ access_token: 'second-access', expires_in: 100 }) };
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(clientIdsSeen.length, 2);
  assert.strictEqual(result.token.access_token, 'second-access');
});

test('refreshToken: both candidates rejected -> ok:false, revoked, never throws', async () => {
  const result = await refreshToken(storedToken(), {
    httpPost: async () => ({ statusCode: 401, body: '{"error":"invalid_grant"}' }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'revoked');
});

test('refreshToken: network failure on both candidates -> ok:false, never throws', async () => {
  const result = await refreshToken(storedToken(), {
    httpPost: async () => { throw new Error('ECONNRESET'); },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'network');
});

test('refreshToken: missing refresh_token on input -> ok:false without any network call', async () => {
  let calls = 0;
  const result = await refreshToken({ access_token: 'a' }, {
    httpPost: async () => { calls += 1; return { statusCode: 200, body: '{}' }; },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'no-refresh-token');
  assert.strictEqual(calls, 0);
});

test('mergeRefreshedToken: missing refresh_token in response keeps old one', () => {
  const merged = mergeRefreshedToken(storedToken(), { access_token: 'a2', expires_in: 10 });
  assert.strictEqual(merged.refresh_token, 'old-refresh');
  assert.strictEqual(merged.access_token, 'a2');
});
