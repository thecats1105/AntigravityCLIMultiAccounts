async function runSwitchPipeline(context) {
  const {
    selected,
    store,
    options,
    deepCopy,
    writeLiveState,
    writeStore,
    assessCredentials,
    refreshToken,
    detectAgySessions,
    now,
    log,
    messages,
  } = context;

  const result = {
    switched: false,
    refreshed: false,
    refreshSkipped: false,
    abort: null,
  };

  const sessions = detectAgySessions();
  if (sessions.detected && sessions.count > 0) {
    log(messages.getRunningSessionsWarning(sessions.count));
  }

  const assessment = assessCredentials(
    selected.credentials && selected.credentials.oauthToken,
    now(),
  );
  if (assessment.verdict === "refresh-expired") {
    result.abort = { code: "refresh-expired", reason: assessment.reason };
    return result;
  }

  const oauthTokenForLive = deepCopy(selected.credentials.oauthToken);
  if (assessment.verdict === "need-refresh") {
    log(messages.getRefreshProgress(selected.index));
    const refreshed = await refreshToken(oauthTokenForLive.token);
    if (refreshed.ok) {
      oauthTokenForLive.token = refreshed.token;
      result.refreshed = true;
      log(messages.getRefreshSuccess());
    } else {
      // Best-effort only: our refresh implementation is unverified (see
      // lib/agy/auth/refresh.cjs), so a failure must not block the switch.
      // Restore the token as-is; agy may prompt to re-auth if it's truly dead.
      result.refreshSkipped = true;
      log(messages.getRefreshSkipped(refreshed.message));
    }
  }

  const nowIso = new Date().toISOString();
  const storeIndex = store.accounts.findIndex(
    (entry) => entry.key === selected.key,
  );
  if (storeIndex >= 0) {
    store.accounts[storeIndex].lastUsedAt = nowIso;
    if (result.refreshed) {
      store.accounts[storeIndex].credentials.oauthToken =
        deepCopy(oauthTokenForLive);
      store.accounts[storeIndex].lastSyncedAt = nowIso;
    }
  }
  // If Google ever rotates the refresh token on refresh, the store must be
  // updated before the live swap so a failed live write can't lose it.
  writeStore(store, options);

  writeLiveState({ oauthToken: oauthTokenForLive }, options);

  result.switched = true;
  return result;
}

module.exports = { runSwitchPipeline };
