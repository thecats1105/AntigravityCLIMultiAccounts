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
  } = context;

  if (synced.changed) {
    writeStore(store, options);
    console.log(`Saved the current account snapshot into ${path.basename(options.storePath)} before showing the account list.`);
  }

  console.log(getAvailableAccountsHeading());
  const currentMetadata = liveState.identity && liveState.identity.sub
    ? { sub: liveState.identity.sub, emailAddress: liveState.identity.email }
    : null;
  for (const line of formatAccountSummary(getDisplayAccounts(store, currentMetadata))) {
    console.log(line);
  }
  console.log('');
  for (const line of getListGuidance(options.usageCommand)) console.log(line);
}

module.exports = { runListAction };
