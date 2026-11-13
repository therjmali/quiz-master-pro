/**
 * Performance budget for this device.
 *
 * The app's look leans on backdrop blur, layered gradients and motion, which is free on a laptop and
 * expensive on a low-end phone. Rendering every one of those effects at full strength is what makes
 * an Android WebView stutter or restart. This module decides, once, how much of that budget the
 * device can actually pay for, and publishes it as a class on <html>:
 *
 *   html.qmp-perf-low   - drop backdrop blur, freeze decorative animation (still looks the same,
 *                         because the panels are opaque enough at the blur radius we use), and
 *                         stop one-second clocks from repainting while the tab is hidden.
 *   html.qmp-perf-high  - full glass, full motion.
 *
 * Detection is honest: an explicit value in memory, then an explicit user choice in storage, then
 * device signals (hardwareConcurrency, deviceMemory, save-data, reduced motion). The user can always
 * override it in Settings -> Accessibility.
 */
export const PERF_KEY = 'qmp-perf-mode-v1';

export type PerfMode = 'auto' | 'high' | 'low';

let explicit: PerfMode = 'auto';
const listeners = new Set<() => void>();
let applied: 'high' | 'low' | null = null;

/** Signals that a device is likely to struggle: few cores, little RAM, data-saver, reduced motion. */
export function detectLowEnd(
  nav: { hardwareConcurrency?: number; deviceMemory?: number; connection?: { saveData?: boolean } } = (typeof navigator !== 'undefined' ? navigator as unknown as { hardwareConcurrency?: number; deviceMemory?: number; connection?: { saveData?: boolean } } : {}),
  reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
): boolean {
  if (reducedMotion) return true;
  if (nav?.connection?.saveData === true) return true;
  const cores = Number(nav?.hardwareConcurrency ?? 0);
  if (cores > 0 && cores <= 4) return true;
  const mem = Number(nav?.deviceMemory ?? 0);
  if (mem > 0 && mem <= 2) return true;
  return false;
}

export function readStoredMode(): PerfMode {
  try {
    const raw = localStorage.getItem(PERF_KEY);
    return raw === 'low' || raw === 'high' ? raw : 'auto';
  } catch { return 'auto'; }
}

/** Resolve the mode that should be in force right now (pure; unit-tested). */
export function resolveMode(stored: PerfMode, lowEndSignals: boolean): 'high' | 'low' {
  if (stored === 'low' || stored === 'high') return stored;
  return lowEndSignals ? 'low' : 'high';
}

export function currentMode(): 'high' | 'low' {
  return applied ?? resolveMode(readStoredMode(), detectLowEnd());
}

function paint(mode: 'high' | 'low'): void {
  applied = mode;
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('qmp-perf-low', mode === 'low');
  root.classList.toggle('qmp-perf-high', mode === 'high');
  root.setAttribute('data-perf', mode);
  listeners.forEach(cb => { try { cb(); } catch { /* ignore */ } });
}

/** Apply once at startup, before the first paint. */
export function applyPerfMode(): 'high' | 'low' {
  explicit = readStoredMode();
  const mode = resolveMode(explicit, detectLowEnd());
  paint(mode);
  return mode;
}

/** Settings switch. `auto` clears the override and re-detects. */
export function setPerfMode(mode: PerfMode): 'high' | 'low' {
  explicit = mode;
  try {
    if (mode === 'auto') localStorage.removeItem(PERF_KEY);
    else localStorage.setItem(PERF_KEY, mode);
  } catch { /* storage blocked: this session still honours it */ }
  const next = resolveMode(mode, detectLowEnd());
  paint(next);
  return next;
}

export function getPerfChoice(): PerfMode {
  return explicit === 'high' || explicit === 'low' ? explicit : readStoredMode();
}

export function subscribePerf(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/* ---- honesty pass: measure, then decide ---------------------------------------------------- */

export const FPS_LOW = 45;

/**
 * Should we drop to light mode after measuring real frames? Pure, so the rule is testable.
 * `frames` rendered during `ms` on a device whose user has NOT chosen a mode explicitly.
 */
export function shouldDowngrade(frames: number, ms: number, sample: { minFps?: number; minMs?: number } = {}): boolean {
  const minFps = sample.minFps ?? FPS_LOW;
  const minMs = sample.minMs ?? 1200;
  if (ms < minMs || frames <= 0) return false;          // too short to judge
  return (frames * 1000) / ms < minFps;
}

/**
 * Measure the real frame rate for ~1.6 s after the first screen is up. Device hints lie (a WebView
 * can claim 8 cores while a 60 Hz GPU drops every other frame), so the only trustworthy answer is
 * what the compositor actually delivered. Only applies while the mode is "auto" and never overrides
 * an explicit choice; the verdict is remembered so the cost is paid once per install.
 */
export function watchFrameRate(
  onResult?: (fps: number, mode: 'high' | 'low') => void,
  opts: { delayMs?: number; durationMs?: number } = {},
): void {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  if (readStoredMode() !== 'auto') return;              // the user already decided
  if (currentMode() === 'low') return;                  // already light
  const delay = opts.delayMs ?? 1800;
  const duration = opts.durationMs ?? 1600;

  window.setTimeout(() => {
    if (document.hidden) return;
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames++;
      const elapsed = performance.now() - start;
      if (elapsed < duration) { requestAnimationFrame(tick); return; }
      const fps = Math.round((frames * 1000) / elapsed);
      const downgrade = shouldDowngrade(frames, elapsed) && !isPageIdleCheap();
      if (downgrade) paint('low');
      onResult?.(fps, downgrade ? 'low' : 'high');
    };
    requestAnimationFrame(tick);
  }, delay);
}

/** A page with almost nothing on it can report 60 fps even on a slow device: don't reward that. */
function isPageIdleCheap(): boolean {
  try {
    const root = document.getElementById('root');
    return (root?.childElementCount ?? 0) < 2;
  } catch { return false; }
}
