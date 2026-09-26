'use strict';

/**
 * Cafe 13 — universal native desktop app for Windows 7 / 8.1 / 10 / 11.
 *
 * Pinned to Electron 22 (Chromium 108, Node 16): the last Electron major that
 * runs on Windows 7 SP1 and 8.1. Electron 23+ requires Windows 10+. A single
 * build is universal across 7 → 11.
 *
 * TWO modes (mirrors the mobile apps):
 *
 * 1. EMBEDDED (default for the installed app) — the full platform runs inside
 *    the window's process: Next.js production server + local SQLite database
 *    in the user data dir. Works with ZERO connectivity, exactly like the
 *    iOS/Android offline-first apps keep a local DB. The manager PC becomes
 *    the shop server: it binds 0.0.0.0 so phones/other terminals on the LAN
 *    connect to it (PUBLIC_APP_URL = this machine's LAN IP). Next 14 expects
 *    Node 18 globals — electron/node-polyfills.cjs shims them onto Node 16.
 *
 * 2. REMOTE (--remote=URL) — thin client to an existing shop server (same
 *    model as the Capacitor shells). Offline shows a bundled Persian page
 *    with auto-retry; the web app's PWA + outbox cover cached reads/writes.
 *
 * Node 16 compatibility (main process): CommonJS only, no global fetch /
 * structuredClone before polyfills load.
 */
const { app, BrowserWindow, Menu, Tray, shell, ipcMain, dialog, nativeImage, clipboard, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const crypto = require('crypto');
const util = require('util');
const { execFileSync, spawn } = require('child_process');

const APP_ID = 'com.farmancoffeeshop.app';

// Space-free userData dir: the default (%APPDATA%\Cafe 13) contains a space,
// which breaks Prisma's SQLite file: URL handling on Windows (the space is
// percent-encoded and the file is never found). Must run before
// requestSingleInstanceLock() — the lock file lives in userData.
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'Cafe13'));
} catch (e) {
  // getPath can throw on exotic setups; fall back to the default dir.
}

const DEFAULT_SERVER_URL = 'http://localhost:3080';
// Manager is the primary desktop user: open at the admin login, same as the
// mobile staff app (capacitor.config.ts appStartPath). Override with
// --entry=/ or the saved config.
const DEFAULT_ENTRY_PATH = '/admin/login';
const CONFIG_FILE = 'cafe13-desktop-config.json';
const DB_FILE = 'cafe13.db';
const HEALTH_TIMEOUT_MS = 4000;
const N8N_PORT = 5678;
const N8N_HEALTH_URL = 'http://127.0.0.1:' + N8N_PORT + '/healthz';
const N8N_START_TIMEOUT_MS = 90000;

app.setAppUserModelId(APP_ID);

// Single instance: a second launch just focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let offlineMode = false;
let localServer = null;
let bootError = null;
let isQuitting = false;
let detectedLanIp = '';
let agentWorker = null;
let n8nProcess = null;
let agentServiceStatus = {
  state: 'stopped',
  n8n: false,
  worker: false,
  modelConfigured: false,
  telemetryConfigured: false,
  error: '',
};

function installDesktopErrorLog() {
  const logDir = path.join(app.getPath('userData'), 'logs');
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    return;
  }
  const logFile = path.join(logDir, 'desktop.log');
  function record(args) {
    try {
      fs.appendFileSync(logFile, new Date().toISOString() + ' ' + util.format.apply(util, args) + '\n');
    } catch (error) {
      // Logging must never stop the desktop app.
    }
  }
  for (const level of ['error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = function () {
      record(Array.prototype.slice.call(arguments));
      original.apply(console, arguments);
    };
  }
  process.on('uncaughtExceptionMonitor', function (error) {
    record([error]);
  });
  record(['Cafe 13 desktop started, version ' + app.getVersion()]);
}

/** Parse `--key=value` / `--flag` CLI args (works on Win7 cmd too). */
function parseArgs(argv) {
  const out = {};
  argv.forEach(function (a) {
    if (a.indexOf('--server=') === 0) out.server = a.slice('--server='.length);
    else if (a.indexOf('--remote=') === 0) out.remote = a.slice('--remote='.length);
    else if (a.indexOf('--entry=') === 0) out.entry = a.slice('--entry='.length);
    else if (a.indexOf('--port=') === 0) out.port = parseInt(a.slice('--port='.length), 10);
    else if (a === '--kiosk') out.kiosk = true;
    else if (a === '--fullscreen') out.fullscreen = true;
    else if (a === '--embedded') out.embedded = true;
  });
  return out;
}

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeConfig(patch) {
  const current = readConfig();
  Object.keys(patch).forEach(function (k) {
    current[k] = patch[k];
  });
  try {
    fs.writeFileSync(configPath(), JSON.stringify(current, null, 2), 'utf8');
  } catch (e) {
    // userData may be read-only in some kiosk setups; non-fatal.
  }
  return current;
}

/** Normalize a server URL: trim, add http://, strip trailing slash. */
function normalizeUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = 'http://' + s;
  s = s.replace(/\/+$/, '');
  try {
    const parsed = new URL(s);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString().replace(/\/$/, '');
  } catch (e) {
    return '';
  }
}

