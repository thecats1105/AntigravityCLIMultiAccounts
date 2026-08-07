const test = require("node:test");
const assert = require("node:assert");
const {
  classifyGroups,
  formatUsageDetail,
  toUsageSnapshot,
  getUsageColumns,
  refreshStoredUsageSnapshots,
} = require("../lib/usage/format.cjs");

const FUTURE_5H = new Date(Date.now() + 4.5 * 3600 * 1000).toISOString();
const FUTURE_WEEKLY = new Date(
  Date.now() + 6.5 * 24 * 3600 * 1000,
).toISOString();

// Captured live (2026-08-07) from a real account via
// cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary - this is
// the confirmed real shape, not a guess.
function realCapturedResponse() {
  return {
    groups: [
      {
        buckets: [
          {
            bucketId: "gemini-weekly",
            displayName: "Weekly Limit",
            window: "weekly",
            resetTime: "2026-08-14T06:43:50Z",
            remainingFraction: 0.9949204,
          },
          {
            bucketId: "gemini-5h",
            displayName: "Five Hour Limit",
            window: "5h",
            resetTime: "2026-08-07T19:30:42Z",
            remainingFraction: 0.9868293,
          },
        ],
        displayName: "Gemini Models",
        description: "Models within this group: Gemini Flash, Gemini Pro",
      },
      {
        buckets: [
          {
            bucketId: "3p-weekly",
            displayName: "Weekly Limit",
            window: "weekly",
            resetTime: "2026-08-14T14:59:56Z",
            remainingFraction: 1,
          },
          {
            bucketId: "3p-5h",
            displayName: "Five Hour Limit",
            window: "5h",
            resetTime: "2026-08-07T19:59:56Z",
            remainingFraction: 1,
          },
        ],
        displayName: "Claude and GPT models",
        description:
          "Models within this group: Claude Opus, Claude Sonnet, GPT-OSS",
      },
    ],
  };
}

function syntheticSplitResponse() {
  return {
    groups: [
      {
        groupName: "gemini-models",
        displayName: "Gemini",
        buckets: [
          {
            bucketId: "gemini-5h",
            window: "5h",
            remainingFraction: 0.82,
            resetTime: FUTURE_5H,
          },
          {
            bucketId: "gemini-weekly",
            window: "weekly",
            remainingFraction: 0.6,
            resetTime: FUTURE_WEEKLY,
          },
        ],
      },
      {
        groupName: "external-models",
        displayName: "Claude and GPT models",
        buckets: [
          {
            bucketId: "3p-5h",
            window: "5h",
            remainingFraction: 0.4,
            resetTime: FUTURE_5H,
          },
          {
            bucketId: "3p-weekly",
            window: "weekly",
            remainingFraction: 0.1,
            resetTime: FUTURE_WEEKLY,
          },
        ],
      },
    ],
  };
}

function creditsVariantResponse() {
  return {
    groups: [
      {
        displayName: "Anthropic Claude",
        buckets: [
          {
            bucketId: "3p-5h",
            window: "5h",
            displayName: "credits",
            remainingCredits: 1200,
            resetTime: FUTURE_5H,
          },
        ],
      },
    ],
  };
}

function unrecognizedShapeResponse() {
  return { somethingElse: { nested: true } };
}

test("classifyGroups: splits gemini vs external(claude/gpt) using the real captured response shape", () => {
  const classified = classifyGroups(realCapturedResponse());
  assert.strictEqual(classified.gemini.length, 1);
  assert.strictEqual(classified.external.length, 1);
  assert.strictEqual(classified.other.length, 0);
  assert.strictEqual(classified.gemini[0].buckets.length, 2);
});

test("classifyGroups: unrecognized top-level shape -> all buckets empty, no throw", () => {
  const classified = classifyGroups(unrecognizedShapeResponse());
  assert.deepStrictEqual(classified, { gemini: [], external: [], other: [] });
});

