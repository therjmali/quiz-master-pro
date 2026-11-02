/** Haptic feedback utilities — silently no-op when vibrate API is unavailable or haptics are disabled */

function isEnabled(): boolean {
  try { return localStorage.getItem('qmp_haptics') !== 'false'; } catch { return true; }
}

function vibrate(pattern: number | number[]) {
  try { if (isEnabled() && navigator.vibrate) navigator.vibrate(pattern); } catch {}
}

/** Light tap — button presses, tab switches */
export function hapticTap() { vibrate(10); }

/** Success — correct answer reveal */
export function hapticSuccess() { vibrate([10, 50, 10]); }

/** Error — wrong answer reveal */
export function hapticError() { vibrate([30, 30, 30]); }

/** Swipe — screen transition */
export function hapticSwipe() { vibrate(5); }

/** Heavy — delete, destructive actions */
export function hapticHeavy() { vibrate(20); }

/** Toggle haptics on/off */
export function setHapticsEnabled(v: boolean) {
  try { localStorage.setItem('qmp_haptics', String(v)); } catch {}
}

/** Check if haptics are enabled */
export function getHapticsEnabled(): boolean { return isEnabled(); }
