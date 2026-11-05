/**
 * PWA plumbing: remembers the browser's "install" prompt, tracks service-worker updates, and lets the
 * UI apply a waiting update. Safe on every platform (does nothing inside the Android app).
 */
import { useSyncExternalStore } from 'react';
import { isNative, isStandalonePwa } from './native';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState { canInstall: boolean; installed: boolean; updateReady: boolean; checking: boolean; lastChecked: number | null }

let state: PwaState = { canInstall: false, installed: isStandalonePwa(), updateReady: false, checking: false, lastChecked: null };
let deferred: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
const listeners = new Set<() => void>();
function set(patch: Partial<PwaState>): void { state = { ...state, ...patch }; listeners.forEach(cb => cb()); }

export function getPwaState(): PwaState { return state; }
export function usePwaState(): PwaState {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getPwaState, getPwaState);
}

function watch(reg: ServiceWorkerRegistration): void {
  registration = reg;
  const check = () => { if (reg.waiting && navigator.serviceWorker.controller) set({ updateReady: true }); };
  check();
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => { if (worker.state === 'installed') check(); });
  });
}

export function initPwa(): void {
  if (isNative()) return;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; set({ canInstall: true }); });
  window.addEventListener('appinstalled', () => { deferred = null; set({ canInstall: false, installed: true }); });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => { if (reg) watch(reg); }).catch(() => undefined);
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (state.updateReady) window.location.reload(); });
  }
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  set({ canInstall: false });
  return outcome;
}

export async function checkForUpdate(): Promise<'update-ready' | 'up-to-date' | 'unsupported'> {
  if (isNative() || !('serviceWorker' in navigator)) return 'unsupported';
  set({ checking: true });
  try {
    const reg = registration ?? (await navigator.serviceWorker.getRegistration()) ?? null;
    if (!reg) return 'unsupported';
    watch(reg);
    await reg.update();
    set({ lastChecked: Date.now() });
    if (reg.waiting) { set({ updateReady: true }); return 'update-ready'; }
    return 'up-to-date';
  } catch {
    return 'up-to-date';
  } finally {
    set({ checking: false });
  }
}

/** Tell the waiting service worker to take over; the page reloads on `controllerchange`. */
export function applyUpdate(): void {
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}
