/**
 * Quiz Master Pro — App-wide Zoom
 *
 * Scales the entire quiz interface — text, options, cards, headers, footers — like a
 * browser's page zoom, but persisted per device. Applied with CSS `zoom` on <html>, so
 * scrolling, fixed bars, dialogs, and the bottom-center nav stay correct at every level.
 *
 * Viewport units (dvh/dvw/… ) are multiplied by `zoom` too, so the CSS rewrites them to
 * `var(--qmp-vh)` etc.; those variables divide the zoom back out, keeping full-height
 * screens exactly the display size at any zoom level.
 *
 * Range: 70 % – 150 %, step 5 %. Defaults to 100 %.
 */
import { useSyncExternalStore } from 'react';

export const ZOOM_KEY = 'qmp-ui-zoom-v1';
export const ZOOM_MIN = 70;
export const ZOOM_MAX = 150;
export const ZOOM_STEP = 5;
export const ZOOM_DEFAULT = 100;

export const ZOOM_PRESETS: { value: number; label: string; hint: string }[] = [
  { value: 85,  label: 'Compact',      hint: 'Fit more on screen' },
  { value: 100, label: 'Default',      hint: 'Standard size' },
  { value: 115, label: 'Comfortable',  hint: 'Easier to read' },
  { value: 130, label: 'Large',        hint: 'Bigger text' },
  { value: 150, label: 'Extra large',  hint: 'Maximum size' },
];

export const clampZoom = (n: number): number => {
  if (!Number.isFinite(n)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n / ZOOM_STEP) * ZOOM_STEP));
};

function readStored(): number {
  try {
    const raw = localStorage.getItem(ZOOM_KEY);
    if (raw === null) return ZOOM_DEFAULT;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? clampZoom(n) : ZOOM_DEFAULT;
  } catch {
    return ZOOM_DEFAULT;
  }
}

let current = ZOOM_DEFAULT;
const listeners = new Set<() => void>();

function paint(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const factor = current / 100;
  root.style.setProperty('--qmp-zoom', String(factor));
  root.style.setProperty('--qmp-zoom-pct', String(current));
  if (current === ZOOM_DEFAULT) {
    root.style.removeProperty('zoom');
    root.classList.remove('qmp-zoomed');
  } else {
    root.style.setProperty('zoom', String(factor));
    root.classList.add('qmp-zoomed');
  }
}

const notify = () => listeners.forEach(l => l());

/** Read stored zoom and apply. Call once at startup and after storage restore. */
export function applyZoom(): void {
  current = readStored();
  paint();
  notify();
}

export const getZoom = (): number => current;
/** 1 = 100 %. Useful for converting pointer px → layout units inside the zoomed page. */
export const getZoomFactor = (): number => current / 100;

/**
 * Change zoom (clamped 70–150 %, 5 % steps), persist, and repaint.
 * Returns the new level.
 */
export function setZoom(percent: number): number {
  current = clampZoom(percent);
  try { localStorage.setItem(ZOOM_KEY, String(current)); } catch { /* storage full */ }
  paint();
  notify();
  return current;
}

export function zoomIn(): number {
  const next = clampZoom(current + ZOOM_STEP);
  return setZoom(next);
}

export function zoomOut(): number {
  const next = clampZoom(current - ZOOM_STEP);
  return setZoom(next);
}

export function resetZoom(): number {
  return setZoom(ZOOM_DEFAULT);
}

export function useZoom(): number {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getZoom,
    () => ZOOM_DEFAULT,
  );
}

// ── gesture helpers ──────────────────────────────────────────────────────────

/** dnd-kit modifier: pointer delta is in screen px; divide back for the zoomed page. */
export const zoomModifier = ({ transform }: { transform: { x: number; y: number; scaleX: number; scaleY: number } }) => {
  const z = getZoomFactor();
  return z === 1 ? transform : { ...transform, x: transform.x / z, y: transform.y / z };
};

/** framer-motion `transformPagePoint` equivalent for gesture libraries. */
export const zoomPagePoint = (point: { x: number; y: number }) => {
  const z = getZoomFactor();
  return z === 1 ? point : { x: point.x / z, y: point.y / z };
};

// Apply before React renders so there's no flash at the wrong size.
applyZoom();
