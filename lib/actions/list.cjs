async function runListAction(context) {
  const {
    synced,
    store,
    liveState,
    options,
    writeStore,
    formatAccountSummary,
    getDisplayAccounts,
    getListGuidance,
    getAvailableAccountsHeading,
    path,
    refreshStoredUsageSnapshots,
    fetchUsage,
    getAccountKey,
    formatUsageDetail,
  } = context;

  let usageChanged = false;
  let currentUsageResult = null;
  if (
    options.showUsage &&
    refreshStoredUsageSnapshots &&
    liveState.identity &&
    liveState.identity.sub
  ) {
    const currentKey = getAccountKey({
      sub: liveState.identity.sub,
      emailAddress: liveState.identity.email,
    });
    const refreshed = await refreshStoredUsageSnapshots(
      store,
      currentKey,
      fetchUsage,
    );
    usageChanged = refreshed.changed;
    currentUsageResult = refreshed.currentUsageResult;
  }

  if (synced.changed) {
    writeStore(store, options);
    console.log(
      `Saved the current account snapshot into ${path.basename(options.storePath)} before showing the account list.`,
    );
  } else if (usageChanged) {
    writeStore(store, options);
  }

  if (currentUsageResult && currentUsageResult.ok && formatUsageDetail) {
    const detailLines = formatUsageDetail(currentUsageResult.response);
    if (detailLines.length > 0) {
      console.log("--- Usage ---");
      for (const line of detailLines) console.log(line);
      console.log("");
    }
  }

  console.log(getAvailableAccountsHeading());
  const currentMetadata =
    liveState.identity && liveState.identity.sub
      ? { sub: liveState.identity.sub, emailAddress: liveState.identity.email }
      : null;
  for (const line of formatAccountSummary(
    getDisplayAccounts(store, currentMetadata),
  )) {
    console.log(line);
  }
  console.log("");
  for (const line of getListGuidance(options.usageCommand)) console.log(line);
}

module.exports = { runListAction };
