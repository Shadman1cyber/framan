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
const { app, BrowserWindow, Menu, Tray, shell, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const crypto = require('crypto');

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

app.setAppUserModelId(APP_ID);

// Single instance: a second launch just focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let offlineMode = false;
let localServer = null; // { port, url } — embedded mode only
let bootError = null;

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

/** First non-internal IPv4 address (for QR codes / phone access). */
function detectLanIp() {
  const ifaces = os.networkInterfaces();
  const names = Object.keys(ifaces);
  for (let i = 0; i < names.length; i++) {
    const addrs = ifaces[names[i]] || [];
    for (let j = 0; j < addrs.length; j++) {
      const a = addrs[j];
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
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

/** Build-time metadata (cafe id of the seeded template DB). */
function appRoot() {
  // electron/ lives directly under the app root in BOTH layouts: the
  // packaged app (asar: false → <install>/resources/app/electron) and the
  // dev script (`electron electron/main.cjs` → <project>/electron).
  // app.getAppPath() is unreliable in script mode (returns the main script's
  // dir), so derive from __dirname.
  return path.join(__dirname, '..');
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

  // Keep cwd at the app root: Next's module resolution (lazy route chunks)
  // and db-boot's project-root lookup are cwd-relative. The uploads dir is
  // redirected via env instead (see src/lib/storage.ts).
  const dbUrl = bootstrapDatabase();
  const port = await findFreePort(args.port || 3080);

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
  process.env.PUBLIC_APP_URL = 'http://' + detectLanIp() + ':' + port;
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

  localServer = { port: port, url: 'http://localhost:' + port };
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
  offlineMode = false;
  mainWindow.loadURL(targetUrl());
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

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
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
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else {
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
              '\nElectron ' +
              process.versions.electron,
          });
        },
      },
      {
        label: 'خروج',
        click: function () {
          app.quit();
        },
      },
    ]
  ));
  tray.setToolTip('Cafe 13');
  tray.setContextMenu(contextMenu);
  tray.on('click', function () {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
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
    lanIp: detectLanIp(),
    bootError: bootError,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    platform: process.platform,
  };
});

ipcMain.handle('cafe13:check-server', function (event, url) {
  return checkServer(normalizeUrl(url) || resolveServerUrl(), HEALTH_TIMEOUT_MS);
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
    width: 460,
    height: 430,
    resizable: false,
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
  return {
    mode: resolveMode(),
    savedMode: cfg.mode || '',
    serverUrl: normalizeUrl(cfg.serverUrl) || '',
    currentUrl: resolveServerUrl(),
    lanIp: detectLanIp(),
    localPort: localServer ? localServer.port : null,
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
  if ((args.server || args.remote) && normalizeUrl(args.server || args.remote)) {
    writeConfig({ serverUrl: normalizeUrl(args.server || args.remote) });
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    showOnline();
  }
});

app.whenReady().then(function () {
  boot();
  buildTray();
  applyAutoStart();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
