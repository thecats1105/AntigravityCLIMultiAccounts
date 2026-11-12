// Response shape CONFIRMED live (2026-08-07) against a real account via
// lib/usage/fetch.cjs's cloudcode-pa.googleapis.com quota endpoint:
//   { groups: [ { displayName, buckets: [ { bucketId, displayName, window,
//       resetTime, remainingFraction } ] } ] }
// Each group carries two buckets - one with window:"5h", one with
// window:"weekly" - directly analogous to the original Claude tool's
// five_hour/seven_day split. Real bucketId values seen: "gemini-5h",
// "gemini-weekly" for the native Gemini group, "3p-5h", "3p-weekly" for the
// "Claude and GPT models" group ("3p" = third-party). Despite this being
// confirmed for this account, still probe a couple of key-name variants and
// degrade gracefully - the shape could differ for other account tiers.
const GROUP_KEYS = [
  "groups",
  "quotaSummaryGroups",
  "summaryGroups",
  "quotaGroups",
];
const BUCKET_KEYS = ["buckets", "quotaSummaryBuckets", "summaryBuckets"];
const EXTERNAL_KEYWORDS = ["claude", "anthropic", "gpt", "openai", "3p"];
const GEMINI_KEYWORDS = ["gemini"];

function pickFirstArray(obj, keys) {
  for (const key of keys) {
    if (Array.isArray(obj && obj[key])) return obj[key];
  }
  return [];
}

function classifyLabel(text) {
  const lower = String(text || "").toLowerCase();
  if (EXTERNAL_KEYWORDS.some((kw) => lower.includes(kw))) return "external";
  if (GEMINI_KEYWORDS.some((kw) => lower.includes(kw))) return "gemini";
  return "other";
}

// Returns { gemini: [{name, buckets}], external: [...], other: [...] } -
// groups with no buckets are dropped, everything else is kept (including
// unrecognized groups under "other") so nothing is silently hidden if the
// classification heuristic misses.
function classifyGroups(response) {
  const result = { gemini: [], external: [], other: [] };
  for (const group of pickFirstArray(response, GROUP_KEYS)) {
    const buckets = pickFirstArray(group, BUCKET_KEYS);
    if (buckets.length === 0) continue;
    const classifyText = [
      group.groupName,
      group.displayName,
      ...buckets.map((b) => b.bucketId),
    ].join(" ");
    const label = classifyLabel(classifyText);
    result[label].push({
      name: group.displayName || group.groupName || "unnamed",
      buckets,
    });
  }
  return result;
}

// Picks the 5h and weekly buckets out of a group's bucket list by `window`
// when present, falling back to positional buckets[0]/[1] otherwise.
function pickWindowBuckets(buckets) {
  const byWindow = (window) =>
    buckets.find((b) => String(b.window || "").toLowerCase() === window);
  return {
    fiveHour: byWindow("5h") || buckets[0] || null,
    weekly: byWindow("weekly") || byWindow("7d") || buckets[1] || null,
  };
}

function formatBucketRemaining(bucket) {
  if (!bucket) return "?";
  if (typeof bucket.remainingFraction === "number") {
    const pct =
      bucket.remainingFraction <= 1
        ? bucket.remainingFraction * 100
        : bucket.remainingFraction;
    return `${Math.round(pct)}%`;
  }
  if (typeof bucket.remainingAmount === "number")
    return `${bucket.remainingAmount} left`;
  if (typeof bucket.remainingBudget === "number")
    return `${bucket.remainingBudget} left`;
  if (
    Array.isArray(bucket.remainingCredits) &&
    bucket.remainingCredits.length
  ) {
    return `${bucket.remainingCredits[0]} credits`;
  }
  if (typeof bucket.remainingCredits === "number")
    return `${bucket.remainingCredits} credits`;
  return "?";
}

function formatDateTime(dateLike) {
  if (!dateLike) return "unknown";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleString();
}

function formatBucketPercent(bucket) {
  if (!bucket) return null;
  if (typeof bucket.remainingFraction === "number") {
    const pct =
      bucket.remainingFraction <= 1
        ? bucket.remainingFraction * 100
        : bucket.remainingFraction;
    return `${pct.toFixed(1)}%`;
  }
  return formatBucketRemaining(bucket);
}

// Detailed "5h remaining/reset: 78.0% / 8/8/2026, 4:30:00 AM" style block for
// the CURRENT account, ported from the original Claude Code tool's usage
// display - split per category (Gemini / Other) since, unlike the original
// single-provider tool, this account has two independent quota windows
// rather than one blended figure.
function formatCategoryDetail(label, groups) {
  if (!groups.length) return [];
  const { fiveHour, weekly } = pickWindowBuckets(groups[0].buckets);
  const lines = [];
  if (label) lines.push(`${label}:`);
  if (fiveHour)
    lines.push(
      `  5h remaining/reset: ${formatBucketPercent(fiveHour)} / ${formatDateTime(fiveHour.resetTime)}`,
    );
  if (weekly)
    lines.push(
      `  7d remaining/reset: ${formatBucketPercent(weekly)} / ${formatDateTime(weekly.resetTime)}`,
    );
  return lines;
}

function formatUsageDetail(response) {
  const classified = classifyGroups(response);
  const lines = [
    ...formatCategoryDetail("Gemini", classified.gemini),
    ...formatCategoryDetail("Other(Claude/GPT)", classified.external),
  ];
  for (const group of classified.other) {
    lines.push(...formatCategoryDetail(group.name, [group]));
  }
  return lines;
}

