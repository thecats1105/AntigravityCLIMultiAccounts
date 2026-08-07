const https = require("https");

// CONFIRMED (2026-08-07, real second-account login test): ~/.gemini/google_accounts.json's
// `active` field and ~/.gemini/google_account_id do NOT track the real live login - both stayed
// pinned to a stale account after logging into a different one. The only reliable way found to
// determine which Google account a live access_token belongs to is asking Google directly.
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const REQUEST_TIMEOUT_MS = 10000;

function defaultGet(endpoint, accessToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "antigravity-cli-multi-accounts",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () =>
          resolve({ statusCode: res.statusCode, body: data }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error("userinfo endpoint timeout"));
    });
    req.end();
  });
}

// Returns { sub, email } for the account the given access token belongs to,
// or throws. `sub` is Google's stable per-account identifier - the closest
// analog to Claude's accountUuid - and should be preferred as the account
// key over email, which a user could technically change.
async function fetchLiveIdentity(accessToken, deps = {}) {
  const get = deps.httpGet || defaultGet;
  const endpoint = deps.endpoint || USERINFO_ENDPOINT;

  if (!accessToken) {
    throw new Error(
      "No access token available to resolve the live account identity.",
    );
  }

  const res = await get(endpoint, accessToken);
  if (res.statusCode !== 200) {
    throw new Error(`userinfo endpoint returned ${res.statusCode}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    throw new Error("userinfo endpoint returned an unparsable response.");
  }
  if (!parsed.sub) {
    throw new Error("userinfo endpoint response is missing sub.");
  }
  return { sub: String(parsed.sub), email: parsed.email || null };
}

module.exports = { fetchLiveIdentity, USERINFO_ENDPOINT };
