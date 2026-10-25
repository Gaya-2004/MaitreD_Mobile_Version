const { spawnSync } = require('child_process');
const path = require('path');

// Ensure NODE_OPTIONS includes --max-old-space-size=4096 to prevent memory crashes (OOM)
const maxOldSpace = '--max-old-space-size=4096';
if (!process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = maxOldSpace;
} else if (!process.env.NODE_OPTIONS.includes('--max-old-space-size')) {
  process.env.NODE_OPTIONS += ` ${maxOldSpace}`;
}

const args = process.argv.slice(2);
const cliPath = path.resolve(__dirname, '../node_modules/expo/bin/cli');

// Spawn the Expo CLI with the custom environment variables and arguments
const result = spawnSync('node', [cliPath, ...args], {
  stdio: 'inherit',
  shell: false,
  env: process.env
});

process.exit(result.status === null ? 1 : result.status);
