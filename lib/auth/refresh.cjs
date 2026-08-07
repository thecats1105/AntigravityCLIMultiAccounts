const https = require('https');

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// Discovered via `strings` on the real agy/antigravity binary. Which (if
// either) is the right client id for a refresh_token grant - and whether a
// client_secret is required - is UNVERIFIED (see port plan Step 0). Callers
// must treat a failure here as non-fatal, never as proof the token is dead.
const CANDIDATE_CLIENT_IDS = [
  '884354919052-36trc1jjb3tguiac32ov6cod268c5blh.apps.googleusercontent.com',
  '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
];
const REQUEST_TIMEOUT_MS = 10000;

function postForm(endpoint, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const url = new URL(endpoint);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'antigravity-cli-multi-accounts',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('token endpoint timeout'));
    });
    req.write(body);
    req.end();
  });
}

function mergeRefreshedToken(token, tokenResponse) {
  const merged = { ...token };
  merged.access_token = tokenResponse.access_token;
  if (tokenResponse.refresh_token) {
    merged.refresh_token = tokenResponse.refresh_token;
  }
  if (typeof tokenResponse.expires_in === 'number' && Number.isFinite(tokenResponse.expires_in)) {
    merged.expiry = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();
  }
  if (tokenResponse.token_type) {
    merged.token_type = tokenResponse.token_type;
  }
  return merged;
}

// Best-effort only. Tries each candidate client id in turn; returns
// ok:false (never throws) on any failure so the switch pipeline can fall
// back to restoring the stored token as-is instead of aborting.
async function refreshToken(token, deps = {}) {
  const post = deps.httpPost || postForm;
  const clientIds = deps.clientIds || CANDIDATE_CLIENT_IDS;
  const endpoint = deps.endpoint || TOKEN_ENDPOINT;

  if (!token || !token.refresh_token) {
    return { ok: false, code: 'no-refresh-token', message: 'no refresh token available' };
  }

  let lastFailure = null;
  for (const clientId of clientIds) {
    let res;
    try {
      res = await post(endpoint, {
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
        client_id: clientId,
      });
    } catch (error) {
      lastFailure = { ok: false, code: 'network', message: `Token endpoint unreachable: ${error.message}` };
      continue;
    }
    if (res.statusCode === 200) {
      let parsed;
      try {
        parsed = JSON.parse(res.body);
      } catch {
        lastFailure = { ok: false, code: 'protocol', message: 'Token endpoint returned an unparsable response.' };
        continue;
      }
      if (!parsed.access_token) {
        lastFailure = { ok: false, code: 'protocol', message: 'Token endpoint response is missing access_token.' };
        continue;
      }
      return { ok: true, token: mergeRefreshedToken(token, parsed) };
    }
    const code = res.statusCode === 400 || res.statusCode === 401 ? 'revoked' : 'protocol';
    lastFailure = { ok: false, code, message: `token endpoint returned ${res.statusCode} for client ${clientId}` };
  }

  return lastFailure || { ok: false, code: 'network', message: 'no client id could refresh the token' };
}

module.exports = { refreshToken, mergeRefreshedToken, CANDIDATE_CLIENT_IDS, TOKEN_ENDPOINT };
