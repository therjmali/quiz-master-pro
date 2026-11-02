/**
 * One theme = whole app + quiz screen.
 *
 * There are exactly two themes: Light and AMOLED (pure black). The quiz-screen skin is no longer a
 * separate setting — it is derived from the theme, so picking a theme styles everything at once.
 *
 * Older installs/backups may still hold the removed 'dark' (Glass Dark) value → it maps to AMOLED.
 */
import type { AppTheme } from '../types/quiz';

export const THEME_KEY = 'qmp_theme';

export function normalizeTheme(value: unknown): AppTheme {
  return value === 'light' ? 'light' : 'amoled';
}

export function loadTheme(): AppTheme {
  try { return normalizeTheme(localStorage.getItem(THEME_KEY)); } catch { return 'amoled'; }
}

/** Quiz-screen skin id that matches a theme. */
export function skinIdForTheme(theme: AppTheme): string {
  return theme === 'light' ? 'exam-hall' : 'night-owl';
}

/** Persist the theme and keep the legacy quiz-skin key in sync (backups still read it). */
export function persistTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem('qmp_quiz_skin', skinIdForTheme(theme));
  } catch {}
}
