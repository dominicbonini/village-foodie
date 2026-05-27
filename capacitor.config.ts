import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.hatchgrab.app',
  appName: 'HatchGrab',
  webDir: 'out',
  server: {
    url: 'https://www.hatchgrab.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#1C1C1E',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#1C1C1E',
      showSpinner: false,
      launchAutoHide: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#F5A623',
      sound: 'beep.wav',
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
