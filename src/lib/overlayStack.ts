/**
 * Overlay stack — one source of truth for every popup, sheet and dialog in the app.
 *
 * Why this exists
 * ───────────────
 * Popups used to be plain `fixed inset-0` divs rendered inline in the page tree. Two things broke them:
 *
 *  1. A CSS `backdrop-filter`, `filter`, `transform`, `perspective` or `contain` on ANY ancestor makes that
 *     ancestor the containing block for `position: fixed` children. Every glass card in this app has
 *     `backdrop-filter`, so a sheet opened inside one was sized to the card instead of the screen — clipped,
 *     offset, overlapped by other cards, and impossible to dismiss (its close button sat outside the clip).
 *     Portalling every overlay to `document.body` removes the problem at the root.
 *
 *  2. z-index values were hand-picked per component (z-50 … z-1300). Sheets at z-70/z-80 were drawn *under*
 *     the bottom navigation (z-100), so the lower half of a popup — including its close button — was buried.
 *     One layer scale (`--qmp-z-*` in index.css) plus this stack keeps panels, sheets, menus, dialogs and
 *     blocking overlays in a fixed, predictable order.
 *
 * It also gives every overlay, for free:
 *   • reference-counted page scroll lock (no more page left unscrollable after closing one of two overlays)
 *   • Escape closes only the top-most overlay
 *   • the Android hardware back button closes the top-most overlay instead of killing the app
 *   • focus moved into the panel and restored to the trigger afterwards
 */
import { useSyncExternalStore } from 'react';

interface Entry {
  id: number;
  /** Closes this overlay. Absent = the overlay is not dismissable (e.g. a mandatory choice). */
  close?: () => void;
  /** Computed stacking order for this instance (see `pushOverlay`). */
  z: number;
}

/** Base stacking for each semantic layer, matching the `--qmp-z-*` scale in index.css. */
export const LAYER_Z: Record<string, number> = {
  sheet: 400,
  menu: 450,
  panel: 700,
  dialog: 600,
  blocking: 800,
};

let seq = 0;
const stack: Entry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/**
 * Registers an open overlay and returns its id plus the z-index to use.
 *
 * The z-index is `max(layer base, parent overlay + 10)`, where the parent comes from React context: a sheet
 * opened *inside* a full-screen panel always lands above it, and a confirmation opened from a sheet always
 * lands above the sheet — no matter which semantic layer each one asked for. Overlays never fight each other.
 */
export function pushOverlay(close: (() => void) | undefined, layer: string, parentZ = 0): { id: number; z: number } {
  const id = ++seq;
  const z = Math.max(LAYER_Z[layer] ?? LAYER_Z.sheet, parentZ + 10);
  stack.push({ id, close, z });
  emit();
  return { id, z };
}

/** Removes a previously registered overlay (safe to call more than once). */
export function popOverlay(id: number): void {
  const i = stack.findIndex(e => e.id === id);
  if (i >= 0) {
    stack.splice(i, 1);
    emit();
  }
}

export const overlayCount = (): number => stack.length;
export const topOverlayId = (): number | null => (stack.length ? stack[stack.length - 1].id : null);

/**
 * Closes the top-most overlay — but only if `id` is the one on top, so a stray Escape key inside a nested
 * dialog never tears down the panel behind it. Returns true when something was closed.
 */
export function requestClose(id: number): boolean {
  const top = stack[stack.length - 1];
  if (!top || top.id !== id) return false;
  if (!top.close) return false;
  top.close();
  return true;
}

/** Hardware back / global shortcut: close whatever is on top. Returns true when handled. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top || !top.close) return false;
  top.close();
  return true;
}

export function subscribeOverlays(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Number of open overlays (reactive) — screens can pause shortcuts / swipe navigation while a popup is open. */
export function useOverlayCount(): number {
  return useSyncExternalStore(subscribeOverlays, overlayCount, () => 0);
}

/* ────────────────────────────── page scroll lock ────────────────────────────── */

let locks = 0;
let saved: { html: string; body: string; pad: string } | null = null;

/**
 * Freezes the page behind an overlay. Reference counted, so opening a dialog on top of a sheet and closing
 * them in either order always leaves the page exactly as it was (the old per-component `overflow = ''` reset
 * unlocked the page while another popup was still open).
 */
export function lockPageScroll(): void {
  if (typeof document === 'undefined') return;
  if (locks++ > 0) return;
  const html = document.documentElement;
  const body = document.body;
  saved = { html: html.style.overflow, body: body.style.overflow, pad: body.style.paddingRight };
  // Compensate for the disappearing scrollbar on desktop so nothing jumps sideways.
  if (window.innerWidth > 900) {
    const gap = window.innerWidth - html.clientWidth;
    if (gap > 0 && !body.style.paddingRight) body.style.paddingRight = `${gap}px`;
  }
  html.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  html.classList.add('qmp-scroll-locked');
}

export function unlockPageScroll(): void {
  if (typeof document === 'undefined') return;
  if (locks === 0) return;
  if (--locks > 0) return;
  const html = document.documentElement;
  const body = document.body;
  if (saved) {
    html.style.overflow = saved.html;
    body.style.overflow = saved.body;
    body.style.paddingRight = saved.pad;
    saved = null;
  }
  html.classList.remove('qmp-scroll-locked');
}

/** Only for tests: reset all module state. */
export function __resetOverlayStack(): void {
  stack.length = 0;
  locks = 0;
  saved = null;
  emit();
}
