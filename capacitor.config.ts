import type { CapacitorConfig } from '@capacitor/cli';

// Live URL for dev on a physical device:
//   CAPACITOR_SERVER_URL=http://<mac-lan-ip>:3080 npx cap sync ios
// If unset, no `server.url` is emitted so the app falls back to the
// bundled `www/` build instead of a dead placeholder URL.
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.farmancoffeeshop.app',
  appName: 'Cafe 13',
  webDir: 'www',
  appendUserAgent: 'FarmanStaffApp',
  ios: {
    contentInset: 'never'
  },
  server: {
    // Entry point inside the bundled web app (login screen for staff).
    appStartPath: '/admin/login',
    // Never open external URLs inside the WebView by default; they go to
    // the external browser. Keep the allow-list explicit per-host if needed.
    allowNavigation: [],
    ...(serverUrl
      ? {
          url: `${new URL(serverUrl).origin}/`,
          cleartext: true,
          errorPath: 'index.html',
        }
      : {}),
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
