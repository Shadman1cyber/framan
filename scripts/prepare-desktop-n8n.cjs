'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const runtime = path.join(root, 'vendor', 'windows-n8n');
const entry = path.join(runtime, 'node_modules', 'n8n', 'bin', 'n8n');
const nodeExe = path.join(runtime, 'node.exe');
const packageFile = path.join(runtime, 'package.json');
const lockFile = path.join(runtime, 'package-lock.json');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function fail(message) {
  console.error('XX ' + message);
  process.exit(1);
}

function runNpm(args) {
  const result = spawnSync(npm, args, {
    cwd: runtime,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) fail('npm ' + args.join(' ') + ' failed (exit ' + result.status + ')');
}

function nodeVersionSupported() {
  const parts = process.versions.node.split('.').map(Number);
  return parts[0] > 22 || (parts[0] === 22 && parts[1] >= 16);
}

function runtimeComplete() {
  if (!fs.existsSync(entry) || !fs.existsSync(nodeExe)) return false;
  try {
    const n8n = JSON.parse(fs.readFileSync(path.join(runtime, 'node_modules', 'n8n', 'package.json'), 'utf8'));
    return n8n.version === '2.20.0';
  } catch (e) {
    return false;
  }
}

function main() {
  fs.mkdirSync(runtime, { recursive: true });
  if (!fs.existsSync(packageFile)) fail('missing ' + packageFile);
  if (process.platform === 'win32' && !nodeVersionSupported()) {
    fail('Node.js 22.16.0 or newer is required to prepare the Windows n8n runtime');
  }
  if (!runtimeComplete()) {
    const args = fs.existsSync(lockFile)
      ? ['ci', '--omit=dev', '--no-audit', '--no-fund']
      : ['install', '--omit=dev', '--no-audit', '--no-fund'];
    runNpm(args);
  }
  if (process.platform === 'win32') {
    fs.copyFileSync(process.execPath, nodeExe);
  }
  if (!fs.existsSync(entry)) fail('Windows n8n runtime is incomplete: ' + entry);
  if (!fs.existsSync(nodeExe)) fail('Windows n8n runtime is incomplete: ' + nodeExe);
  console.log('Windows n8n runtime ready: ' + runtime);
}

main();