test("formatUsageDetail: synthetic split with distinct 5h/weekly values renders both windows correctly", () => {
  const lines = formatUsageDetail(syntheticSplitResponse());
  assert.deepStrictEqual(lines.slice(0, 1), ["Gemini:"]);
  assert.match(lines[1], /^ {2}5h remaining\/reset: 82\.0% \/ .+$/);
  assert.match(lines[2], /^ {2}7d remaining\/reset: 60\.0% \/ .+$/);
  assert.deepStrictEqual(lines.slice(3, 4), ["Other(Claude/GPT):"]);
  assert.match(lines[4], /^ {2}5h remaining\/reset: 40\.0% \/ .+$/);
  assert.match(lines[5], /^ {2}7d remaining\/reset: 10\.0% \/ .+$/);
});

test("formatUsageDetail: remaining_credits oneof variant -> external block with credits count", () => {
  const lines = formatUsageDetail(creditsVariantResponse());
  assert.deepStrictEqual(lines, [
    "Other(Claude/GPT):",
    "  5h remaining/reset: 1200 credits / " +
      new Date(FUTURE_5H).toLocaleString(),
  ]);
});

test('formatUsageDetail: real captured response -> per-category "5h/7d remaining/reset: X% / <date>" block', () => {
  const lines = formatUsageDetail(realCapturedResponse());
  assert.deepStrictEqual(lines.slice(0, 1), ["Gemini:"]);
  assert.match(lines[1], /^ {2}5h remaining\/reset: 98\.7% \/ .+$/);
  assert.match(lines[2], /^ {2}7d remaining\/reset: 99\.5% \/ .+$/);
  assert.deepStrictEqual(lines.slice(3, 4), ["Other(Claude/GPT):"]);
  assert.match(lines[4], /^ {2}5h remaining\/reset: 100\.0% \/ .+$/);
  assert.match(lines[5], /^ {2}7d remaining\/reset: 100\.0% \/ .+$/);
});

test("formatUsageDetail: unrecognized shape -> empty array (caller omits the --- Usage --- block entirely)", () => {
  assert.deepStrictEqual(formatUsageDetail(unrecognizedShapeResponse()), []);
});

test("toUsageSnapshot + getUsageColumns: round-trips 5h/weekly through a stored account entry, one column per window", () => {
  const snapshot = toUsageSnapshot(syntheticSplitResponse());
  assert.strictEqual(snapshot.gemini.fiveHour.remaining, "82%");
  assert.strictEqual(snapshot.gemini.weekly.remaining, "60%");
  assert.strictEqual(snapshot.external.fiveHour.remaining, "40%");
  assert.strictEqual(snapshot.external.weekly.remaining, "10%");
  const columns = getUsageColumns({ usageSnapshot: snapshot });
  assert.strictEqual(columns.length, 2);
  assert.match(columns[0], /^Gemini 5H:82% \(.+\) \/ Other 5H:40% \(.+\)$/);
  assert.match(columns[1], /^Gemini 7D:60% \(.+\) \/ Other 7D:10% \(.+\)$/);
});

test("toUsageSnapshot: unrecognized shape -> null (no data to persist)", () => {
  assert.strictEqual(toUsageSnapshot(unrecognizedShapeResponse()), null);
});

test("getUsageColumns: no snapshot yet -> null", () => {
  assert.strictEqual(getUsageColumns({}), null);
});

test("refreshStoredUsageSnapshots: updates snapshots for accounts with an access token, skips others, never throws on per-account failure", async () => {
  const store = {
    accounts: [
      {
        key: "sub:1",
        credentials: { oauthToken: { token: { access_token: "tok-1" } } },
      },
      {
        key: "sub:2",
        credentials: { oauthToken: { token: { access_token: "tok-2" } } },
      },
      { key: "sub:3", credentials: {} },
    ],
  };

  const fetchUsage = async (accessToken) => {
    if (accessToken === "tok-1")
      return { ok: true, response: realCapturedResponse() };
    if (accessToken === "tok-2") return { ok: false, code: "rate-limited" };
    throw new Error("should not be called for accounts without a token");
  };

  const { currentUsageResult, changed } = await refreshStoredUsageSnapshots(
    store,
    "sub:1",
    fetchUsage,
  );

  assert.strictEqual(changed, true);
  assert.strictEqual(currentUsageResult.ok, true);
  assert.ok(store.accounts[0].usageSnapshot);
  assert.strictEqual(store.accounts[1].usageSnapshot, undefined);
  assert.strictEqual(store.accounts[2].usageSnapshot, undefined);
});
