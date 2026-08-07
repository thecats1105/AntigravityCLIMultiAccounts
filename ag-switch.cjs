#!/usr/bin/env node

const path = require('path');
const storeIo = require('./lib/store/io.cjs');
const storeAccounts = require('./lib/store/accounts.cjs');
const outputAccounts = require('./lib/output/accounts.cjs');
const outputMessages = require('./lib/output/messages.cjs');
const syncAction = require('./lib/actions/sync.cjs');
const removeAction = require('./lib/actions/remove.cjs');
const listAction = require('./lib/actions/list.cjs');
const switchAction = require('./lib/actions/switch.cjs');
const renameAction = require('./lib/actions/rename.cjs');
const authGuard = require('./lib/auth/guard.cjs');
const authRefresh = require('./lib/auth/refresh.cjs');
const authIdentity = require('./lib/auth/identity.cjs');
const procSessions = require('./lib/proc/sessions.cjs');

const {
  getDefaultOauthTokenPath,
  getDefaultStorePath,
  getDefaultBackupDir,
  readJsonIfExists,
  deepCopy,
  readLiveState,
  writeLiveState,
  writeStore,
} = storeIo;

const {
  normalizeStore,
  getDisplayAccounts,
  syncStoreFromLive,
  findSelection,
  removeStoredAccount,
} = storeAccounts;

const getEntryLabelUi = outputAccounts.getEntryLabel;
const formatAccountSummaryUi = outputAccounts.formatAccountSummary;
const formatRelativeTimeUi = outputAccounts.formatRelativeTime;

const getListGuidance = outputMessages.getListGuidance;
const getRestartNotice = outputMessages.getRestartNotice;
const getAvailableAccountsHeading = outputMessages.getAvailableAccountsHeading;
const getStoredAccountsHeading = outputMessages.getStoredAccountsHeading;
const getRemainingAccountsHeading = outputMessages.getRemainingAccountsHeading;

const runSyncAction = syncAction.runSyncAction;
const runRemoveAction = removeAction.runRemoveAction;
const runListAction = listAction.runListAction;
const runSwitchAction = switchAction.runSwitchAction;
const runRenameAction = renameAction.runRenameAction;

const STORE_VERSION = '0.2.0';

function formatAccountSummary(items) {
  return formatAccountSummaryUi(items, { formatRelativeTime: formatRelativeTimeUi });
}

function parseArgs(argv) {
  const options = {
    usageCommand: 'ag-switch',
    oauthTokenPath: getDefaultOauthTokenPath(),
    storePath: getDefaultStorePath(),
    backupDir: getDefaultBackupDir(),
    syncOnly: false,
    touchCurrentOnly: false,
    removeOnly: false,
    removeIndex: null,
    renameOnly: false,
    renameIndex: null,
    renameAliasParts: [],
    selector: '',
    // Test-only escape hatch: skip the real Google userinfo network call and
    // use a fixed identity instead. Not documented as user-facing.
    liveIdentityOverride: null,
  };

  const args = [...argv];
  while (args.length > 0) {
    const current = args.shift();
    if (current === '--usage-command') {
      options.usageCommand = args.shift() || options.usageCommand;
      continue;
    }
    if (current === '--oauth-token') {
      options.oauthTokenPath = args.shift() || options.oauthTokenPath;
      continue;
    }
    if (current === '--live-identity') {
      options.liveIdentityOverride = JSON.parse(args.shift() || '{}');
      continue;
    }
    if (current === '--store') {
      options.storePath = args.shift() || options.storePath;
      continue;
    }
    if (current === '--backup-dir') {
      options.backupDir = args.shift() || options.backupDir;
      continue;
    }
    if (current === '--sync' || current === 'sync') {
      options.syncOnly = true;
      continue;
    }
    if (current === '--touch-current') {
      options.touchCurrentOnly = true;
      continue;
    }
    if (current === '--remove' || current === 'remove') {
      options.removeOnly = true;
      continue;
    }
    if (current === '--rename' || current === 'rename') {
      options.renameOnly = true;
      continue;
    }
    if (options.removeOnly && options.removeIndex === null) {
      const numeric = Number.parseInt(current, 10);
      if (!Number.isNaN(numeric) && String(numeric) === current) {
        options.removeIndex = numeric;
        continue;
      }
    }
    if (options.renameOnly) {
      if (options.renameIndex === null) {
        const numeric = Number.parseInt(current, 10);
        if (!Number.isNaN(numeric) && String(numeric) === current) {
          options.renameIndex = numeric;
          continue;
        }
      }
      options.renameAliasParts.push(current);
      continue;
    }
    if (!options.selector) {
      options.selector = current;
      continue;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  try {
    const liveState = readLiveState(options);
    // The live account's identity cannot be read from a local file -
    // google_accounts.json/google_account_id were tested and don't track
    // the real login state. Resolve it against Google directly instead.
    liveState.identity = options.liveIdentityOverride
      || await authIdentity.fetchLiveIdentity(liveState.oauthToken?.token?.access_token);

    const existingStore = normalizeStore(readJsonIfExists(options.storePath, { version: STORE_VERSION, accounts: [] }), STORE_VERSION);

    if (options.syncOnly) {
      runSyncAction(existingStore, liveState, {
        syncStoreFromLive,
        deepCopy,
        storeVersion: STORE_VERSION,
        writeStore,
        options,
        path,
      });
      return;
    }

    if (options.touchCurrentOnly) {
      const syncedTouch = syncStoreFromLive(existingStore, liveState, deepCopy, STORE_VERSION);
      const storeTouch = syncedTouch.store;
      const idx = storeTouch.accounts.findIndex((e) => e.key === syncedTouch.key);
      if (idx >= 0) {
        storeTouch.accounts[idx].lastUsedAt = new Date().toISOString();
      }
      writeStore(storeTouch, options);
      return;
    }

    if (options.removeOnly) {
      runRemoveAction(existingStore, options.removeIndex, {
        removeStoredAccount,
        writeStore,
        options,
        getEntryLabel: getEntryLabelUi,
        getRemainingAccountsHeading,
      });
      return;
    }

    if (options.renameOnly) {
      runRenameAction(existingStore, options.renameIndex, options.renameAliasParts.join(' '), {
        writeStore,
        options,
        liveState,
        getEntryLabel: getEntryLabelUi,
        getDisplayAccounts,
        getStoredAccountsHeading,
        formatAccountSummary,
      });
      return;
    }

    const synced = syncStoreFromLive(existingStore, liveState, deepCopy, STORE_VERSION);
    if (synced.warning) {
      console.log(outputMessages.getSyncSkippedWarning(synced.warning));
    }
    const store = synced.store;
    const currentMetadata = { sub: liveState.identity.sub, emailAddress: liveState.identity.email };
    const accounts = getDisplayAccounts(store, currentMetadata);

    if (!options.selector) {
      await runListAction({
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
      });
      return;
    }

    const selected = findSelection(accounts, options.selector);
    await runSwitchAction({
      selected,
      store,
      options,
      deepCopy,
      writeLiveState,
      writeStore,
      assessCredentials: authGuard.assessCredentials,
      refreshToken: authRefresh.refreshToken,
      detectAgySessions: procSessions.detectAgySessions,
      now: () => Date.now(),
      messages: outputMessages,
      getDisplayAccounts,
      getEntryLabel: getEntryLabelUi,
      getRestartNotice,
      getStoredAccountsHeading,
      formatAccountSummary,
    });
  } catch (error) {
    console.log(`Switch failed: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