function resolveMode() {
  const args = parseArgs(process.argv.slice(1));
  // Explicit CLI flags always win (useful for testing / shortcuts).
  if (args.embedded) return 'embedded';
  if (args.remote) return 'remote';
  // Otherwise honor the mode saved in the settings window (tray → تنظیمات
  // سرور), so the manager can switch the installed app between its local
  // server and a shop server without touching shortcuts or files.
  const cfg = readConfig();
  if (cfg.mode === 'remote') return 'remote';
  if (cfg.mode === 'embedded') return 'embedded';
  // The installed app embeds the whole platform (offline-first, like the
  // mobile apps). Dev runs (`npm run desktop:dev`) stay thin clients to the
  // dev server.
  return app.isPackaged ? 'embedded' : 'remote';
}

/** REMOTE mode server URL precedence: CLI > env > saved config > default. */
function resolveServerUrl() {
  if (resolveMode() === 'embedded' && localServer) return localServer.url;
  const args = parseArgs(process.argv.slice(1));
  const envUrl =
    process.env.DESKTOP_SERVER_URL ||
    process.env.CAPACITOR_SERVER_URL ||
    process.env.PUBLIC_APP_URL ||
    '';
  const cfg = readConfig();
  return (
    normalizeUrl(args.server || args.remote) ||
    normalizeUrl(envUrl) ||
    normalizeUrl(cfg.serverUrl) ||
    DEFAULT_SERVER_URL
  );
}

function resolveEntryPath() {
  const args = parseArgs(process.argv.slice(1));
  const cfg = readConfig();
  let entry = args.entry || cfg.entryPath || DEFAULT_ENTRY_PATH;
  entry = String(entry).trim() || DEFAULT_ENTRY_PATH;
  if (entry.charAt(0) !== '/') entry = '/' + entry;
  return entry;
}

function lanAddressScore(name, address) {
  let score;
  if (address.startsWith('192.168.')) score = 50;
  else if (address.startsWith('10.')) score = 40;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score = 30;
  else return -Infinity;
  if (/(virtual|vmware|vbox|hyper-v|vethernet|tailscale|zerotier|docker|wsl|bluetooth|loopback)/i.test(name)) score -= 100;
  return score;
}

/** First non-internal IPv4 address (for QR codes / phone access). */
function detectLanIp() {
  if (detectedLanIp) return detectedLanIp;

  if (process.platform === 'win32') {
    try {
      const command = "$route = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1; if ($route) { $ip = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1; if ($ip) { [pscustomobject]@{ name = [string]$route.InterfaceAlias; address = [string]$ip.IPAddress } | ConvertTo-Json -Compress } }";
      const value = String(
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
        }) || '',
      ).trim();
      const parsed = value ? JSON.parse(value) : null;
      if (parsed && lanAddressScore(parsed.name || '', parsed.address || '') >= 0) {
        detectedLanIp = parsed.address;
        return detectedLanIp;
      }
    } catch (e) {
      detectedLanIp = '';
    }
  }

  const ifaces = os.networkInterfaces();
  const names = Object.keys(ifaces);
  let best = '';
  let bestScore = -Infinity;
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const addrs = ifaces[name] || [];
    for (let j = 0; j < addrs.length; j++) {
      const address = addrs[j];
      if (address.family !== 'IPv4' || address.internal) continue;
      const score = lanAddressScore(name, address.address);
      if (score > bestScore) {
        best = address.address;
        bestScore = score;
      }
    }
  }
  detectedLanIp = best || '127.0.0.1';
  return detectedLanIp;
}

function lanServerUrl() {
  if (!localServer || !localServer.port) return '';
  return 'http://' + detectLanIp() + ':' + localServer.port;
}

/** Preferred port, else a free ephemeral one (embedded server). */
function findFreePort(preferred) {
  return new Promise(function (resolve) {
    function tryPort(p, fallbackEphemeral) {
      const srv = net.createServer();
      srv.once('error', function () {
        if (fallbackEphemeral) {
          const tmp = net.createServer();
          tmp.listen(0, '127.0.0.1', function () {
            const port = tmp.address().port;
            tmp.close(function () {
              resolve(port);
            });
          });
        } else {
          tryPort(0, true);
        }
      });
      srv.once('listening', function () {
        srv.close(function () {
          resolve(p);
        });
      });
      srv.listen(p, '127.0.0.1');
    }
    tryPort(preferred || 3080, false);
  });
}

function ensureSecret() {
  const cfg = readConfig();
  if (cfg.nextAuthSecret) return cfg.nextAuthSecret;
  const secret = crypto.randomBytes(32).toString('hex');
  writeConfig({ nextAuthSecret: secret });
  return secret;
}

function ensureBridgeToken() {
  const cfg = readConfig();
  if (cfg.n8nBridgeToken) return cfg.n8nBridgeToken;
  const token = crypto.randomBytes(32).toString('hex');
  writeConfig({ n8nBridgeToken: token });
  return token;
}

function ensureN8nKey() {
  const cfg = readConfig();
  if (cfg.n8nEncryptionKey) return cfg.n8nEncryptionKey;
  const key = crypto.randomBytes(32).toString('hex');
  writeConfig({ n8nEncryptionKey: key });
  return key;
}

function encryptionAvailable() {
  return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
}

function readStoredSecret(cfg, encryptedKey, plainKey) {
  const encrypted = cfg && cfg[encryptedKey];
  if (encrypted && encryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(String(encrypted), 'base64'));
    } catch (e) {
    }
  }
  return String((cfg && cfg[plainKey]) || '');
}

