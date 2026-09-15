import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.farmancoffeeshop.app',
  appName: 'Farman Coffee Shop',
  server: {
    url: 'https://your-deployed-app-url.com',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
