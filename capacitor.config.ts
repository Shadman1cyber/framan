import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.farmancoffeeshop.app',
  appName: 'Farman Coffee Shop',
  server: {
    url: 'https://farman-cec-hesabetam.runflare.cloud',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
