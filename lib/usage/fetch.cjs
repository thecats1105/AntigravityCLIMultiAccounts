const https = require("https");

// UNDOCUMENTED, reverse-engineered endpoint - found via `strings` on the real
// agy/antigravity binary (proto: google.internal.cloud.code.v1internal.
// RetrieveUserQuotaSummary), part of the same private "Cloud Code Assist" API
// family (cloudcode-pa.googleapis.com) that agy itself calls for its account.
// A live call with a real access token returned a structured 429 (not
// 401/404), confirming the endpoint and bearer-token auth are real - but a
// 200 body was never captured, so the success shape is inferred from Go
// struct tags, not confirmed. Callers must treat every result as best-effort.
const QUOTA_ENDPOINT =
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary";
const REQUEST_TIMEOUT_MS = 10000;

function defaultPost(endpoint, accessToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const body = "{}";
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
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
      req.destroy(new Error("quota endpoint timeout"));
    });
    req.write(body);
    req.end();
  });
}

// Never throws - usage display must always be best-effort and must never
// block or fail a switch/list/sync command.
async function fetchUsage(accessToken, deps = {}) {
  const post = deps.httpPost || defaultPost;
  const endpoint = deps.endpoint || QUOTA_ENDPOINT;

  if (!accessToken) {
    return {
      ok: false,
      code: "no-token",
      message: "no access token available",
    };
  }

  let res;
  try {
    res = await post(endpoint, accessToken);
  } catch (error) {
    return {
      ok: false,
      code: "network",
      message: `Quota endpoint unreachable: ${error.message}`,
    };
  }

  if (res.statusCode === 429) {
    return {
      ok: false,
      code: "rate-limited",
      message: "the quota-check API itself is rate-limited right now",
    };
  }
  if (res.statusCode !== 200) {
    return {
      ok: false,
      code: "protocol",
      message: `quota endpoint returned ${res.statusCode}`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return {
      ok: false,
      code: "protocol",
      message: "quota endpoint returned an unparsable response",
    };
  }

  return { ok: true, response: parsed };
}

module.exports = { fetchUsage, QUOTA_ENDPOINT };
