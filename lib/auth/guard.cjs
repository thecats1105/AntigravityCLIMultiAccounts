const ACCESS_TOKEN_SAFETY_MS = 5 * 60 * 1000;

// agy's oauth token file stores `expiry` as a string (Go's oauth2 package
// serializes time.Time as RFC3339), but this is unverified - fall back to
// treating a bare number as epoch millis just in case.
function parseExpiry(expiry) {
  if (typeof expiry === 'number' && Number.isFinite(expiry)) return expiry;
  if (typeof expiry === 'string' && expiry.trim()) {
    const parsed = Date.parse(expiry);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return NaN;
}

// Unlike Claude's claudeAiOauth, Google refresh tokens have no known fixed
// expiry field here - they last until revoked. So there is no
// `refresh-expired`-by-time case, only "no refresh token at all".
function assessCredentials(oauthToken, now) {
  const token = oauthToken && oauthToken.token;
  if (!token || typeof token !== 'object') {
    return { verdict: 'refresh-expired', reason: 'stored credentials are missing an oauth token' };
  }
  if (!token.refresh_token) {
    return { verdict: 'refresh-expired', reason: 'stored credentials have no refresh token' };
  }
  const accessExpiresAt = parseExpiry(token.expiry);
  if (!token.access_token || Number.isNaN(accessExpiresAt) || accessExpiresAt <= now + ACCESS_TOKEN_SAFETY_MS) {
    return { verdict: 'need-refresh', reason: 'stored access token is expired or expiring soon' };
  }
  return { verdict: 'ok', reason: 'stored access token is still valid' };
}

// Local files cannot prove which account a token belongs to; the detectable
// poisoning case is live tokens that verbatim match a different stored slot.
// `liveState.identity` must already be resolved via the userinfo endpoint
// (lib/agy/auth/identity.cjs) - see that file for why local files alone
// (google_accounts.json / google_account_id) are not trustworthy here.
function verifyLiveIdentity(liveState, store, getAccountKey) {
  const identity = liveState && liveState.identity;
  if (!identity || !identity.sub) {
    return { ok: false, reason: 'Could not resolve the live account identity.' };
  }
  const token = liveState.oauthToken && liveState.oauthToken.token;
  if (!token || !token.access_token || !token.refresh_token) {
    return { ok: false, reason: 'The Antigravity oauth token file has no usable token.' };
  }
  const liveKey = getAccountKey({ sub: identity.sub, emailAddress: identity.email });
  const accounts = Array.isArray(store && store.accounts) ? store.accounts : [];
  for (const entry of accounts) {
    if (!entry || entry.key === liveKey) continue;
    const stored = entry.credentials && entry.credentials.oauthToken && entry.credentials.oauthToken.token;
    if (!stored) continue;
    if ((stored.refresh_token && stored.refresh_token === token.refresh_token)
      || (stored.access_token && stored.access_token === token.access_token)) {
      return {
        ok: false,
        reason: `Live credentials match the stored tokens of a different account (${entry.key}). Skipping sync to avoid corrupting the store.`,
      };
    }
  }
  return { ok: true };
}

module.exports = { assessCredentials, verifyLiveIdentity, parseExpiry, ACCESS_TOKEN_SAFETY_MS };
