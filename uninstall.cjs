#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function backupFile(filePath, backupDir) {
  if (!fs.existsSync(filePath)) return;
  ensureDir(backupDir);
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  fs.copyFileSync(filePath, path.join(backupDir, `${path.basename(filePath)}.${timestamp}.bak`));
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function uninstallCommands() {
  const home = os.homedir();
  const geminiDir = path.join(home, '.gemini');
  const installRoot = path.join(geminiDir, 'multi-account-switch');
  const userBinDir = process.platform === 'win32' ? path.join(home, 'bin') : path.join(home, '.local', 'bin');
  const hooksConfigPath = path.join(geminiDir, 'config', 'hooks.json');
  const backupDir = path.join(installRoot, 'backups', 'installer');
  const sessionStartTarget = path.join(installRoot, 'hooks', 'ag-session-start.cjs');
  const startupHookCommand = process.platform === 'win32'
    ? `node "${sessionStartTarget}"`
    : `node '${sessionStartTarget}'`;

  if (fs.existsSync(hooksConfigPath)) {
    backupFile(hooksConfigPath, backupDir);
    const hooksConfig = readJson(hooksConfigPath, {});
    const group = hooksConfig['antigravity-multi-account-switch'];
    if (group && Array.isArray(group.SessionStart)) {
      group.SessionStart = group.SessionStart.filter(
        (hook) => !(hook && hook.type === 'command' && hook.command === startupHookCommand),
      );
      if (group.SessionStart.length === 0) {
        delete hooksConfig['antigravity-multi-account-switch'];
      } else {
        hooksConfig['antigravity-multi-account-switch'] = group;
      }
      writeJson(hooksConfigPath, hooksConfig);
    }
  }

  for (const name of ['ag-switch', 'ag-sync-oauth', 'ags', 'agso', 'ag-switch.cmd', 'ag-sync-oauth.cmd', 'ags.cmd', 'agso.cmd']) {
    const target = path.join(userBinDir, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  }

  if (fs.existsSync(installRoot)) {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }

  console.log('Uninstalled Antigravity CLI Multi-Account Switcher.');
}

uninstallCommands();
