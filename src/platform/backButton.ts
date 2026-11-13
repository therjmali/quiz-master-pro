/**
 * Hardware back button (Android / Capacitor) — one listener, correct order.
 *
 * Order of dismissal matches what a user expects on every screen:
 *   1. the top-most popup / sheet / dialog
 *   2. a popup menu, an open side panel, the AI chat, a paused quiz overlay… (registered handlers)
 *   3. the app's own back stack (leaves a sub-screen)
 *   4. the system default (leave the app)
 */
import { isNative } from './native';
import { closeTopOverlay, overlayCount } from '../lib/overlayStack';

type Handler = () => boolean;
const handlers: Handler[] = [];

/**
 * Register a custom back handler. It must return `true` when it consumed the press.
 * Returns an unsubscribe function. Handlers are tried newest-first.
 */
export function registerBackHandler(fn: Handler): () => void {
  handlers.push(fn);
  return () => {
    const i = handlers.indexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Runs the back chain. Returns true when the press was consumed. */
export function handleBack(): boolean {
  if (closeTopOverlay()) return true;
  for (let i = handlers.length - 1; i >= 0; i--) {
    try { if (handlers[i]()) return true; } catch { /* a broken handler never blocks the rest */ }
  }
  return false;
}

let bound = false;

/** Wires the Capacitor back button once, at boot. Never steals the button from the user. */
export function initBackButton(): void {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  if (!isNative()) return;
  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('backButton', () => {
        const consumed = handleBack();
        if (consumed) return;
        // Nothing of ours wanted it: if the app is showing a popup, at least never quit under it.
        if (overlayCount() > 0) return;
        void App.exitApp().catch(() => undefined);
      });
    })
    .catch(() => undefined);
}

/** Only for tests. */
export function __clearBackHandlers(): void { handlers.length = 0; bound = false; }
