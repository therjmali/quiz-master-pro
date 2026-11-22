/**
 * Distraction-free mode: hides the system status bar (clock, battery, network) so nothing competes with the app.
 *
 * Three modes (Settings -> Gestures & shortcuts):
 *   always  - hidden on every screen (default)
 *   quiz    - hidden only while a quiz is on screen
 *   off     - never hidden
 *
 * Native Android / iOS only (uses @capacitor/status-bar); on the web build every call is a no-op.
 * Every call is wrapped: a missing plugin or a native error must never break the app.
 */
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

export const IMMERSIVE_KEY = 'qmp_immersive_quiz';          // v3.12 switch: 'off' = never hide
export const STATUS_BAR_MODE_KEY = 'qmp_status_bar_mode_v2'; // v3.14 mode
export type StatusBarMode = 'always' | 'quiz' | 'off';

export function getStatusBarMode(): StatusBarMode {
  try {
    const v = localStorage.getItem(STATUS_BAR_MODE_KEY);
    if (v === 'always' || v === 'quiz' || v === 'off') return v;
    // migrate the old on/off switch: 'off' stays off, everything else gets the new default
    return localStorage.getItem(IMMERSIVE_KEY) === 'off' ? 'off' : 'always';
  } catch { return 'always'; }
}

export function setStatusBarMode(mode: StatusBarMode): void {
  try {
    localStorage.setItem(STATUS_BAR_MODE_KEY, mode);
    localStorage.setItem(IMMERSIVE_KEY, mode === 'off' ? 'off' : 'on');
  } catch { /* storage full */ }
  window.dispatchEvent(new Event('qmp-status-bar-mode'));
}

/** Kept for older callers: "enabled" means the bar is hidden at least during quizzes. */
export function isImmersiveEnabled(): boolean { return getStatusBarMode() !== 'off'; }
export function setImmersiveEnabled(on: boolean): void { setStatusBarMode(on ? 'always' : 'off'); }

/** Should the bar be hidden right now? `inQuiz` tells whether a quiz is on screen. */
export function shouldHideStatusBar(mode: StatusBarMode, inQuiz: boolean): boolean {
  return mode === 'always' || (mode === 'quiz' && inQuiz);
}

function available(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('StatusBar'); } catch { return false; }
}

export async function hideSystemBars(): Promise<void> {
  if (!available()) return;
  try { await StatusBar.hide(); } catch (e) { console.warn('StatusBar.hide failed:', e); }
}

export async function showSystemBars(): Promise<void> {
  if (!available()) return;
  try { await StatusBar.show(); } catch (e) { console.warn('StatusBar.show failed:', e); }
}

/** Apply the mode for the current screen. */
export async function applyStatusBar(inQuiz: boolean): Promise<void> {
  if (shouldHideStatusBar(getStatusBarMode(), inQuiz)) await hideSystemBars(); else await showSystemBars();
}
