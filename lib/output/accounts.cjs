function formatRelativeTime(isoString) {
  if (!isoString) return 'never';
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getPreferredDisplayName(metadata) {
  if (metadata?.emailAddress && String(metadata.emailAddress).trim()) {
    const email = String(metadata.emailAddress).trim();
    const atIndex = email.indexOf('@');
    return atIndex > 0 ? email.slice(0, atIndex) : email;
  }
  return '(no email)';
}

function getEntryLabel(entry) {
  const alias = entry && entry.alias ? String(entry.alias).trim() : '';
  if (alias) return alias;
  return getPreferredDisplayName((entry && entry.metadata) || {});
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function formatAccountSummary(accounts, deps) {
  const { formatRelativeTime } = deps;
  return accounts.map((entry) => {
    const marker = entry.current ? '*' : ' ';
    const displayName = truncate(getEntryLabel(entry), 24);
    const email = (entry.metadata && entry.metadata.emailAddress) || '(no email)';
    const lastUsed = formatRelativeTime(entry.lastUsedAt);
    return `${marker} [${entry.index}] ${displayName} <${email}> | used:${lastUsed}`;
  });
}

module.exports = {
  formatRelativeTime,
  getPreferredDisplayName,
  getEntryLabel,
  formatAccountSummary,
};