function storedSecretPatch(encryptedKey, plainKey, value) {
  const text = String(value || '').trim();
  if (!text) return {};
  const patch = {};
  patch[plainKey] = '';
  if (encryptionAvailable()) {
    patch[encryptedKey] = safeStorage.encryptString(text).toString('base64');
  } else {
    patch[plainKey] = text;
  }
  return patch;
}

function migrateStoredSecrets(cfg, plainKey, encryptedKey) {
  if (!cfg[plainKey] || !encryptionAvailable()) return cfg;
  const patch = storedSecretPatch(encryptedKey, plainKey, cfg[plainKey]);
  if (!patch[encryptedKey]) return cfg;
  writeConfig(patch);
  return readConfig();
}

function modelSettings(cfg) {
  return {
    apiKey: readStoredSecret(cfg, 'modelApiKeyEncrypted', 'modelApiKey') || String(process.env.ZHIPU_API_KEY || '').trim(),
    baseUrl: normalizeUrl(cfg && cfg.modelBaseUrl) || normalizeUrl(process.env.ZHIPU_BASE_URL) || 'https://open.bigmodel.cn/api/paas/v4',
  };
}

function desktopNode() {
  const bundled = path.join(appRoot(), 'vendor', 'windows-n8n', 'node.exe');
  return fs.existsSync(bundled) ? bundled : '';
}

function startBackgroundService(script, extraEnv, logName) {
  const node = desktopNode();
  if (!node || !fs.existsSync(script)) throw new Error(logName + ' runtime is missing');
  const logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.openSync(path.join(logDir, logName + '.log'), 'a');
  try {
    const child = spawn(node, [script], {
      cwd: appRoot(),
      env: Object.assign({}, process.env, extraEnv),
      stdio: ['ignore', log, log],
      windowsHide: true,
    });
    let logClosed = false;
    const closeLog = function () {
      if (logClosed) return;
      logClosed = true;
      fs.closeSync(log);
    };
    child.once('error', closeLog);
    child.once('spawn', closeLog);
    return child;
  } catch (e) {
    fs.closeSync(log);
    throw e;
  }
}

function workflowFingerprint(workflowDir) {
  const hash = crypto.createHash('sha256');
  for (const file of ['farman-agent-db-snapshot.json', 'farman-agent.json']) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(workflowDir, file)));
  }
  return hash.digest('hex');
}

function importN8nCredential(appDir, n8nEntry, n8nDir, cliEnv, model) {
  const target = path.join(n8nDir, '.farman-model-credential-' + process.pid + '.json');
  const payload = [{
    id: 'farman-zhipu-glm',
    name: 'FARMAN Zhipu GLM',
    type: 'openAiApi',
    data: { apiKey: model.apiKey, organizationId: '', url: model.baseUrl },
  }];
  fs.writeFileSync(target, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
  try {
    execFileSync(desktopNode(), [n8nEntry, 'import:credentials', '--input=' + target], {
      cwd: appDir,
      env: cliEnv,
      timeout: 120000,
      windowsHide: true,
    });
  } finally {
    fs.rmSync(target, { force: true });
  }
}

function provisionN8n(appDir, n8nEntry, n8nDir, n8nEnv, cfg) {
  const workflowDir = path.join(appDir, 'vendor', 'windows-n8n', 'workflows');
  const markerPath = path.join(n8nDir, 'farman-provisioning.json');
  let marker = {};
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (e) {
    marker = {};
  }
  const model = modelSettings(cfg);
  const workflowHash = workflowFingerprint(workflowDir);
  const credentialHash = model.apiKey
    ? crypto.createHash('sha256').update(model.apiKey + '\0' + model.baseUrl).digest('hex')
    : '';
  const cliEnv = Object.assign({}, process.env, n8nEnv);
  let changed = false;
  if (credentialHash && marker.credential !== credentialHash) {
    importN8nCredential(appDir, n8nEntry, n8nDir, cliEnv, model);
    changed = true;
  }
  if (marker.workflows !== workflowHash) {
    for (const file of ['farman-agent-db-snapshot.json', 'farman-agent.json']) {
      execFileSync(desktopNode(), [n8nEntry, 'import:workflow', '--input=' + path.join(workflowDir, file)], {
        cwd: appDir,
        env: cliEnv,
        timeout: 120000,
        windowsHide: true,
      });
    }
    execFileSync(desktopNode(), [n8nEntry, 'publish:workflow', '--id=farman-agent-v1'], {
      cwd: appDir,
      env: cliEnv,
      timeout: 120000,
      windowsHide: true,
    });
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(markerPath, JSON.stringify({
      workflows: workflowHash,
      credential: credentialHash || marker.credential || '',
      updatedAt: new Date().toISOString(),
    }, null, 2));
  }
  return { modelConfigured: Boolean(model.apiKey), model };
}

async function waitForN8n(child) {
  const deadline = Date.now() + N8N_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('n8n exited with code ' + child.exitCode);
    const probe = await checkServer(N8N_HEALTH_URL, 1500);
    if (probe.ok) return;
    await new Promise(function (resolve) { setTimeout(resolve, 500); });
  }
  throw new Error('n8n did not become healthy in time');
}

