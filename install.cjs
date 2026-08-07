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

function writeFileExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
}

function isAntigravityCliDetected() {
  return fs.existsSync(path.join(os.homedir(), '.gemini', 'antigravity-cli'));
}

function installCommands() {
  if (!isAntigravityCliDetected()) {
    console.log('Antigravity CLI not detected (~/.gemini/antigravity-cli not found). Nothing to install.');
    console.log('Run `agy` once to log in, then re-run this installer.');
    return;
  }

  const repoRoot = __dirname;
  const home = os.homedir();
  const geminiDir = path.join(home, '.gemini');
  const installRoot = path.join(geminiDir, 'multi-account-switch');
  const binDir = path.join(installRoot, 'bin');
  const binLibStoreDir = path.join(binDir, 'lib', 'store');
  const binLibAuthDir = path.join(binDir, 'lib', 'auth');
  const binLibActionsDir = path.join(binDir, 'lib', 'actions');
  const binLibOutputDir = path.join(binDir, 'lib', 'output');
  const binLibProcDir = path.join(binDir, 'lib', 'proc');
  const hooksDir = path.join(installRoot, 'hooks');
  const userBinDir = process.platform === 'win32' ? path.join(home, 'bin') : path.join(home, '.local', 'bin');
  const hooksConfigPath = path.join(geminiDir, 'config', 'hooks.json');
  const backupDir = path.join(installRoot, 'backups', 'installer');

  ensureDir(binDir);
  ensureDir(binLibStoreDir);
  ensureDir(binLibAuthDir);
  ensureDir(binLibActionsDir);
  ensureDir(binLibOutputDir);
  ensureDir(binLibProcDir);
  ensureDir(hooksDir);
  ensureDir(userBinDir);

  const cliTarget = path.join(binDir, 'ag-switch.cjs');
  const sessionStartTarget = path.join(hooksDir, 'ag-session-start.cjs');

  fs.copyFileSync(path.join(repoRoot, 'ag-switch.cjs'), cliTarget);
  fs.copyFileSync(path.join(repoRoot, 'ag-session-start.cjs'), sessionStartTarget);

  for (const name of ['io.cjs', 'accounts.cjs']) {
    fs.copyFileSync(path.join(repoRoot, 'lib', 'store', name), path.join(binLibStoreDir, name));
  }
  for (const name of ['guard.cjs', 'refresh.cjs', 'identity.cjs']) {
    fs.copyFileSync(path.join(repoRoot, 'lib', 'auth', name), path.join(binLibAuthDir, name));
  }
  for (const name of ['switch-pipeline.cjs', 'switch.cjs', 'sync.cjs', 'list.cjs', 'remove.cjs', 'rename.cjs']) {
    fs.copyFileSync(path.join(repoRoot, 'lib', 'actions', name), path.join(binLibActionsDir, name));
  }
  for (const name of ['accounts.cjs', 'messages.cjs']) {
    fs.copyFileSync(path.join(repoRoot, 'lib', 'output', name), path.join(binLibOutputDir, name));
  }
  fs.copyFileSync(path.join(repoRoot, 'lib', 'proc', 'sessions.cjs'), path.join(binLibProcDir, 'sessions.cjs'));

  if (process.platform === 'win32') {
    const switchCmd = `@echo off\r\nnode "${cliTarget}" --usage-command "ag-switch" %*\r\n`;
    const syncCmd = `@echo off\r\nnode "${cliTarget}" sync %*\r\n`;
    const agsCmd = `@echo off\r\nnode "${cliTarget}" --usage-command "ags" %*\r\n`;
    const agsoCmd = `@echo off\r\nnode "${cliTarget}" sync %*\r\n`;
    const switchSh = `#!/usr/bin/env bash\nset -euo pipefail\nscript_path='${cliTarget.replace(/\\/g, '/')}'\nnode "$script_path" --usage-command "ag-switch" "$@"\n`;
    const syncSh = `#!/usr/bin/env bash\nset -euo pipefail\nscript_path='${cliTarget.replace(/\\/g, '/')}'\nnode "$script_path" sync "$@"\n`;
    const agsSh = `#!/usr/bin/env bash\nset -euo pipefail\nscript_path='${cliTarget.replace(/\\/g, '/')}'\nnode "$script_path" --usage-command "ags" "$@"\n`;
    const agsoSh = `#!/usr/bin/env bash\nset -euo pipefail\nscript_path='${cliTarget.replace(/\\/g, '/')}'\nnode "$script_path" sync "$@"\n`;

    writeFileExecutable(path.join(userBinDir, 'ag-switch.cmd'), switchCmd);
    writeFileExecutable(path.join(userBinDir, 'ag-sync-oauth.cmd'), syncCmd);
    writeFileExecutable(path.join(userBinDir, 'ags.cmd'), agsCmd);
    writeFileExecutable(path.join(userBinDir, 'agso.cmd'), agsoCmd);
    writeFileExecutable(path.join(userBinDir, 'ag-switch'), switchSh);
    writeFileExecutable(path.join(userBinDir, 'ag-sync-oauth'), syncSh);
    writeFileExecutable(path.join(userBinDir, 'ags'), agsSh);
    writeFileExecutable(path.join(userBinDir, 'agso'), agsoSh);
  } else {
    const switchSh = `#!/usr/bin/env bash\nset -euo pipefail\nscript_path='${cliTarget}'\nnode "$script_path" --usage-command "ag-switch" "$@"\n`;
    const syncSh = `#!/usr/bin/env bash\nset -euo pipefail\nscript_path='${cliTarget}'\nnode "$script_path" sync "$@"\n`;
    const agsSh = `#!/usr/bin/env bash\nset -euo pipefail\nscript_path='${cliTarget}'\nnode "$script_path" --usage-command "ags" "$@"\n`;
    const agsoSh = `#!/usr/bin/env bash\nset -euo pipefail\nscript_path='${cliTarget}'\nnode "$script_path" sync "$@"\n`;

    writeFileExecutable(path.join(userBinDir, 'ag-switch'), switchSh);
    writeFileExecutable(path.join(userBinDir, 'ag-sync-oauth'), syncSh);
    writeFileExecutable(path.join(userBinDir, 'ags'), agsSh);
    writeFileExecutable(path.join(userBinDir, 'agso'), agsoSh);
  }

  // Merge a SessionStart hook into ~/.gemini/config/hooks.json without
  // disturbing any other hook groups already registered there (dev machines
  // observed here already have unrelated tools occupying this file).
  backupFile(hooksConfigPath, backupDir);
  const hooksConfig = readJson(hooksConfigPath, {});
  const startupHookCommand = process.platform === 'win32'
    ? `node "${sessionStartTarget}"`
    : `node '${sessionStartTarget}'`;

  const group = hooksConfig['antigravity-multi-account-switch'] && typeof hooksConfig['antigravity-multi-account-switch'] === 'object'
    ? hooksConfig['antigravity-multi-account-switch']
    : {};
  group.enabled = true;
  const sessionStartHooks = Array.isArray(group.SessionStart) ? group.SessionStart : [];
  const exists = sessionStartHooks.find((hook) => hook && hook.type === 'command' && hook.command === startupHookCommand);
  if (!exists) {
    sessionStartHooks.push({ type: 'command', command: startupHookCommand });
  }
  group.SessionStart = sessionStartHooks;
  hooksConfig['antigravity-multi-account-switch'] = group;

  writeJson(hooksConfigPath, hooksConfig);

  console.log(`Installed Antigravity CLI Multi-Account Switcher to ${installRoot}`);
  console.log('Installed commands: ag-switch, ag-sync-oauth, ags, agso');
  console.log('Registered a SessionStart hook in ~/.gemini/config/hooks.json.');
}

installCommands();
