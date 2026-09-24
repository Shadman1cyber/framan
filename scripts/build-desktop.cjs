'use strict';

/**
 * Build the universal Cafe 13 desktop app for Windows 7/8.1/10/11.
 *
 * Cross-platform Node script (run on Windows for release, any OS for tests):
 *
 *   1. prisma generate  — desktop SQLite schema → node_modules/@prisma/client
 *      (types are identical to the Postgres client; only provider changes).
 *   2. next build       — production bundle into .next-desktop (never touches
 *      the dev server's .next) served by the embedded server.
 *   3. Template DB      — prisma db push + seed into prisma/dev-desktop.db
 *      (shipped in the package; copied to userData on first run).
 *   4. desktop-meta.json — cafe id of the seeded template (for /api/sync).
 *   5. electron-builder — NSIS + Portable installers (x64; Prisma ships no
 *      32-bit Windows engines, so the embedded app is 64-bit only).
 *
 * NOTE: step 1 regenerates @prisma/client for SQLite. After a desktop build,
 * run `npm run build` (or ./run.sh) to restore the Postgres client for the
 * server deployment.
 *
 * Usage:
 *   node scripts/build-desktop.cjs                 # full pipeline + package
 *   node scripts/build-desktop.cjs --skip-package  # steps 1-4 only (tests)
 *   node scripts/build-desktop.cjs --skip-web      # reuse existing .next-desktop
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const archArg = (args.find((a) => a.startsWith('--arch=')) || '').split('=')[1] || '';

const TEMPLATE_DB = path.join(root, 'prisma', 'dev-desktop.db');
const DESKTOP_SCHEMA = path.join(root, 'prisma', 'schema.desktop.prisma');
const META_JSON = path.join(root, 'prisma', 'desktop-meta.json');

function info(m) { console.log('>> ' + m); }
function fail(m) { console.error('XX ' + m); process.exit(1); }

function run(cmd, cmdArgs, opts) {
  info([cmd].concat(cmdArgs).join(' '));
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: Object.assign({}, process.env, (opts && opts.env) || {}),
  });
  if (r.status !== 0) fail([cmd].concat(cmdArgs).join(' ') + ' failed (exit ' + r.status + ')');
}

// ── 1. Prisma client for the desktop SQLite schema ──────────────────────────
run('npx', ['prisma', 'generate', '--schema', DESKTOP_SCHEMA]);

// ── 2. Next production build (embedded server serves this) ──────────────────
// NEXT_DIST_DIR keeps the desktop bundle in .next-desktop so the running dev
// server's on-demand compilation can never rewrite production chunks.
process.env.NEXT_DIST_DIR = '.next-desktop';
if (!flag('skip-web')) {
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  delete process.env.DATABASE_URL; // not needed at build time
  run('npx', ['next', 'build'], { env: { NEXT_DIST_DIR: '.next-desktop' } });
} else {
  if (!fs.existsSync(path.join(root, '.next-desktop', 'BUILD_ID'))) {
    fail('no existing .next-desktop build — run without --skip-web');
  }
  info('reusing existing .next-desktop build');
}

// ── 3. Template database (seeded, shipped in the package) ───────────────────
info('building template DB ' + TEMPLATE_DB);
fs.rmSync(TEMPLATE_DB, { force: true });
fs.rmSync(TEMPLATE_DB + '-journal', { force: true });
run('npx', ['prisma', 'db', 'push', '--schema', DESKTOP_SCHEMA, '--skip-generate'], {
  env: { DATABASE_URL: 'file:' + TEMPLATE_DB.split(path.sep).join('/') },
});
run('npx', ['tsx', 'prisma/seed.ts'], {
  env: { DATABASE_URL: 'file:' + TEMPLATE_DB.split(path.sep).join('/') },
});

// ── 4. Cafe id for /api/sync (scope) ────────────────────────────────────────
info('extracting cafe id → ' + META_JSON);
const probe = spawnSync(
  process.execPath,
  [
    '-e',
    "const { PrismaClient } = require('@prisma/client');" +
      'const p = new PrismaClient();' +
      'p.cafe.findFirst().then((c) => {' +
      "  if (!c) { process.exit(1); }" +
      "  require('fs').writeFileSync(" +
      `    ${JSON.stringify(META_JSON)},` +
      "    JSON.stringify({ cafeId: c.id }, null, 2));" +
      "  console.log('cafeId: ' + c.id);" +
      '  return p.$disconnect();' +
    '}).catch((e) => { console.error(e.message); process.exit(1); });',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    encoding: 'utf-8',
    env: Object.assign({}, process.env, {
      DATABASE_URL: 'file:' + TEMPLATE_DB.split(path.sep).join('/'),
    }),
  },
);
if (probe.status !== 0) fail('cafe id extraction failed');
if (!fs.existsSync(META_JSON)) fail('desktop-meta.json was not written');

// ── 5. Package installers ───────────────────────────────────────────────────
if (flag('skip-package')) {
  info('skipping packaging (--skip-package). Template DB + meta ready.');
  process.exit(0);
}

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
const builderArgs = ['electron-builder', '--win', 'nsis', 'portable', '--x64'];
run('npx', builderArgs);

info('Done. Artifacts:');
const outDir = path.join(root, 'dist-desktop');
fs.readdirSync(outDir)
  .filter((f) => f.endsWith('.exe'))
  .forEach((f) => console.log('  ' + f));
