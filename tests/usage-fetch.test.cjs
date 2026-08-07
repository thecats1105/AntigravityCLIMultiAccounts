const test = require("node:test");
const assert = require("node:assert");
const { fetchUsage, QUOTA_ENDPOINT } = require("../lib/usage/fetch.cjs");

test("fetchUsage: 200 with parsable body -> ok:true, response passed through", async () => {
  const calls = [];
  const result = await fetchUsage("token-a", {
    httpPost: async (endpoint, accessToken) => {
      calls.push({ endpoint, accessToken });
      return { statusCode: 200, body: JSON.stringify({ groups: [] }) };
    },
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.response, { groups: [] });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].endpoint, QUOTA_ENDPOINT);
  assert.strictEqual(calls[0].accessToken, "token-a");
});

test("fetchUsage: 429 -> ok:false, code rate-limited, never throws", async () => {
  const result = await fetchUsage("token-a", {
    httpPost: async () => ({ statusCode: 429, body: '{"error":{"code":429}}' }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "rate-limited");
});

test("fetchUsage: non-200/429 status -> ok:false, code protocol", async () => {
  const result = await fetchUsage("token-a", {
    httpPost: async () => ({ statusCode: 401, body: "{}" }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "protocol");
});

test("fetchUsage: unparsable body -> ok:false, code protocol, never throws", async () => {
  const result = await fetchUsage("token-a", {
    httpPost: async () => ({ statusCode: 200, body: "not json" }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "protocol");
});

test("fetchUsage: network failure -> ok:false, code network, never throws", async () => {
  const result = await fetchUsage("token-a", {
    httpPost: async () => {
      throw new Error("ECONNRESET");
    },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "network");
});

test("fetchUsage: missing access token -> ok:false without any network call", async () => {
  let calls = 0;
  const result = await fetchUsage(undefined, {
    httpPost: async () => {
      calls += 1;
      return { statusCode: 200, body: "{}" };
    },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "no-token");
  assert.strictEqual(calls, 0);
});
