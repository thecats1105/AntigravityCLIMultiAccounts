#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function backupFile(filePath, backupDir) {
  if (!fs.existsSync(filePath)) return;
  ensureDir(backupDir);
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
  fs.copyFileSync(
    filePath,
    path.join(backupDir, `${path.basename(filePath)}.${timestamp}.bak`),
  );
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// Mirrors the install-time PATH entry so uninstalling leaves no trace.
function removeUserPathEntry(dir) {
  if (process.platform !== "win32") return { changed: false };
  try {
    const query = execFileSync(
      "reg",
      ["query", "HKCU\\Environment", "/v", "Path"],
      { encoding: "utf8", windowsHide: true },
    );
    const match = query.match(/Path\s+REG(_EXPAND)?_SZ\s+(.*)/i);
    if (!match) return { changed: false };
    const normalized = dir.replace(/\\+$/, "").toLowerCase();
    const entries = match[2]
      .trim()
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    const kept = entries.filter(
      (entry) => entry.replace(/\\+$/, "").toLowerCase() !== normalized,
    );
    if (kept.length === entries.length) return { changed: false };
    const type = match[1] ? "REG_EXPAND_SZ" : "REG_SZ";
    execFileSync(
      "reg",
      ["add", "HKCU\\Environment", "/v", "Path", "/t", type, "/d", kept.join(";"), "/f"],
      { windowsHide: true },
    );
    return { changed: true };
  } catch {
    return { changed: false };
  }
}

function uninstallCommands() {
  const home = os.homedir();
  const geminiDir = path.join(home, ".gemini");
  const installRoot = path.join(geminiDir, "multi-account-switch");
  const userBinDir =
    process.platform === "win32"
      ? path.join(home, "bin")
      : path.join(home, ".local", "bin");
  const hooksConfigPath = path.join(geminiDir, "config", "hooks.json");
  const backupDir = path.join(installRoot, "backups", "installer");
  const sessionStartTarget = path.join(
    installRoot,
    "hooks",
    "ag-session-start.cjs",
  );
  const startupHookCommand =
    process.platform === "win32"
      ? `node "${sessionStartTarget}"`
      : `node '${sessionStartTarget}'`;

  if (fs.existsSync(hooksConfigPath)) {
    backupFile(hooksConfigPath, backupDir);
    const hooksConfig = readJson(hooksConfigPath, {});
    const group = hooksConfig["antigravity-multi-account-switch"];
    if (group && Array.isArray(group.SessionStart)) {
      group.SessionStart = group.SessionStart.filter(
        (hook) =>
          !(
            hook &&
            hook.type === "command" &&
            hook.command === startupHookCommand
          ),
      );
      if (group.SessionStart.length === 0) {
        delete hooksConfig["antigravity-multi-account-switch"];
      } else {
        hooksConfig["antigravity-multi-account-switch"] = group;
      }
      writeJson(hooksConfigPath, hooksConfig);
    }
  }

  for (const name of [
    "ag-switch",
    "ag-sync-oauth",
    "ags",
    "agso",
    "ag-switch.cmd",
    "ag-sync-oauth.cmd",
    "ags.cmd",
    "agso.cmd",
  ]) {
    const target = path.join(userBinDir, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  }

  if (removeUserPathEntry(userBinDir).changed) {
    console.log(`Removed ${userBinDir} from your user PATH.`);
  }

  if (fs.existsSync(installRoot)) {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }

  console.log("Uninstalled Antigravity CLI Multi-Account Switcher.");
}

uninstallCommands();
