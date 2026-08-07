const { verifyLiveIdentity } = require("../auth/guard.cjs");

// `sub` is Google's stable per-account id (from the userinfo endpoint) -
// the closest analog to Claude's accountUuid, and preferred over email
// since it can't change. Email is kept only as a display/fallback field.
function getAccountKey(account) {
  if (account?.sub && String(account.sub).trim()) {
    return `sub:${String(account.sub).trim()}`;
  }
  if (account?.emailAddress && String(account.emailAddress).trim()) {
    return `email:${String(account.emailAddress).trim().toLowerCase()}`;
  }
  throw new Error("Account entry is missing both sub and emailAddress.");
}

function normalizeStore(store, storeVersion) {
  const normalized = store && typeof store === "object" ? store : {};
  if (!Array.isArray(normalized.accounts)) {
    normalized.accounts = [];
  }
  normalized.version = storeVersion;
  return normalized;
}

function getDisplayAccounts(store, currentMetadata) {
  const currentKey = currentMetadata ? getAccountKey(currentMetadata) : null;
  return store.accounts.map((entry, index) => ({
    ...entry,
    index,
    current: currentKey && getAccountKey(entry.metadata) === currentKey,
  }));
}

// `liveState` = { oauthToken, identity: { sub, email } | null }. `identity`
// must already be resolved by the caller (via lib/agy/auth/identity.cjs)
// before calling this - see the comment there for why it can't be read
// from a local file.
function syncStoreFromLive(store, liveState, deepCopy, storeVersion) {
  const identity = liveState && liveState.identity;
  if (!identity || !identity.sub) {
    throw new Error(
      "Could not resolve the live account identity (userinfo lookup failed or was not attempted).",
    );
  }
  const oauthToken = liveState.oauthToken;
  if (!oauthToken || !oauthToken.token || !oauthToken.token.access_token) {
    throw new Error("The Antigravity oauth token file has no usable token.");
  }

  const key = getAccountKey({
    sub: identity.sub,
    emailAddress: identity.email,
  });

  const verified = verifyLiveIdentity(liveState, store, getAccountKey);
  if (!verified.ok) {
    return {
      changed: false,
      store: normalizeStore(deepCopy(store), storeVersion),
      key,
      skipped: true,
      warning: verified.reason,
    };
  }

  const now = new Date().toISOString();
  const existingEntry = store.accounts?.find((e) => e.key === key);
  const snapshot = {
    key,
    metadata: {
      sub: identity.sub,
      emailAddress:
        identity.email || existingEntry?.metadata?.emailAddress || undefined,
    },
    credentials: { oauthToken: deepCopy(oauthToken) },
    capturedAt: now,
    lastSyncedAt: now,
    lastUsedAt: existingEntry?.lastUsedAt || undefined,
    alias: existingEntry?.alias || undefined,
    usageSnapshot: existingEntry?.usageSnapshot || undefined,
  };

  const nextStore = normalizeStore(deepCopy(store), storeVersion);
  const existingIndex = nextStore.accounts.findIndex(
    (entry) => entry.key === key,
  );
  if (existingIndex >= 0) {
    nextStore.accounts[existingIndex] = snapshot;
  } else {
    nextStore.accounts.push(snapshot);
  }

  nextStore.updatedAt = now;

  return {
    changed: JSON.stringify(store) !== JSON.stringify(nextStore),
    store: nextStore,
    key,
  };
}

function findSelection(accounts, selector) {
  const trimmed = selector.trim();
  if (!trimmed) {
    throw new Error("Selector cannot be empty.");
  }

  const numeric = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(numeric) && String(numeric) === trimmed) {
    const byIndex = accounts.find((entry) => Number(entry.index) === numeric);
    if (byIndex) return byIndex;
  }

  throw new Error(
    `No account matched index '${trimmed}'. Use a numeric index.`,
  );
}

function removeStoredAccount(store, removeIndex) {
  if (
    typeof removeIndex !== "number" ||
    removeIndex < 0 ||
    removeIndex >= store.accounts.length
  ) {
    throw new Error(
      `Invalid account index. Use an index between 0 and ${store.accounts.length - 1}.`,
    );
  }
  const removed = store.accounts.splice(removeIndex, 1)[0];
  store.accounts.forEach((entry, i) => {
    entry.index = i;
  });
  return removed;
}

module.exports = {
  getAccountKey,
  normalizeStore,
  getDisplayAccounts,
  syncStoreFromLive,
  findSelection,
  removeStoredAccount,
};
