/**
 * Display mode: exactly two, Light and Dark.
 *
 * Older versions stored other values in `qmp_theme` (amoled = Ink, ancient = Papyrus,
 * glass = Liquid Glass). They are mapped on read so synced / restored data keeps working.
 * Colours come from CSS variables (`.app-light` / `.app-dark` in index.css); Tailwind's
 * `dark:` variant works because `<html>` also gets the `dark` class in dark mode.
 */
import type { AppTheme } from '../types/quiz';

export const THEME_KEY = 'qmp_theme';
export const DEFAULT_THEME: AppTheme = 'light';
/** The one fixed accent (indigo). The accent palette picker was removed. */
export const ACCENT_HSL = '239 84% 67%';

function systemPrefersDark(): boolean {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

/** Any stored value (current or legacy) -> 'light' | 'dark'. */
export function normalizeTheme(value: unknown): AppTheme {
  if (value === 'light' || value === 'dark') return value;
  if (value === 'amoled') return 'dark';
  if (value === 'ancient') return 'light';
  if (value === 'glass') {
    // Liquid Glass followed the phone's setting unless a tone was forced
    let tone: string | null = null;
    try { tone = localStorage.getItem('qmp_glass_tone'); } catch { /* ignore */ }
    if (tone === 'dark') return 'dark';
    if (tone === 'light') return 'light';
    return systemPrefersDark() ? 'dark' : 'light';
  }
  return DEFAULT_THEME;
}

export function loadTheme(): AppTheme {
  try { return normalizeTheme(localStorage.getItem(THEME_KEY)); } catch { return DEFAULT_THEME; }
}

/** Quiz-screen skin id that matches a theme mode. */
export function skinIdForTheme(theme: AppTheme): string {
  return theme === 'dark' ? 'night-owl' : 'exam-hall';
}

/** Persist the theme and keep the legacy quiz-skin key in sync. */
export function persistTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem('qmp_quiz_skin', skinIdForTheme(theme));
  } catch { /* ignore */ }
}

export const THEME_COLORS: Record<AppTheme, string> = { light: '#F6F1EA', dark: '#050508' };

/** Apply a mode to <html>: CSS hooks, Tailwind `dark`, native colour-scheme and the browser / status-bar colour. */
export function applyThemeToDocument(theme: AppTheme): void {
  const root = document.documentElement;
  const dark = theme === 'dark';
  root.classList.toggle('app-light', !dark);
  root.classList.toggle('app-dark', dark);
  root.classList.toggle('dark', dark);
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = dark ? 'dark' : 'light';
  // The accent is fixed now: this also overrides any custom accent an older version stored.
  root.style.setProperty('--primary', ACCENT_HSL);
  try {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
    const bridge = (window as unknown as { QmNative?: { setThemeBars?: (c: string, light: boolean) => void } }).QmNative;
    bridge?.setThemeBars?.(THEME_COLORS[theme], !dark);
  } catch { /* ignore */ }
}
