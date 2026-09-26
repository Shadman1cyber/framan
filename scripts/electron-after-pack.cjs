'use strict';

/**
 * electron-builder afterPack hook: copy the Prisma generated client
 * (node_modules/.prisma → <app>/node_modules/.prisma).
 *
 * Why plain fs instead of files/extraFiles patterns: electron-builder's file
 * matchers never match the dot-directory `.prisma`, and its dependency-tree
 * pruning drops it (no package.json depends on it) — yet @prisma/client
 * resolves its engines from exactly that path at runtime. Without this copy
 * the packaged app fails with "Cannot find module '.prisma/client/default'".
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

async function afterPack(context) {
  const src = path.join(context.packager.projectDir, 'node_modules', '.prisma');
  const dest = path.join(context.appOutDir, 'resources', 'app', 'node_modules', '.prisma');
  if (!fs.existsSync(src)) {
    throw new Error('[afterPack] missing source dir: ' + src + ' (run prisma generate first)');
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  const engineName = 'query_engine-windows.dll.node';
  const engineSource = path.join(src, 'client', engineName);
  if (!fs.existsSync(engineSource)) {
    throw new Error('[afterPack] missing Windows Prisma engine: ' + engineSource);
  }
  const appDir = path.join(context.appOutDir, 'resources', 'app');
  const stableEngine = path.join(appDir, 'prisma', 'engines', engineName);
  fs.mkdirSync(path.dirname(stableEngine), { recursive: true });
  fs.copyFileSync(engineSource, stableEngine);
  const engines = fs
    .readdirSync(path.join(dest, 'client'))
    .filter((f) => f.endsWith('.node') || f === 'schema.prisma');
  console.log('[afterPack] copied .prisma: ' + engines.join(', '));
  console.log('[afterPack] staged Windows engine: ' + stableEngine);

  const runtime = path.join(context.packager.projectDir, 'vendor', 'windows-n8n');
  for (const required of ['node.exe', path.join('node_modules', 'n8n', 'bin', 'n8n')]) {
    if (!fs.existsSync(path.join(runtime, required))) {
      throw new Error('[afterPack] missing Windows n8n runtime: ' + required);
    }
  }
  const bundled = path.join(appDir, 'vendor', 'windows-n8n');
  fs.mkdirSync(bundled, { recursive: true });
  fs.copyFileSync(path.join(runtime, 'node.exe'), path.join(bundled, 'node.exe'));
  const archive = path.join(bundled, 'runtime.7z');
  const sevenZip = require('7zip-bin').path7za;
  fs.rmSync(archive, { force: true });
  const packed = spawnSync(sevenZip, ['a', '-t7z', archive, 'node_modules', '-mx=5', '-mmt=on'], {
    cwd: runtime,
    stdio: 'inherit',
  });
  if (packed.status !== 0) throw new Error('[afterPack] n8n archive failed: ' + packed.status);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(path.join(bundled, 'runtime.sha256'), digest + '\n');
  const extractor = path.join(context.packager.projectDir, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  if (!fs.existsSync(extractor)) throw new Error('[afterPack] missing Windows 7za.exe');
  fs.copyFileSync(extractor, path.join(bundled, '7za.exe'));
  console.log('[afterPack] staged n8n archive: ' + fs.statSync(archive).size + ' bytes, SHA-256 ' + digest);
}

module.exports = afterPack;
module.exports.default = afterPack;
