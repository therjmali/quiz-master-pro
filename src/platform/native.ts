/** Runtime/platform facts shared by the platform modules. Everything here is safe to call on the web. */
import { Capacitor } from '@capacitor/core';

declare const __APP_VERSION__: string;

export function isNative(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

export function platformName(): 'android' | 'ios' | 'web' {
  try {
    const p = Capacitor.getPlatform();
    return p === 'android' || p === 'ios' ? p : 'web';
  } catch { return 'web'; }
}

export function appVersion(): string {
  try { return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'; } catch { return '0.0.0'; }
}

export function isStandalonePwa(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch { return false; }
}

/** `import.meta.env` that never throws under Node-based tests. */
export function env(name: string): string {
  try {
    const e = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return String(e?.[name] ?? '').trim();
  } catch { return ''; }
}
