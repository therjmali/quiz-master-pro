import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Offline-first Android build: the entire web app is bundled inside the APK (webDir) and served
 * from the device through Capacitor's local https://localhost origin. It never loads a website,
 * so it opens and works with no network at all.
 */
const config: CapacitorConfig = {
  appId: 'com.rjmali.quizmaster',
  appName: 'R.J QUIZ',
  webDir: 'dist',
  backgroundColor: '#0a0a10',
  server: { androidScheme: 'https' },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
