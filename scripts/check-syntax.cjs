const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const roots = ['background', 'blocked', 'content', 'lib', 'offscreen', 'popup', 'report', 'setup', 'scripts'];
for (const root of roots) {
  for (const file of fs.readdirSync(root)) {
    if (!/\.(js|cjs)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
