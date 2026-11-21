/**
 * Immersive quiz mode: hides the system status bar (clock, battery, network) while a quiz is on screen so
 * nothing distracts from the questions, and brings it back when the quiz is left.
 *
 * Native Android / iOS only (uses @capacitor/status-bar); on the web build every call is a no-op.
 * Every call is wrapped: a missing plugin or a native error must never break a quiz.
 */
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

export const IMMERSIVE_KEY = 'qmp_immersive_quiz';

/** On by default; the switch in Settings -> Appearance turns it off. */
export function isImmersiveEnabled(): boolean {
  try { return localStorage.getItem(IMMERSIVE_KEY) !== 'off'; } catch { return true; }
}

export function setImmersiveEnabled(on: boolean): void {
  try { localStorage.setItem(IMMERSIVE_KEY, on ? 'on' : 'off'); } catch { /* storage full */ }
}

function available(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('StatusBar'); } catch { return false; }
}

export async function hideSystemBars(): Promise<void> {
  if (!available() || !isImmersiveEnabled()) return;
  try { await StatusBar.hide(); } catch (e) { console.warn('StatusBar.hide failed:', e); }
}

export async function showSystemBars(): Promise<void> {
  if (!available()) return;
  try { await StatusBar.show(); } catch (e) { console.warn('StatusBar.show failed:', e); }
}
