const fs = require("fs");
const os = require("os");
const path = require("path");

function getDefaultGeminiDir() {
  return path.join(os.homedir(), ".gemini");
}

// CONFIRMED (2026-08-07, real second-account login test) as the one reliable
// live credential file. ~/.gemini/google_accounts.json and
// ~/.gemini/google_account_id were also tried but do NOT track the real
// active login (both stayed stale after logging into a different account) -
// deliberately not read or written here. See lib/auth/identity.cjs for how
// the account a live token belongs to is actually determined.
function getDefaultOauthTokenPath() {
  return path.join(
    getDefaultGeminiDir(),
    "antigravity-cli",
    "antigravity-oauth-token",
  );
}

function getDefaultStorePath() {
  return path.join(os.homedir(), ".AntigravityCLIMultiAccounts.json");
}

function getDefaultBackupDir() {
  return path.join(getDefaultGeminiDir(), "multi-account-switch", "backups");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    // JSON.parse error messages quote the source text, which for the oauth
    // token file would leak token fragments into console output.
    throw new Error(
      `Failed to parse ${path.basename(filePath)}: invalid JSON.`,
    );
  }
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return readJson(filePath);
}

function writeJsonAtomic(filePath, value, options = {}) {
  ensureDir(path.dirname(filePath));
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  // The rename transfers the temp file's mode onto the target, so the temp
  // file must inherit the target's permissions (0600 on POSIX for the oauth
  // token file) or they would be silently widened to the umask default.
  let mode = options.mode;
  try {
    mode = fs.statSync(filePath).mode & 0o777;
  } catch {
    // target does not exist yet; keep options.mode (or platform default)
  }
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(
      tempPath,
      payload,
      mode !== undefined ? { encoding: "utf8", mode } : "utf8",
    );
    if (mode !== undefined) {
      try {
        fs.chmodSync(tempPath, mode);
      } catch {}
    }
    fs.renameSync(tempPath, filePath);
  } catch {
    // Windows refuses the rename while another process holds the target open;
    // fall back to a direct overwrite rather than failing the switch. The
    // temp file must never linger - it may contain tokens.
    fs.rmSync(tempPath, { force: true });
    fs.writeFileSync(filePath, payload, "utf8");
    if (mode !== undefined) {
      try {
        fs.chmodSync(filePath, mode);
      } catch {}
    }
  }
}

function backupFile(filePath, backupDir) {
  if (!fs.existsSync(filePath)) return;
  ensureDir(backupDir);
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
  const base = path.basename(filePath);
  fs.copyFileSync(filePath, path.join(backupDir, `${base}.${timestamp}.bak`));

  // Retention is per source file: the backup dir is shared, and a global
  // keep-3 would let one file's backups evict another's within one switch.
  const backups = fs
    .readdirSync(backupDir)
    .filter((name) => name.startsWith(`${base}.`) && name.endsWith(".bak"))
    .sort()
    .reverse();

  for (const stale of backups.slice(3)) {
    fs.rmSync(path.join(backupDir, stale), { force: true });
  }
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function readLiveState(options) {
  const oauthToken = readJson(options.oauthTokenPath);
  return { oauthToken };
}

function writeLiveState(snapshot, options) {
  backupFile(options.oauthTokenPath, options.backupDir);
  writeJsonAtomic(options.oauthTokenPath, snapshot.oauthToken, { mode: 0o600 });
}

// agy itself may rewrite its oauth token file (e.g. while refreshing its own
// token), which would silently undo a switch. Reading the file back is the only
// way to know the swap actually took hold.
function verifyLiveState(options, expected) {
  let liveState;
  try {
    liveState = readLiveState(options);
  } catch (error) {
    return {
      ok: false,
      reason: `could not re-read the live oauth token file after writing (${error.message})`,
    };
  }
  const liveToken = liveState.oauthToken && liveState.oauthToken.token;
  if (!liveToken || liveToken.access_token !== expected.accessToken) {
    return {
      ok: false,
      reason:
        "the live oauth token no longer matches the token just written (a running agy session likely rewrote it)",
    };
  }
  return { ok: true };
}

function writeStore(store, options) {
  backupFile(options.storePath, options.backupDir);
  writeJsonAtomic(options.storePath, store);
}

module.exports = {
  getDefaultGeminiDir,
  getDefaultOauthTokenPath,
  getDefaultStorePath,
  getDefaultBackupDir,
  ensureDir,
  readJson,
  readJsonIfExists,
  writeJsonAtomic,
  backupFile,
  deepCopy,
  readLiveState,
  writeLiveState,
  verifyLiveState,
  writeStore,
};
