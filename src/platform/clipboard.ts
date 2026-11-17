import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';

interface NativeClipboardBridge {
  readClipboard?: () => string;
  writeClipboard?: (text: string) => boolean;
}

const getNativeBridge = (): NativeClipboardBridge | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { QmNative?: NativeClipboardBridge; RJNative?: NativeClipboardBridge };
  return w.QmNative || w.RJNative;
};

/**
 * Reads plain text from the system clipboard.
 * On Capacitor native apps (Android/iOS), uses native bridge or `@capacitor/clipboard`
 * which bypasses WebView clipboard permission restrictions that cause "Clipboard blocked" errors.
 * On Web / PWA, uses standard `navigator.clipboard.readText()`.
 */
export async function readClipboardText(): Promise<string> {
  // 1. Android Native JavascriptInterface bridge (synchronous, direct Android ClipboardManager access)
  const bridge = getNativeBridge();
  if (bridge?.readClipboard) {
    try {
      const val = bridge.readClipboard();
      if (typeof val === 'string' && val.length > 0) return val;
    } catch (e) {
      console.warn('NativeBridge readClipboard error:', e);
    }
  }

  // 2. Capacitor native plugin bridge (@capacitor/clipboard)
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Clipboard.read();
      if (res && typeof res.value === 'string' && res.value.length > 0) {
        return res.value;
      }
    } catch (e) {
      console.warn('Native Clipboard.read error, falling back to navigator.clipboard:', e);
    }
  }

  // 3. Web / PWA standard navigator.clipboard
  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      // If native platform already checked and was empty, return empty string instead of throwing
      if (Capacitor.isNativePlatform() || bridge?.readClipboard) {
        return '';
      }
      throw e;
    }
  }

  throw new Error('Clipboard access unavailable');
}

/**
 * Writes plain text to the system clipboard across native Capacitor and Web.
 */
export async function writeClipboardText(text: string): Promise<void> {
  const bridge = getNativeBridge();
  if (bridge?.writeClipboard) {
    try {
      if (bridge.writeClipboard(text)) return;
    } catch (e) {
      console.warn('NativeBridge writeClipboard error:', e);
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await Clipboard.write({ string: text });
      return;
    } catch (e) {
      console.warn('Native Clipboard.write error, falling back to navigator.clipboard:', e);
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback for older browsers
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(ta);
      return;
    } catch {
      document.body.removeChild(ta);
    }
  }

  throw new Error('Clipboard write unavailable');
}
