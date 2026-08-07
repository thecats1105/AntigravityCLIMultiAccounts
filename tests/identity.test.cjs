const test = require("node:test");
const assert = require("node:assert");
const {
  fetchLiveIdentity,
  resolveLiveIdentity,
} = require("../lib/auth/identity.cjs");

function liveState(overrides = {}) {
  return {
    oauthToken: {
      auth_method: "consumer",
      token: {
        access_token: "old-access",
        refresh_token: "old-refresh",
        expiry: new Date(Date.now() - 60000).toISOString(),
        token_type: "Bearer",
        ...overrides,
      },
    },
  };
}

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

test("resolveLiveIdentity: liveIdentityOverride short-circuits, no refresh/fetch attempted", async () => {
  let refreshCalls = 0;
  let fetchCalls = 0;
  const result = await resolveLiveIdentity(liveState(), {
    liveIdentityOverride: { sub: "override-sub", email: "override@test.com" },
    assessCredentials: () => {
      throw new Error("should not be called");
    },
    refreshToken: async () => {
      refreshCalls += 1;
      return { ok: true, token: {} };
    },
    fetchIdentity: async () => {
      fetchCalls += 1;
      return { sub: "x", email: "x@test.com" };
    },
    writeLiveState: () => {},
    options: {},
  });
  assert.deepStrictEqual(result, {
    sub: "override-sub",
    email: "override@test.com",
  });
  assert.strictEqual(refreshCalls, 0);
  assert.strictEqual(fetchCalls, 0);
});

test("resolveLiveIdentity: expired live token -> refreshes, persists via writeLiveState, resolves with the fresh access token", async () => {
  const writes = [];
  const state = liveState();
  const result = await resolveLiveIdentity(state, {
    assessCredentials: () => ({ verdict: "need-refresh" }),
    refreshToken: async (token) => ({
      ok: true,
      token: { ...token, access_token: "fresh-access" },
    }),
    fetchIdentity: async (accessToken) => {
      assert.strictEqual(accessToken, "fresh-access");
      return { sub: "sub-1", email: "a@test.com" };
    },
    writeLiveState: (snapshot) => writes.push(snapshot),
    options: {},
  });
  assert.deepStrictEqual(result, { sub: "sub-1", email: "a@test.com" });
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(writes[0].oauthToken.token.access_token, "fresh-access");
  assert.strictEqual(state.oauthToken.token.access_token, "fresh-access");
});

test("resolveLiveIdentity: refresh fails, live token still invalid -> friendly re-login message instead of raw 401", async () => {
  let writeCalls = 0;
  await assert.rejects(
    resolveLiveIdentity(liveState(), {
      assessCredentials: () => ({ verdict: "need-refresh" }),
      refreshToken: async () => ({ ok: false, code: "revoked" }),
      fetchIdentity: async () => {
        throw new Error("userinfo endpoint returned 401");
      },
      writeLiveState: () => {
        writeCalls += 1;
      },
      options: {},
    }),
    /Run `agy` once to refresh your session/,
  );
  assert.strictEqual(writeCalls, 0);
});

test("resolveLiveIdentity: token not expired -> skips refresh entirely", async () => {
  let refreshCalls = 0;
  const result = await resolveLiveIdentity(liveState(), {
    assessCredentials: () => ({ verdict: "ok" }),
    refreshToken: async () => {
      refreshCalls += 1;
      return { ok: true, token: {} };
    },
    fetchIdentity: async (accessToken) => {
      assert.strictEqual(accessToken, "old-access");
      return { sub: "sub-1", email: "a@test.com" };
    },
    writeLiveState: () => {},
    options: {},
  });
  assert.deepStrictEqual(result, { sub: "sub-1", email: "a@test.com" });
  assert.strictEqual(refreshCalls, 0);
});

test("resolveLiveIdentity: non-401 fetch failure is passed through unmodified", async () => {
  await assert.rejects(
    resolveLiveIdentity(liveState(), {
      assessCredentials: () => ({ verdict: "ok" }),
      refreshToken: async () => ({ ok: true, token: {} }),
      fetchIdentity: async () => {
        throw new Error("userinfo endpoint timeout");
      },
      writeLiveState: () => {},
      options: {},
    }),
    /userinfo endpoint timeout/,
  );
});
