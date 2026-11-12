const { runSwitchPipeline } = require("./switch-pipeline.cjs");

async function runSwitchAction(context) {
  const {
    selected,
    store,
    options,
    deepCopy,
    writeLiveState,
    verifyLiveState,
    writeStore,
    assessCredentials,
    refreshToken,
    detectAgySessions,
    now,
    messages,
    getDisplayAccounts,
    getEntryLabel,
    getRestartNotice,
    getStoredAccountsHeading,
    formatAccountSummary,
    refreshStoredUsageSnapshots,
    fetchUsage,
    getAccountKey,
  } = context;

  const result = await runSwitchPipeline({
    selected,
    store,
    options,
    deepCopy,
    writeLiveState,
    verifyLiveState,
    writeStore,
    assessCredentials,
    refreshToken,
    detectAgySessions,
    now,
    log: (line) => console.log(line),
    messages,
  });

  if (!result.switched) {
    for (const line of messages.getSwitchAbortedLines(
      result.abort,
      getEntryLabel(selected),
      options.usageCommand,
    )) {
      console.log(line);
    }
    process.exitCode = 1;
    return result;
  }

  if (options.showUsage && refreshStoredUsageSnapshots) {
    const currentKey = getAccountKey(selected.metadata);
    const refreshed = await refreshStoredUsageSnapshots(
      store,
      currentKey,
      fetchUsage,
    );
    if (refreshed.changed) writeStore(store, options);
  }

  const currentAccounts = getDisplayAccounts(store, selected.metadata);
  console.log(
    `Switched active account to [${selected.index}] ${getEntryLabel(selected)} <${selected.metadata.emailAddress}>.`,
  );
  console.log("");
  console.log(getRestartNotice());
  console.log("");
  console.log(getStoredAccountsHeading());
  for (const line of formatAccountSummary(currentAccounts)) {
    console.log(line);
  }
  return result;
}

module.exports = { runSwitchAction };
