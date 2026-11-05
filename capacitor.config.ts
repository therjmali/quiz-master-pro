import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Offline-first Android build: the entire web app is bundled inside the APK (webDir) and served
 * from the device through Capacitor's local https://localhost origin. It never loads a website,
 * so it opens and works with no network at all.
 *
 * Orientation: 'any' — full sensor rotation on tablets/phones.  The web layer handles
 * dynamic re-layout via CSS (dvh/dvw, flexbox, media queries) so no app restart is needed
 * when the device is rotated.  CSS viewport-unit correction (zoom.ts) keeps full-height
 * screens correct at every zoom level in both portrait and landscape.
 */
const config: CapacitorConfig = {
  appId: 'com.rjmali.quizmaster',
  appName: 'R.J QUIZ',
  webDir: 'dist',
  backgroundColor: '#080a18',
  server: { androidScheme: 'https' },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    // Full sensor orientation — phone and tablet, portrait and landscape
    orientation: 'any',
  },
  ios: {
    // Match Android: full sensor orientation on iOS too
    orientation: 'all',
  },
};

export default config;
