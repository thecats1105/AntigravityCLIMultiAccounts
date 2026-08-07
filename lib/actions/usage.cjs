async function runUsageAction(context) {
  const {
    store,
    currentKey,
    fetchUsage,
    formatUsageDetail,
    refreshStoredUsageSnapshots,
    writeStore,
    options,
  } = context;

  console.log(
    "Fetching usage from Antigravity (Cloud Code Assist) quota API...",
  );
  const { currentUsageResult, changed } = await refreshStoredUsageSnapshots(
    store,
    currentKey,
    fetchUsage,
  );
  if (changed) {
    writeStore(store, options);
  }

  if (currentUsageResult && currentUsageResult.ok) {
    const lines = formatUsageDetail(currentUsageResult.response);
    if (lines.length === 0) {
      console.log("No usage data available for the current account.");
      return;
    }
    for (const line of lines) console.log(line);
    return;
  }
  if (currentUsageResult && currentUsageResult.code === "rate-limited") {
    console.log(
      "The quota-check API itself is rate-limited right now; try again later.",
    );
    return;
  }
  console.log("No usage data available for the current account.");
}

module.exports = { runUsageAction };
