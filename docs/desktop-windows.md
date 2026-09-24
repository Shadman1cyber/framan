# Cafe 13 — Universal Native Desktop for Windows (7 / 8.1 / 10 / 11)

One installer family covers every Windows version from 7 SP1 to 11, from a
single codebase (`electron/`). No admin rights needed. **Offline-first, like
the iOS/Android apps**: the app embeds the whole platform and works with zero
connectivity.

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

## Offline-first architecture (mirrors the mobile apps)

The iOS/Android apps keep a local database and sync when online. The desktop
app embeds the **entire platform inside itself**:

```
Electron 22 window (Chromium 108)
  └─ main process (Node 16 + undici/web-streams polyfills)
      ├─ embedded Next.js 14 production server (.next)
      └─ local SQLite database (userData/cafe13.db, seeded template)
```

- **Zero connectivity needed** — orders, menu, inventory, staff, financial
  dashboard, QR codes: everything runs locally on the manager PC.
- The server binds `0.0.0.0`, so **phones and other terminals on the LAN
  connect to the manager PC** (`PUBLIC_APP_URL` = its LAN IP, auto-detected).
- The local DB is a seeded template copied to `%APPDATA%\Cafe13\cafe13.db`
  on first run. Tray menu → **نسخه پشتیبان دیتابیس** makes timestamped
  backups to `%APPDATA%\Cafe13\backups\`.
- **REMOTE mode** (`--remote=http://...`) — thin client to an existing shop
  server instead of the embedded one (same model as the Capacitor shells);
  offline shows the bundled Persian page with auto-retry.

Auth (`NEXTAUTH_SECRET`) is generated per installation and stored in
`%APPDATA%\Cafe13\cafe13-desktop-config.json`. Login: `/admin/login`,
owner account `admin@cafe13.ir` / `admin1234` (from the seed; change it!).

## Build

Run the full pipeline (Node 20 LTS; **Windows for release** — the runner
produces Windows Prisma engines; any OS for smoke tests):

```bash
npm run desktop:build          # x64 + ia32, NSIS + Portable (full pipeline)
npm run desktop:build:x64      # 64-bit only
```

The pipeline (`scripts/build-desktop.cjs`): generate the SQLite Prisma
client → `next build` → seeded template DB (`prisma/dev-desktop.db`) →
cafe-id meta → electron-builder.

> NOTE: a desktop build regenerates `@prisma/client` for **SQLite**. Run
> `npm run build` (or `./run.sh`) afterwards to restore the Postgres client
> for the server deployment.

GitHub Actions (`.github/workflows/build-windows-desktop.yml`) builds and
uploads the `.exe` artifacts automatically on push.

## Run / configure

```bash
npm run dev                 # (optional) dev server
npm run desktop:dev         # thin client → localhost:3080
npm run desktop:dev:embedded # embedded local server + local DB (offline)
```

The installed app defaults to **embedded mode** (offline-first).

Remote mode URL precedence: CLI `--remote=`/`--server=` → env
(`DESKTOP_SERVER_URL` / `CAPACITOR_SERVER_URL` / `PUBLIC_APP_URL`) → saved
in-app value → `http://localhost:3080`.

Other flags: `--entry=/admin/login` (start page), `--port=NNNN` (embedded
server port), `--kiosk` (fullscreen kiosk), `--fullscreen`.

Daily operation (tray icon, کنار ساعت ویندوز):

- نمایش / مخفی کردن، بارگذاری مجدد، تمام‌صفحه
- اجرای خودکار با ویندوز (auto-start, no admin needed)
- چاپ رسید صفحه جاری (receipt printing)
- نسخه پشتیبان دیتابیس (DB backup — embedded mode)

## OS support matrix

| OS | Arch | Notes |
|---|---|---|
| Windows 7 SP1 | x64 / ia32 | Needs Platform Update (KB2670838); use ia32 on 32-bit |
| Windows 8.1 | x64 / ia32 | Runs as-is |
| Windows 10 (all) | x64 | Runs as-is |
| Windows 11 | x64 | Runs as-is |

If SmartScreen warns on first launch (unsigned build): *More info → Run
anyway*. For public distribution, sign with a code-signing cert
(`CSC_LINK`/`CSC_KEY_PASSWORD`) — optional, never required for install.

## Troubleshooting

- **Windows Firewall prompt** on first launch → Allow (the embedded server
  binds 0.0.0.0 for LAN access). Private networks only.
- **Old Win7 without updates** → install SP1 + Platform Update (KB2670838).
- **Printers** → use the tray "چاپ رسید" or in-app print button; set the
  receipt printer as default for silent printing.
- **Phone can't connect** → same Wi-Fi/LAN, firewall allows the app, use the
  manager PC's IP (`http://<lan-ip>:<port>`).
- **Data** → lives in `%APPDATA%\Cafe13\cafe13.db`; use the tray backup
  regularly. Deleting app data resets to the seeded template.
