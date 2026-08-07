async function runSyncAction(existingStore, liveState, deps) {
  const {
    syncStoreFromLive,
    deepCopy,
    storeVersion,
    writeStore,
    options,
    path,
    fetchUsage,
    formatUsageDetail,
  } = deps;
  const result = syncStoreFromLive(
    existingStore,
    liveState,
    deepCopy,
    storeVersion,
  );
  if (result.skipped) {
    console.log(`Warning: ${result.warning}`);
    console.log("Sync skipped; the store was not updated.");
    return;
  }
  if (result.changed) {
    writeStore(result.store, options);
    console.log(
      `Synced current account into ${path.basename(options.storePath)}.`,
    );
  } else {
    console.log(
      `${path.basename(options.storePath)} already matches the current account snapshot.`,
    );
  }

  if (options.showUsage && fetchUsage && formatUsageDetail) {
    const entry = result.store.accounts.find((e) => e.key === result.key);
    const accessToken =
      entry &&
      entry.credentials &&
      entry.credentials.oauthToken &&
      entry.credentials.oauthToken.token
        ? entry.credentials.oauthToken.token.access_token
        : undefined;
    if (accessToken) {
      const usageResult = await fetchUsage(accessToken);
      if (usageResult.ok) {
        const lines = formatUsageDetail(usageResult.response);
        if (lines.length > 0) {
          console.log("--- Usage ---");
          for (const line of lines) console.log(line);
        }
      }
    }
  }
}

module.exports = { runSyncAction };