function toBucketSnapshot(bucket) {
  if (!bucket) return undefined;
  return {
    remaining: formatBucketRemaining(bucket),
    resetsAt: bucket.resetTime || null,
  };
}

function toUsageSnapshot(response) {
  const classified = classifyGroups(response);
  const geminiBuckets =
    classified.gemini[0] && pickWindowBuckets(classified.gemini[0].buckets);
  const externalBuckets =
    classified.external[0] && pickWindowBuckets(classified.external[0].buckets);
  if (!geminiBuckets && !externalBuckets) return null;
  return {
    gemini: geminiBuckets
      ? {
          fiveHour: toBucketSnapshot(geminiBuckets.fiveHour),
          weekly: toBucketSnapshot(geminiBuckets.weekly),
        }
      : undefined,
    external: externalBuckets
      ? {
          fiveHour: toBucketSnapshot(externalBuckets.fiveHour),
          weekly: toBucketSnapshot(externalBuckets.weekly),
        }
      : undefined,
    fetchedAt: new Date().toISOString(),
  };
}

function formatDurationUntil(dateLike) {
  if (!dateLike) return "unknown";
  const resetAt = new Date(dateLike).getTime();
  if (Number.isNaN(resetAt)) return "unknown";
  const diff = resetAt - Date.now();
  if (diff <= 0) return "now";
  const totalHours = Math.floor(diff / 3600000);
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${days}D ${hours}h`;
  }
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `~${totalHours}h ${minutes}min`;
}

// e.g. "Gemini 5H:99% (~4h 29min)" - countdown is computed at render time
// from the stored resetsAt timestamp, not frozen at fetch time.
function formatWindowSegment(categoryLabel, windowLabel, bucket) {
  if (!bucket) return null;
  return `${categoryLabel} ${windowLabel}:${bucket.remaining} (${formatDurationUntil(bucket.resetsAt)})`;
}

function formatWindowColumn(windowLabel, geminiBucket, externalBucket) {
  const parts = [
    formatWindowSegment("Gemini", windowLabel, geminiBucket),
    formatWindowSegment("Other", windowLabel, externalBucket),
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

function parseRemainingPercent(remaining) {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(String(remaining || ""));
  return match ? Number(match[1]) : null;
}

// A bucket whose reset time has already passed has rolled over, so its stored
// "remaining" is stale. Only percentage figures can be settled: absolute
// amounts have no known full value to roll back to.
function settleBucket(bucket, now) {
  if (!bucket || !bucket.resetsAt) return bucket;
  const resetAt = new Date(bucket.resetsAt).getTime();
  if (Number.isNaN(resetAt) || resetAt > now) return bucket;
  if (parseRemainingPercent(bucket.remaining) === null) return bucket;
  return { ...bucket, remaining: "100%" };
}

// Usage as it stands now rather than when it was fetched: a rolled-over window
// is back to full, and an exhausted weekly window blocks the 5h one too.
function getEffectiveWindows(category, now = Date.now()) {
  if (!category) return { fiveHour: undefined, weekly: undefined };
  const weekly = settleBucket(category.weekly, now);
  const weeklyRemaining = weekly ? parseRemainingPercent(weekly.remaining) : null;
  const fiveHour =
    weeklyRemaining !== null && weeklyRemaining <= 0
      ? weekly
      : settleBucket(category.fiveHour, now);
  return { fiveHour, weekly };
}

// Returns one column string per quota window (5H, 7D), each combining
// Gemini and Other(Claude/GPT) figures side by side - e.g.
// ["Gemini 5H:99% (~4h 29min) / Other 5H:100% (now)", "Gemini 7D:... / Other 7D:..."]
// - or null if no usage data has been fetched for this account yet.
function getUsageColumns(entry) {
  const usage = entry && entry.usageSnapshot;
  if (!usage) return null;
  const gemini = getEffectiveWindows(usage.gemini);
  const external = getEffectiveWindows(usage.external);
  const columns = [
    formatWindowColumn("5H", gemini.fiveHour, external.fiveHour),
    formatWindowColumn("7D", gemini.weekly, external.weekly),
  ].filter(Boolean);
  return columns.length ? columns : null;
}

// Refreshes every stored account's cached usage snapshot, best-effort - a
// failure for one account never stops the others, and a failure never
// clears a previously-known-good snapshot.
async function refreshStoredUsageSnapshots(store, currentKey, fetchUsage) {
  let currentUsageResult = null;
  let changed = false;
  for (const entry of store.accounts) {
    const accessToken =
      entry.credentials &&
      entry.credentials.oauthToken &&
      entry.credentials.oauthToken.token
        ? entry.credentials.oauthToken.token.access_token
        : undefined;
    if (!accessToken) continue;
    const result = await fetchUsage(accessToken);
    if (entry.key === currentKey) currentUsageResult = result;
    if (!result.ok) continue;
    const nextSnapshot = toUsageSnapshot(result.response);
    if (!nextSnapshot) continue;
    const idx = store.accounts.findIndex((e) => e.key === entry.key);
    if (idx >= 0) {
      const before = JSON.stringify(store.accounts[idx].usageSnapshot || null);
      const after = JSON.stringify(nextSnapshot);
      if (before !== after) {
        store.accounts[idx].usageSnapshot = nextSnapshot;
        changed = true;
      }
    }
  }
  return { currentUsageResult, changed };
}

module.exports = {
  classifyGroups,
  formatBucketRemaining,
  formatUsageDetail,
  toUsageSnapshot,
  getUsageColumns,
  getEffectiveWindows,
  refreshStoredUsageSnapshots,
};
