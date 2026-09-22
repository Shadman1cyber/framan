import type { CapacitorConfig } from '@capacitor/cli';

// Override the hosted app URL for local device testing when needed.
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim()
  || 'http://10.216.186.246:3080';

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
    url: `${new URL(serverUrl).origin}/`,
    cleartext: true,
    errorPath: 'index.html',
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
