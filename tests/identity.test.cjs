const test = require("node:test");
const assert = require("node:assert");
const { fetchLiveIdentity } = require("../lib/auth/identity.cjs");

test("fetchLiveIdentity: 200 with sub+email -> resolved identity", async () => {
  const calls = [];
  const result = await fetchLiveIdentity("live-access-token", {
    httpGet: async (endpoint, accessToken) => {
      calls.push({ endpoint, accessToken });
      return {
        statusCode: 200,
        body: JSON.stringify({
          sub: "12345",
          email: "a@test.com",
          email_verified: true,
        }),
      };
    },
  });

  assert.deepStrictEqual(result, { sub: "12345", email: "a@test.com" });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].accessToken, "live-access-token");
});

test("fetchLiveIdentity: no access token -> throws without any network call", async () => {
  let calls = 0;
  await assert.rejects(
    fetchLiveIdentity(undefined, {
      httpGet: async () => {
        calls += 1;
        return { statusCode: 200, body: "{}" };
      },
    }),
  );
  assert.strictEqual(calls, 0);
});

test("fetchLiveIdentity: non-200 response -> throws", async () => {
  await assert.rejects(
    fetchLiveIdentity("expired-token", {
      httpGet: async () => ({
        statusCode: 401,
        body: '{"error":"invalid_token"}',
      }),
    }),
    /401/,
  );
});

test("fetchLiveIdentity: response missing sub -> throws", async () => {
  await assert.rejects(
    fetchLiveIdentity("token", {
      httpGet: async () => ({
        statusCode: 200,
        body: JSON.stringify({ email: "a@test.com" }),
      }),
    }),
    /sub/,
  );
});

test("fetchLiveIdentity: unparsable body -> throws", async () => {
  await assert.rejects(
    fetchLiveIdentity("token", {
      httpGet: async () => ({ statusCode: 200, body: "not json" }),
    }),
  );
});
