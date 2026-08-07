function getListGuidance(usageCommand) {
  return [
    `Run ${usageCommand} <index> to make one of these stored entries the active Antigravity account.`,
    `Run ${usageCommand} --remove <index> to remove a stored account.`,
  ];
}

function getRestartNotice() {
  return "Note: Restart Antigravity CLI (agy) to apply the account change.";
}

function getAvailableAccountsHeading() {
  return "Available Antigravity accounts:";
}

function getStoredAccountsHeading() {
  return "Stored account list:";
}

function getRemainingAccountsHeading() {
  return "Remaining accounts:";
}

function getRunningSessionsWarning(count) {
  return `Warning: ${count} running Antigravity CLI process(es) detected. They may rewrite credentials after the switch; close them and restart agy once the switch completes.`;
}

function getRefreshProgress(index) {
  return `Stored access token for [${index}] is expired or expiring soon - refreshing...`;
}

function getRefreshSuccess() {
  return "Token refreshed.";
}

// A failed refresh here does NOT abort the switch - our refresh
// implementation is unverified, so the safer default is to restore the
// stored token as-is and let agy re-authenticate if it truly needs to.
function getRefreshSkipped(reason) {
  return `Warning: could not refresh the stored access token (${reason}). Restoring it as-is; agy may prompt you to re-authenticate.`;
}

function getSwitchAbortedLines(abort, label, usageCommand) {
  const lines = [];
  if (abort.code === "refresh-expired" || abort.code === "revoked") {
    lines.push(
      `Switch aborted: the stored credentials for ${label} are no longer usable (${abort.reason}).`,
    );
    lines.push("Your current live login was left untouched.");
    lines.push(
      `Recover that account by logging into it in Antigravity CLI, then run '${usageCommand} sync' to re-capture it.`,
    );
  } else {
    lines.push(`Switch aborted: ${abort.reason}.`);
    lines.push("Your current live login was left untouched.");
  }
  return lines;
}

function getSyncSkippedWarning(reason) {
  return `Warning: ${reason}`;
}

module.exports = {
  getListGuidance,
  getRestartNotice,
  getAvailableAccountsHeading,
  getStoredAccountsHeading,
  getRemainingAccountsHeading,
  getRunningSessionsWarning,
  getRefreshProgress,
  getRefreshSuccess,
  getRefreshSkipped,
  getSwitchAbortedLines,
  getSyncSkippedWarning,
};
