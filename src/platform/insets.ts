/**
 * Native system-bar insets (Android). MainActivity measures how much the status / navigation bars cover the
 * WebView and exposes it as `QmNative.getInsets()` and as --qmp-native-inset-* CSS variables; this file just
 * (re)applies it after loads, rotations and resumes. No-op in the browser.
 */
type NativeInsets = { top: number; right: number; bottom: number; left: number };

function readNative(): NativeInsets | null {
  try {
    const b = (window as unknown as { QmNative?: { getInsets?: () => string } }).QmNative;
    if (typeof b?.getInsets !== 'function') return null;
    const v = JSON.parse(b.getInsets()) as NativeInsets;
    return [v.top, v.right, v.bottom, v.left].every(n => Number.isFinite(n) && n >= 0 && n < 200) ? v : null;
  } catch { return null; }
}

export function applyNativeInsets(): void {
  const v = readNative();
  if (!v) return;
  const s = document.documentElement.style;
  s.setProperty('--qmp-native-inset-top', `${v.top}px`);
  s.setProperty('--qmp-native-inset-right', `${v.right}px`);
  s.setProperty('--qmp-native-inset-bottom', `${v.bottom}px`);
  s.setProperty('--qmp-native-inset-left', `${v.left}px`);
}

export function initNativeInsets(): void {
  if (typeof window === 'undefined') return;
  applyNativeInsets();
  const again = () => { applyNativeInsets(); setTimeout(applyNativeInsets, 300); };
  window.addEventListener('resize', again, { passive: true });
  window.addEventListener('orientationchange', again, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) again(); });
  // The first layout pass may finish after the page: look once more shortly after start.
  setTimeout(applyNativeInsets, 500);
  setTimeout(applyNativeInsets, 1500);
}
