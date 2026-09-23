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

async function afterPack(context) {
  const src = path.join(context.packager.projectDir, 'node_modules', '.prisma');
  const dest = path.join(context.appOutDir, 'resources', 'app', 'node_modules', '.prisma');
  if (!fs.existsSync(src)) {
    throw new Error('[afterPack] missing source dir: ' + src + ' (run prisma generate first)');
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  const engines = fs
    .readdirSync(path.join(dest, 'client'))
    .filter((f) => f.endsWith('.node') || f === 'schema.prisma');
  console.log('[afterPack] copied .prisma: ' + engines.join(', '));
}

module.exports = afterPack;
module.exports.default = afterPack;
