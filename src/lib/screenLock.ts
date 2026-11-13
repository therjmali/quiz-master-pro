/**
 * Screen lock — lets a full-screen surface (quiz, report preview, flashcards) pause app-wide gestures,
 * shortcuts and hardware-back handling while it is in front, and lets an open overlay pause them too.
 *
 * Anything that "owns" the screen calls `useScreenLock(deps)`; readers use `useScreenLocked()`.
 */
import { useEffect, useSyncExternalStore } from 'react';

let depth = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function pushScreenLock(): void { depth++; emit(); }
export function popScreenLock(): void { if (depth > 0) { depth--; emit(); } }
export const screenLockCount = (): number => depth;
export const isScreenLocked = (): boolean => depth > 0;

function subscribe(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }

/** Reactive: is any screen lock held? */
export function useScreenLocked(): boolean {
  return useSyncExternalStore(subscribe, () => depth > 0, () => false);
}

/** Hold a screen lock while mounted (and whenever `active` is true). */
export function useScreenLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    pushScreenLock();
    return () => popScreenLock();
  }, [active]);
}

/** Combined signal: the screen is busy (full-screen surface open OR a popup is open). */
export function useInteractionBlocked(overlayCount: number): boolean {
  const locked = useScreenLocked();
  return locked || overlayCount > 0;
}

export function __resetScreenLock(): void { depth = 0; emit(); }
