# Cafe 13 — Universal Native Desktop for Windows (7 / 8.1 / 10 / 11)

One installer family covers every Windows version from 7 SP1 to 11, from a
single codebase (`electron/`). No admin rights needed.

## What you get

| File | Use |
|---|---|
| `Cafe13-Desktop-<ver>-x64.exe` | NSIS installer, 64-bit (Win 7/8.1/10/11) |
| `Cafe13-Desktop-<ver>-ia32.exe` | NSIS installer, 32-bit (old Win 7/8.1 PCs) |
| `Cafe13-Desktop-<ver>-portable-<arch>.exe` | No-install: run from USB stick |

## Why Electron 22

Electron **22.3.27** (Chromium 108, Node 16) is the last major that boots on
Windows 7 SP1 / 8.1 — Electron 23+ requires Windows 10+. Windows 10/11 run
Electron 22 apps without issues, so pinning 22 is what makes the build
*universal*. Do **not** upgrade `electron` past 22 without dropping Win 7/8.1.

## Architecture: thin client (same model as the mobile app)

The desktop window loads the shop **server URL** (default
`http://localhost:3080`). The Next.js 14 backend needs Node ≥ 18 +
PostgreSQL, which cannot live inside a Win7-compatible runtime — so the
server runs once (Docker / `./run.sh --prod` / `./run.sh --docker` on the
back-office PC) and every cashier/kiosk terminal connects to it over the LAN.
This is exactly how the Capacitor Android/iOS app already works.

- Server unreachable → bundled Persian offline page (auto-retry every 5 s).
- Menu caching offline → PWA service worker (already in the web app).
- External links (payments, docs) → opened in the system browser, never
  trapped inside the app window.

## Build

On Windows (PowerShell), Node 20 LTS:

```powershell
.\scripts\build-windows.ps1          # x64 installer + portable
.\scripts\build-windows.ps1 -Arch all  # x64 + ia32
```

Or via npm (any OS with Node 20+; Windows artifacts cross-compile on Linux
too for smoke tests, final release should be built on Windows):

```bash
npm run desktop:dist:win    # x64 + ia32, NSIS + Portable
npm run desktop:dist:win64  # 64-bit only
```

GitHub Actions (`.github/workflows/build-windows-desktop.yml`) builds and
uploads the `.exe` artifacts automatically.

## Run / configure

```bash
npm run dev                                   # start the server first
npm run desktop:dev                           # desktop shell → localhost:3080
```

Server URL precedence (first match wins):

1. CLI flag: `Cafe13.exe --server=http://192.168.1.100:3080`
2. Env: `DESKTOP_SERVER_URL` (also honors `CAPACITOR_SERVER_URL`, `PUBLIC_APP_URL`)
3. Saved in-app value (offline page → ذخیره, stored in `%APPDATA%\Cafe 13\`)
4. Default: `http://localhost:3080` (server on the same PC)

Other flags: `--entry=/admin/login` (start page), `--kiosk` (fullscreen
kiosk), `--fullscreen`.

Daily operation (tray icon, کنار ساعت ویندوز):

- نمایش / مخفی کردن، بارگذاری مجدد، تمام‌صفحه
- اجرای خودکار با ویندوز (auto-start, no admin needed)
- چاپ رسید صفحه جاری (receipt printing, silent option via `window.cafe13.print({silent:true})`)

## OS support matrix

| OS | Arch | Notes |
|---|---|---|
| Windows 7 SP1 | x64 / ia32 | Needs [KB3063858](https://support.microsoft.com) & Aero-less fallback OK; use ia32 build on 32-bit |
| Windows 8.1 | x64 / ia32 | Runs as-is |
| Windows 10 (all) | x64 | Runs as-is |
| Windows 11 | x64 | Runs as-is |

If SmartScreen warns on first launch (unsigned build): *More info → Run
anyway*. For public distribution, sign with a code-signing cert
(`CSC_LINK`/`CSC_KEY_PASSWORD`) — optional, never required for install
(`requestedExecutionLevel: asInvoker`, per-user install).

## Troubleshooting

- **Offline page on launch** → server PC off / wrong IP / firewall. Allow
  Node.js through Windows Firewall on the server PC; verify
  `http://<server-ip>:3080` in a browser first.
- **Old Win7 without updates** → install SP1 + Platform Update (KB2670838).
- **Printers** → use the tray “چاپ رسید” or in-app print button; set the
  receipt printer as default for silent printing.
