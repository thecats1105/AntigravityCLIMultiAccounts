const { execFileSync } = require('child_process');

// Best-effort: only processes matching one of `names` by exact image/comm name
// are detectable. Detection failure must never block a switch.
function detectRunningProcesses(names) {
  try {
    if (process.platform === 'win32') {
      let count = 0;
      for (const name of names) {
        const image = name.toLowerCase().endsWith('.exe') ? name : `${name}.exe`;
        const output = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], {
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
        });
        count += output.split(/\r?\n/).filter((line) => line.trim().startsWith(`"${image}"`)).length;
      }
      return { detected: true, count };
    }
    const output = execFileSync('ps', ['-A', '-o', 'comm='], { encoding: 'utf8', timeout: 5000 });
    const wanted = new Set(names.map((name) => name.toLowerCase()));
    const count = output.split(/\r?\n/).filter((line) => {
      const name = line.trim().split('/').pop();
      return name && wanted.has(name.toLowerCase());
    }).length;
    return { detected: true, count };
  } catch {
    return { detected: false, count: 0 };
  }
}

function detectAgySessions() {
  return detectRunningProcesses(['agy', 'antigravity']);
}

module.exports = { detectRunningProcesses, detectAgySessions };
