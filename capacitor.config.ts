import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.villagefoodie.app',
  appName: 'Village Foodie',
  server: {
    url: 'https://villagefoodie.co.uk',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#ffffff',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#354F52',
      showSpinner: false,
    },
  },
};

export default config;
