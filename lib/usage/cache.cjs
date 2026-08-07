const fs = require("fs");
const os = require("os");
const path = require("path");

function getDefaultConfigDir() {
  return path.join(os.homedir(), ".gemini", "multi-account-switch");
}

function getSettingsPath() {
  return path.join(getDefaultConfigDir(), "settings.json");
}

function readSettings() {
  const p = getSettingsPath();
  if (!fs.existsSync(p)) return { showUsage: true };
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { showUsage: true };
  }
}

function writeSettings(settings, ensureDir) {
  const p = getSettingsPath();
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

module.exports = {
  getDefaultConfigDir,
  getSettingsPath,
  readSettings,
  writeSettings,
};
