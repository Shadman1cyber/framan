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
 *   5. electron-builder — NSIS installer (x64; Prisma ships no
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
const arch = archArg || 'x64';

const SOURCE_SCHEMA = path.join(root, 'prisma', 'schema.prisma');
const TEMPLATE_DB = path.join(root, 'prisma', 'dev-desktop.db');
const DESKTOP_SCHEMA = path.join(root, 'prisma', 'schema.desktop.prisma');
const META_JSON = path.join(root, 'prisma', 'desktop-meta.json');
const N8N_RUNTIME = path.join(root, 'vendor', 'windows-n8n');

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

function syncDesktopSchema() {
  const source = fs.readFileSync(SOURCE_SCHEMA, 'utf8');
  const generator = 'generator client {\n  provider = "prisma-client-js"\n}';
  const desktopGenerator =
    'generator client {\n' +
    '  provider = "prisma-client-js"\n' +
    '  binaryTargets = ["native", "windows"]\n' +
    '}';
  if (!source.includes(generator) || !source.includes('provider = "postgresql"')) {
    fail('could not generate desktop Prisma schema from ' + SOURCE_SCHEMA);
  }
  const output = source.replace(generator, desktopGenerator).replace('provider = "postgresql"', 'provider = "sqlite"');
  fs.writeFileSync(DESKTOP_SCHEMA, output, 'utf8');
}

function validateN8nRuntime() {
  for (const file of [
    'node.exe',
    path.join('node_modules', 'n8n', 'bin', 'n8n'),
    path.join('workflows', 'farman-agent.json'),
    path.join('workflows', 'farman-agent-db-snapshot.json'),
  ]) {
    if (!fs.existsSync(path.join(N8N_RUNTIME, file))) {
      fail('Windows n8n runtime is incomplete: ' + file);
    }
  }
}

syncDesktopSchema();
if (flag('schema-only')) {
  info('desktop Prisma schema synchronized');
  process.exit(0);
}
if (arch !== 'x64') fail('the embedded desktop app supports x64 only');
run(process.execPath, ['scripts/prepare-desktop-n8n.cjs']);
validateN8nRuntime();

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
  env: { DATABASE_URL: 'file:./dev-desktop.db', RUST_LOG: 'debug' },
});
run('npx', ['tsx', 'prisma/seed.ts'], {
  env: { DATABASE_URL: 'file:./dev-desktop.db' },
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
      DATABASE_URL: 'file:./dev-desktop.db',
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

run(process.execPath, ['scripts/build-desktop-agent-workflows.cjs']);
run('npm', ['run', 'worker:build']);

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
const builderCli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
if (!fs.existsSync(builderCli)) fail('electron-builder is not installed');
run(process.execPath, [builderCli, '--win', 'nsis', '--' + arch]);

info('Done. Artifacts:');
const outDir = path.join(root, 'dist-desktop');
fs.readdirSync(outDir)
  .filter((f) => f.endsWith('.exe'))
  .forEach((f) => console.log('  ' + f));
