#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, '..', 'bin', 'ag-switch.cjs');
spawnSync('node', [cliPath, '--touch-current'], { stdio: 'ignore' });

console.log('Antigravity CLI Multi-Account Switcher is available.');
console.log('Run `ag-switch` or `ags` to list/switch accounts.');
console.log('Run `ag-sync-oauth` or `agso` to sync the active account into the store.');
