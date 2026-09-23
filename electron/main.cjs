'use strict';

/**
 * Cafe 13 — universal native desktop shell for Windows 7 / 8.1 / 10 / 11.
 *
 * Pinned to Electron 22 (Chromium 108, Node 16): the last Electron major that
 * runs on Windows 7 SP1 and 8.1. Electron 23+ requires Windows 10+. Newer
 * Windows versions run Electron 22 apps without issues, so a single build is
 * universal across 7 → 11.
 *
 * Architecture (deliberately a thin client, same model as the Capacitor mobile
 * app): the window loads the shop server URL. The Next.js 14 backend requires
 * Node >= 18 and PostgreSQL, neither of which can be bundled into a Win7-era
 * runtime — so the server runs on the shop PC / Docker host and every desktop
 * terminal (cashier, kiosk) connects to it over the LAN. Offline menu display
 * is covered by the app's PWA service worker; when the server is unreachable
 * this shell shows a bundled Persian offline page with auto-retry.
 *
 * Node 16 compatibility notes (Electron 22 main process):
 * - CommonJS only, no ESM `import`.
 * - No global `fetch`, no `structuredClone`, no `Array.prototype.at`.
 */
const { app, BrowserWindow, Menu, Tray, shell, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const APP_ID = 'com.farmancoffeeshop.app';
const DEFAULT_SERVER_URL = 'http://localhost:3080';
const DEFAULT_ENTRY_PATH = '/';
const CONFIG_FILE = 'cafe13-desktop-config.json';
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

/** Parse `--key=value` / `--flag` CLI args (works on Win7 cmd too). */
function parseArgs(argv) {
  const out = {};
  argv.forEach(function (a) {
    if (a.indexOf('--server=') === 0) out.server = a.slice('--server='.length);
    else if (a.indexOf('--entry=') === 0) out.entry = a.slice('--entry='.length);
    else if (a === '--kiosk') out.kiosk = true;
    else if (a === '--fullscreen') out.fullscreen = true;
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
  let current = readConfig();
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

/** Server URL precedence: CLI > env > saved config > default. */
function resolveServerUrl() {
  const args = parseArgs(process.argv.slice(1));
  const envUrl =
    process.env.DESKTOP_SERVER_URL ||
    process.env.CAPACITOR_SERVER_URL ||
    process.env.PUBLIC_APP_URL ||
    '';
  const cfg = readConfig();
  return (
    normalizeUrl(args.server) ||
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
    // Avoid keeping the timer alive on old Node.
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

  // Keep navigation inside the configured server origin; anything else goes
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

  // Network failure inside the app -> bundled offline page.
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

  // Boot: probe first so a dead server immediately shows the offline page
  // instead of a blank Chromium error on old Windows.
  checkServer(resolveServerUrl(), HEALTH_TIMEOUT_MS).then(function (r) {
    if (!mainWindow) return;
    if (r.ok) showOnline();
    else showOffline();
  });
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
    { type: 'separator' },
    {
      label: 'درباره Cafe 13',
      click: function () {
        dialog.showMessageBox({
          type: 'info',
          title: 'Cafe 13',
          message: 'Cafe 13 — نسخه دسکتاپ ویندوز',
          detail: 'سرور: ' + resolveServerUrl() + '\nElectron ' + process.versions.electron,
        });
      },
    },
    {
      label: 'خروج',
      click: function () {
        app.quit();
      },
    },
  ]);
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
    serverUrl: resolveServerUrl(),
    entryPath: resolveEntryPath(),
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
    if (r.ok) showOnline();
    else showOffline();
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

app.on('second-instance', function (event, argv) {
  const args = parseArgs(argv.slice(1));
  if (args.server && normalizeUrl(args.server)) {
    writeConfig({ serverUrl: normalizeUrl(args.server) });
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    showOnline();
  }
});

app.whenReady().then(function () {
  createWindow();
  buildTray();
  applyAutoStart();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