async function ensureN8nRuntime() {
  const bundled = path.join(appRoot(), 'vendor', 'windows-n8n');
  const archive = path.join(bundled, 'runtime.7z');
  const extractor = path.join(bundled, '7za.exe');
  const digest = fs.readFileSync(path.join(bundled, 'runtime.sha256'), 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(digest) || !fs.existsSync(archive) || !fs.existsSync(extractor)) {
    throw new Error('The bundled n8n runtime is incomplete');
  }
  const base = path.join(app.getPath('userData'), 'agent-runtime');
  const target = path.join(base, 'n8n-' + digest);
  const entry = path.join(target, 'node_modules', 'n8n', 'bin', 'n8n');
  if (fs.existsSync(entry)) return entry;

  fs.mkdirSync(base, { recursive: true });
  const staging = path.join(base, 'staging-' + process.pid);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  agentServiceStatus.state = 'preparing';
  try {
    await new Promise(function (resolve, reject) {
      const child = spawn(extractor, ['x', '-y', archive, '-o' + staging], {
        cwd: base,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.once('error', reject);
      child.once('exit', function (code) {
        if (code === 0) resolve();
        else reject(new Error('n8n runtime extraction failed (' + code + ')'));
      });
    });
    const stagedEntry = path.join(staging, 'node_modules', 'n8n', 'bin', 'n8n');
    if (!fs.existsSync(stagedEntry)) throw new Error('n8n runtime archive is incomplete');
    fs.renameSync(staging, target);
    // Old managed runtime versions can be removed after the new one is ready.
    for (const name of fs.readdirSync(base)) {
      if (/^n8n-[a-f0-9]{64}$/.test(name) && name !== 'n8n-' + digest) {
        fs.rmSync(path.join(base, name), { recursive: true, force: true });
      }
    }
    return entry;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

async function startAgentServices() {
  const appDir = appRoot();
  const dataDir = app.getPath('userData');
  const workerEntry = path.join(appDir, 'worker', 'dist.cjs');
  if (!fs.existsSync(workerEntry)) {
    throw new Error('agent services are absent from this package');
  }
  const n8nEntry = await ensureN8nRuntime();
  const prisma = new (require('@prisma/client').PrismaClient)();
  let cafe;
  try { cafe = await prisma.cafe.findFirst({ select: { id: true } }); }
  finally { await prisma.$disconnect(); }
  if (!cafe) throw new Error('No cafe scope in local database');
  process.env.AGENT_CAFE_ID = cafe.id;
  process.env.AGENT_ENABLED = 'true';
  process.env.AI_ENABLED = 'true';
  process.env.AGENT_ENGINE = 'n8n';
  process.env.N8N_WEBHOOK_URL = 'http://127.0.0.1:' + N8N_PORT + '/webhook/farman-agent';
  process.env.N8N_BRIDGE_TOKEN = ensureBridgeToken();
  let cfg = migrateStoredSecrets(readConfig(), 'modelApiKey', 'modelApiKeyEncrypted');
  cfg = migrateStoredSecrets(cfg, 'openobserveAuthorization', 'openobserveAuthorizationEncrypted');
  const openobserveAuthorization = readStoredSecret(cfg, 'openobserveAuthorizationEncrypted', 'openobserveAuthorization');
  if (cfg.openobserveTracesUrl && openobserveAuthorization) {
    process.env.OPENOBSERVE_TRACES_URL = cfg.openobserveTracesUrl;
    process.env.OPENOBSERVE_AUTHORIZATION = openobserveAuthorization;
    process.env.OPENOBSERVE_DASHBOARD_URL = cfg.openobserveDashboardUrl || '';
    try {
      process.env.OPENOBSERVE_INTERNAL_HOST = new URL(cfg.openobserveTracesUrl).hostname;
    } catch (e) {
      delete process.env.OPENOBSERVE_INTERNAL_HOST;
    }
  } else {
    delete process.env.OPENOBSERVE_TRACES_URL;
    delete process.env.OPENOBSERVE_AUTHORIZATION;
    delete process.env.OPENOBSERVE_DASHBOARD_URL;
    delete process.env.OPENOBSERVE_INTERNAL_HOST;
  }
  const n8nDir = path.join(dataDir, 'n8n');
  fs.mkdirSync(n8nDir, { recursive: true });
  const n8nEnv = {
    N8N_USER_FOLDER: n8nDir,
    N8N_ENCRYPTION_KEY: ensureN8nKey(),
    N8N_HOST: '127.0.0.1',
    N8N_LISTEN_ADDRESS: '127.0.0.1',
    N8N_PORT: String(N8N_PORT),
    N8N_PROTOCOL: 'http',
    N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_PERSONALIZATION_ENABLED: 'false',
    N8N_BLOCK_ENV_ACCESS_IN_NODE: 'false',
    N8N_BRIDGE_TOKEN: process.env.N8N_BRIDGE_TOKEN,
    FARMAN_LOCAL_URL: localServer.url,
  };
  agentServiceStatus = {
    state: 'starting',
    n8n: false,
    worker: false,
    modelConfigured: false,
    telemetryConfigured: Boolean(process.env.OPENOBSERVE_TRACES_URL && process.env.OPENOBSERVE_AUTHORIZATION),
    error: '',
  };
  try {
    const provisioned = provisionN8n(appDir, n8nEntry, n8nDir, n8nEnv, cfg);
    agentServiceStatus.modelConfigured = provisioned.modelConfigured;
    n8nProcess = startBackgroundService(n8nEntry, n8nEnv, 'n8n');
    n8nProcess.once('exit', function (code) {
      agentServiceStatus.n8n = false;
      if (!isQuitting) {
        agentServiceStatus.state = 'error';
        agentServiceStatus.error = 'n8n exited with code ' + code;
      }
    });
    await waitForN8n(n8nProcess);
    agentServiceStatus.n8n = true;
    agentWorker = startBackgroundService(workerEntry, {}, 'agent-worker');
    agentWorker.once('exit', function (code) {
      agentServiceStatus.worker = false;
      if (!isQuitting) {
        agentServiceStatus.state = 'error';
        agentServiceStatus.error = 'agent worker exited with code ' + code;
      }
    });
    agentServiceStatus.worker = true;
    agentServiceStatus.state = provisioned.modelConfigured ? 'ready' : 'degraded';
    agentServiceStatus.error = provisioned.modelConfigured ? '' : 'model API key is not configured';
  } catch (e) {
    agentServiceStatus.state = 'error';
    agentServiceStatus.error = String((e && e.message) || e);
    if (n8nProcess && n8nProcess.exitCode === null) n8nProcess.kill();
    throw e;
  }
}

/** Build-time metadata (cafe id of the seeded template DB). */
function appRoot() {
  // electron/ lives directly under the app root in BOTH layouts: the
  // packaged app (asar: false → <install>/resources/app/electron) and the
  // dev script (`electron electron/main.cjs` → <project>/electron).
  // app.getAppPath() is unreliable in script mode (returns the main script's
  // dir), so derive from __dirname.
  return path.join(__dirname, '..');
}

function configurePrismaEngine(appDir, dataDir) {
  if (process.platform !== 'win32') return;
  const engineName = 'query_engine-windows.dll.node';
  const candidates = [
    path.join(appDir, 'prisma', 'engines', engineName),
    path.join(appDir, 'node_modules', '.prisma', 'client', engineName),
    path.join(appDir, '.prisma', 'client', engineName),
    path.join(appDir, '.next-desktop', 'server', engineName),
  ];
  const source = candidates.find(function (candidate) {
    return fs.existsSync(candidate);
  });
  if (!source) throw new Error('Prisma Windows query engine is missing from the installation');
  const target = path.join(dataDir, 'prisma', engineName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = target;
}

function readDesktopMeta() {
  try {
    const raw = fs.readFileSync(path.join(appRoot(), 'prisma', 'desktop-meta.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

/** Copy the bundled seeded SQLite template into userData on first run. */
function bootstrapDatabase() {
  const dataDir = app.getPath('userData');
  const dbPath = path.join(dataDir, DB_FILE);
  if (fs.existsSync(dbPath)) {
    const fd = fs.openSync(dbPath, 'r');
    const header = Buffer.alloc(16);
    let size = 0;
    try {
      size = fs.readSync(fd, header, 0, header.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (size !== header.length || header.toString('binary') !== 'SQLite format 3\0') {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.renameSync(dbPath, path.join(dataDir, 'cafe13-corrupt-' + stamp + '.db'));
    }
  }
  if (!fs.existsSync(dbPath)) {
    const template = path.join(appRoot(), 'prisma', 'dev-desktop.db');
    fs.copyFileSync(template, dbPath);
  }
  // Prisma SQLite URLs use forward slashes on every platform.
  return 'file:' + dbPath.split(path.sep).join('/');
}

/**
 * EMBEDDED mode: run the full Next.js server inside the main process against
 * the local SQLite DB. The app works with zero connectivity; LAN devices
 * reach it via this machine's IP.
 */
async function startEmbeddedServer() {
  require('./node-polyfills.cjs');

  const appDir = appRoot();
  const args = parseArgs(process.argv.slice(1));
  const dataDir = app.getPath('userData');
  configurePrismaEngine(appDir, dataDir);

  // Keep cwd at the app root: Next's module resolution (lazy route chunks)
  // and db-boot's project-root lookup are cwd-relative. The uploads dir is
  // redirected via env instead (see src/lib/storage.ts).
  const dbUrl = bootstrapDatabase();
  const port = await findFreePort(args.port || 3080);
  const lanUrl = 'http://' + detectLanIp() + ':' + port;

  process.env.NODE_ENV = 'production';
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  // Desktop bundle lives in .next-desktop (next.config.js distDir), never in
  // the dev server's .next — dev on-demand compilation must not be able to
  // rewrite production chunks.
  process.env.NEXT_DIST_DIR = '.next-desktop';
  process.env.PORT = String(port);
  process.env.HOSTNAME = '0.0.0.0';
  process.env.DATABASE_URL = dbUrl;
  process.env.UPLOADS_DIR = path.join(dataDir, 'uploads');
  process.env.NEXTAUTH_URL = 'http://localhost:' + port;
  process.env.NEXTAUTH_SECRET = ensureSecret();
  process.env.PUBLIC_APP_URL = lanUrl;
  process.env.DESKTOP_EMBEDDED = '1';
  process.env.PRISMA_SCHEMA_PATH = path.join(appRoot(), 'prisma', 'schema.desktop.prisma');
  process.env.AGENT_CAFE_ID = readDesktopMeta().cafeId || '';

  // Boot the Next production build. Requires .next-desktop in the package
  // (the build pipeline runs `next build` with NEXT_DIST_DIR before
  // electron-builder).
  const next = require('next')({ dev: false, dir: appDir });
  await next.prepare();
  const srv = http.createServer(next.getRequestHandler());
  await new Promise(function (resolve, reject) {
    srv.once('error', reject);
    srv.listen(port, '0.0.0.0', resolve);
  });

  localServer = {
    port: port,
    url: 'http://localhost:' + port,
    lanUrl: lanUrl,
    server: srv,
  };
  startAgentServices().catch(function (error) {
    agentServiceStatus.state = 'error';
    agentServiceStatus.error = String((error && error.message) || error);
    console.error('[desktop] agent services failed:', agentServiceStatus.error);
  });
  return localServer;
}

/** Lightweight reachability probe: plain GET / with a short timeout. */
function checkServer(serverUrl, timeoutMs) {
  return new Promise(function (resolve) {
    let settled = false;
    function done(ok, status) {
      if (settled) return;
      settled = true;
      resolve({ ok: ok, status: status });
    }
    let lib = http;
    let target = serverUrl + '/';
    try {
      const u = new URL(serverUrl);
      lib = u.protocol === 'https:' ? https : http;
      target = u.toString();
    } catch (e) {
      done(false, 0);
      return;
    }
    const timer = setTimeout(function () {
      if (req && req.destroy) req.destroy();
      done(false, 0);
    }, timeoutMs || HEALTH_TIMEOUT_MS);
    if (timer.unref) timer.unref();
    let req;
    try {
      req = lib.get(target, function (res) {
        clearTimeout(timer);
        // Any HTTP response (even 404/500) means the server host is up.
        done(true, res.statusCode || 0);
        if (res.resume) res.resume();
      });
    } catch (e) {
      clearTimeout(timer);
      done(false, 0);
      return;
    }
    req.on('error', function () {
      clearTimeout(timer);
      done(false, 0);
    });
  });
}

function targetUrl() {
  return resolveServerUrl() + resolveEntryPath();
}

function offlinePagePath() {
  return path.join(__dirname, 'offline.html');
}

function showOffline() {
  if (!mainWindow || offlineMode) return;
  offlineMode = true;
  mainWindow.loadFile(offlinePagePath(), {
    query: { server: resolveServerUrl() },
  });
}

function showOnline() {
  if (!mainWindow) return;
  // Never disrupt a live page: only (re)load when we were showing the
  // offline page or still need an initial load.
  const current = mainWindow.webContents.getURL();
  const needsLoad = offlineMode || !current || current.indexOf('file://') === 0;
  offlineMode = false;
  if (needsLoad) mainWindow.loadURL(targetUrl());
}

function createWindow() {
  const cfg = readConfig();
  const args = parseArgs(process.argv.slice(1));
  const startKiosk = !!(args.kiosk || cfg.kiosk);
  const startFullscreen = !!(args.fullscreen || cfg.fullscreen || startKiosk);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#1a120b',
    title: 'Cafe 13',
    autoHideMenuBar: true,
    kiosk: startKiosk,
    fullscreen: startFullscreen,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', function () {
    if (mainWindow) mainWindow.show();
  });

  // Keep navigation inside the served origin; anything else goes
  // to the system browser (payment links, external docs, ...).
  function isAllowedNavigation(url) {
    try {
      const allowed = new URL(resolveServerUrl()).origin;
      return new URL(url).origin === allowed;
    } catch (e) {
      return false;
    }
  }

  mainWindow.webContents.on('will-navigate', function (event, url) {
    if (url.indexOf('file://') === 0) return; // offline page
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(function (details) {
    if (isAllowedNavigation(details.url)) {
      return { action: 'allow' };
    }
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Network failure inside the app -> bundled offline page (remote mode).
  mainWindow.webContents.on('did-fail-load', function (event, code, desc, url) {
    if (!mainWindow) return;
    const current = mainWindow.webContents.getURL();
    if (current.indexOf('file://') === 0) return; // already offline
    if (code !== -3) {
      // -3 = ABORTED (e.g. superseded navigation), ignore.
      showOffline();
    }
  });

  mainWindow.on('close', function (event) {
    if (resolveMode() === 'embedded' && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Boot the right backend, then load the window. */
async function boot() {
  const mode = resolveMode();
  if (mode === 'embedded') {
    try {
      await startEmbeddedServer();
    } catch (e) {
      bootError = String((e && e.message) || e);
      console.error('[desktop] embedded server failed:', bootError);
    }
  }
  createWindow();
  if (mode === 'remote') {
    // Probe first so a dead server immediately shows the offline page
    // instead of a blank Chromium error on old Windows.
    checkServer(resolveServerUrl(), HEALTH_TIMEOUT_MS).then(function (r) {
      if (!mainWindow) return;
      if (r.ok) showOnline();
      else showOffline();
    });
  } else if (bootError) {
    showOffline(); // offline page doubles as an error surface (server field)
  } else {
    showOnline();
  }
}

function backupDatabase() {
  if (resolveMode() !== 'embedded') {
    return { ok: false, error: 'نسخه پشتیبان فقط در حالت دسکتاپ مستقل' };
  }
  try {
    const dataDir = app.getPath('userData');
    const src = path.join(dataDir, DB_FILE);
    const backupDir = path.join(dataDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const d = new Date();
    const stamp =
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') +
      '-' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
    const dest = path.join(backupDir, 'cafe13-' + stamp + '.db');
    fs.copyFileSync(src, dest);
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function buildTray() {
  try {
    const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
    let image = null;
    if (fs.existsSync(iconPath)) image = nativeImage.createFromPath(iconPath);
    tray = new Tray(image && !image.isEmpty() ? image : undefined);
  } catch (e) {
    return; // tray is optional (e.g. minimal Win7 shells)
  }
  const cfg = readConfig();
  const embedded = resolveMode() === 'embedded';
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'نمایش / مخفی کردن',
      click: function () {
        if (!mainWindow) {
          showMainWindow();
        } else if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'بارگذاری مجدد',
      click: function () {
        if (mainWindow) mainWindow.reload();
      },
    },
    {
      label: 'کپی نشانی موبایل و مرورگر',
      enabled: embedded && !!localServer,
      click: function () {
        const value = lanServerUrl();
        if (value) clipboard.writeText(value);
      },
    },
    {
      label: 'تمام‌صفحه',
      type: 'checkbox',
      checked: !!(mainWindow && mainWindow.isFullScreen()),
      click: function (item) {
        if (mainWindow) mainWindow.setFullScreen(item.checked);
        writeConfig({ fullscreen: item.checked });
      },
    },
    {
      label: 'اجرای خودکار با ویندوز',
      type: 'checkbox',
      checked: cfg.autoStart !== false,
      click: function (item) {
        writeConfig({ autoStart: item.checked });
        applyAutoStart();
      },
    },
    {
      label: 'چاپ رسید صفحه جاری',
      click: function () {
        printCurrentPage(false);
      },
    },
    {
      label: 'تنظیمات سرور…',
      click: function () {
        openSettingsWindow();
      },
    },
  ].concat(
    embedded
      ? [
          {
            label: 'نسخه پشتیبان دیتابیس',
            click: function () {
              const r = backupDatabase();
              if (r.ok) {
                dialog.showMessageBox({
                  type: 'info',
                  title: 'نسخه پشتیبان',
                  message: 'پشتیبان گرفته شد',
                  detail: r.path,
                });
              } else {
                dialog.showErrorBox('پشتیبان ناموفق', r.error || '');
              }
            },
          },
        ]
      : [],
    [
      { type: 'separator' },
      {
        label: 'درباره Cafe 13',
        click: function () {
          dialog.showMessageBox({
            type: 'info',
            title: 'Cafe 13',
            message: 'Cafe 13 — نسخه دسکتاپ ویندوز',
            detail:
              (embedded ? 'حالت: سرور محلی (آفلاین کامل)\n' : 'حالت: اتصال به سرور\n') +
              'سرور: ' +
              resolveServerUrl() +
              (lanServerUrl() ? '\nموبایل و مرورگر: ' + lanServerUrl() : '') +
              '\nElectron ' +
              process.versions.electron,
          });
        },
      },
      {
        label: 'خروج',
        click: function () {
          isQuitting = true;
          app.quit();
        },
      },
    ]
  ));
  tray.setToolTip('Cafe 13');
  tray.setContextMenu(contextMenu);
  tray.on('click', function () {
    if (!mainWindow) {
      showMainWindow();
    } else if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function applyAutoStart() {
  try {
    const cfg = readConfig();
    const openAtLogin = cfg.autoStart !== false;
    app.setLoginItemSettings({ openAtLogin: openAtLogin, path: process.execPath });
  } catch (e) {
    // setLoginItemSettings can throw on some Win7 configurations; ignore.
  }
}

function printCurrentPage(silent) {
  if (!mainWindow) return;
  const contents = mainWindow.webContents;
  try {
    contents.print(
      { silent: !!silent, printBackground: true, color: true },
      function (success, failureReason) {
        if (!success && !silent) {
          dialog.showErrorBox('چاپ ناموفق بود', String(failureReason || 'خطای ناشناخته'));
        }
      }
    );
  } catch (e) {
    dialog.showErrorBox('چاپ ناموفق بود', String((e && e.message) || e));
  }
}

// ── IPC bridge for the renderer + offline page ──────────────────────────────
ipcMain.handle('cafe13:get-info', function () {
  return {
    mode: resolveMode(),
    serverUrl: resolveServerUrl(),
    entryPath: resolveEntryPath(),
    dbPath: resolveMode() === 'embedded' ? path.join(app.getPath('userData'), DB_FILE) : null,
    localPort: localServer ? localServer.port : null,
    lanIp: detectLanIp(),
    lanUrl: lanServerUrl(),
    bootError: bootError,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    platform: process.platform,
    agentServices: Object.assign({}, agentServiceStatus),
  };
});

ipcMain.handle('cafe13:check-server', function (event, url) {
  return checkServer(normalizeUrl(url) || resolveServerUrl(), HEALTH_TIMEOUT_MS);
});

ipcMain.handle('cafe13:copy-share-url', function () {
  const value = lanServerUrl();
  if (!value) return { ok: false };
  clipboard.writeText(value);
  return { ok: true, url: value };
});

ipcMain.handle('cafe13:set-server-url', function (event, url) {
  const clean = normalizeUrl(url);
  if (!clean) return { ok: false, error: 'نشانی سرور معتبر نیست' };
  writeConfig({ serverUrl: clean });
  return { ok: true, serverUrl: clean };
});

ipcMain.handle('cafe13:retry', function () {
  return checkServer(resolveServerUrl(), HEALTH_TIMEOUT_MS).then(function (r) {
    // On explicit user retry, always attempt the load even if the
    // main-process probe failed: the renderer's Chromium networking is the
    // proven path (system browsers reach servers the Node probe sometimes
    // cannot, e.g. proxy quirks). A truly dead server bounces straight back
    // via did-fail-load → offline page, so this cannot strand the user.
    showOnline();
    return r;
  });
});

ipcMain.handle('cafe13:print', function (event, opts) {
  printCurrentPage(opts && opts.silent);
  return { ok: true };
});

ipcMain.handle('cafe13:open-external', function (event, url) {
  const s = String(url || '');
  if (/^https?:\/\//.test(s)) shell.openExternal(s);
  return { ok: true };
});

ipcMain.handle('cafe13:backup-db', function () {
  return backupDatabase();
});

// ── Server settings window (tray → تنظیمات سرور) ────────────────────────────
// Lets the manager pick the backend themselves: the app's own local server
// (embedded, offline-first) or an explicit shop-server address (remote).
// Saved to userData config; the app relaunches to apply the switch.
let settingsWindow = null;

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 760,
    resizable: true,
    minimizable: false,
    maximizable: false,
    title: 'تنظیمات سرور — Cafe 13',
    autoHideMenuBar: true,
    show: false,
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.once('ready-to-show', function () {
    if (settingsWindow) settingsWindow.show();
  });
  settingsWindow.on('closed', function () {
    settingsWindow = null;
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
}

ipcMain.handle('cafe13:get-settings', function () {
  const cfg = readConfig();
  const model = modelSettings(cfg);
  return {
    mode: resolveMode(),
    savedMode: cfg.mode || '',
    serverUrl: normalizeUrl(cfg.serverUrl) || '',
    currentUrl: resolveServerUrl(),
    lanIp: detectLanIp(),
    lanUrl: lanServerUrl(),
    localPort: localServer ? localServer.port : null,
    modelApiKeyConfigured: Boolean(model.apiKey),
    modelBaseUrl: model.baseUrl,
    openobserveAuthorizationConfigured: Boolean(readStoredSecret(cfg, 'openobserveAuthorizationEncrypted', 'openobserveAuthorization')),
    openobserveTracesUrl: normalizeUrl(cfg.openobserveTracesUrl) || '',
    openobserveDashboardUrl: normalizeUrl(cfg.openobserveDashboardUrl) || '',
    agentServices: Object.assign({}, agentServiceStatus),
  };
});

ipcMain.handle('cafe13:save-settings', function (event, opts) {
  const mode = opts && opts.mode === 'remote' ? 'remote' : 'embedded';
  const patch = { mode: mode };
  if (mode === 'remote') {
    const clean = normalizeUrl(opts && opts.serverUrl);
    if (!clean) return { ok: false, error: 'نشانی سرور معتبر نیست' };
    patch.serverUrl = clean;
  }
  if (opts && opts.modelBaseUrl !== undefined) {
    const clean = normalizeUrl(opts.modelBaseUrl);
    if (opts.modelBaseUrl && !clean) return { ok: false, error: 'نشانی سرویس مدل معتبر نیست' };
    patch.modelBaseUrl = clean;
  }
  Object.assign(patch, storedSecretPatch('modelApiKeyEncrypted', 'modelApiKey', opts && opts.modelApiKey));
  Object.assign(patch, storedSecretPatch('openobserveAuthorizationEncrypted', 'openobserveAuthorization', opts && opts.openobserveAuthorization));
  for (const key of ['openobserveTracesUrl', 'openobserveDashboardUrl']) {
    if (!opts || opts[key] === undefined) continue;
    const clean = normalizeUrl(opts[key]);
    if (opts[key] && !clean) return { ok: false, error: 'نشانی OpenObserve معتبر نیست' };
    patch[key] = clean;
  }
  writeConfig(patch);
  return { ok: true, mode: mode, needsRestart: true };
});

ipcMain.handle('cafe13:restart-app', function () {
  // Relaunch without mode CLI flags so the saved settings take effect.
  const filtered = process.argv.slice(1).filter(function (a) {
    return (
      a !== '--embedded' &&
      a !== '--fullscreen' &&
      a !== '--kiosk' &&
      a.indexOf('--remote=') !== 0 &&
      a.indexOf('--server=') !== 0
    );
  });
  app.relaunch({ args: filtered });
  app.exit(0);
  return { ok: true };
});

app.on('second-instance', function (event, argv) {
  const args = parseArgs(argv.slice(1));
  const requested = args.server || args.remote ? normalizeUrl(args.server || args.remote) : '';
  const urlChanged = !!(requested && requested !== resolveServerUrl());
  if (urlChanged) writeConfig({ serverUrl: requested });
  const hadWindow = !!mainWindow;
  showMainWindow();
  if (hadWindow) {
    // Only reload when we were offline or the server URL actually changed;
    // otherwise just focus without interrupting the live page.
    if (offlineMode || urlChanged) showOnline();
  } else if (bootError) {
    showOffline();
  } else {
    showOnline();
  }
});

app.whenReady().then(function () {
  installDesktopErrorLog();
  boot().then(function () {
    buildTray();
  });
  applyAutoStart();
  app.on('activate', function () {
    showMainWindow();
  });
});

app.on('before-quit', function () {
  isQuitting = true;
  if (agentWorker) agentWorker.kill();
  if (n8nProcess) n8nProcess.kill();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin' && (resolveMode() !== 'embedded' || isQuitting)) app.quit();
});
