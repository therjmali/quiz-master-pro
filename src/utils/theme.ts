/**
 * Unified Theme Engine matching RJ Study Tracker.
 *
 * Supports 4 Modes:
 *   - light: Parchment (warm cream paper)
 *   - amoled: Ink (AMOLED pure black)
 *   - ancient: Papyrus (antique warm sepia)
 *   - glass: Liquid Glass (iOS-inspired frosted glass with aurora glow)
 *
 * Plus 7 Accent Palettes:
 *   - default: Scholar (Deep amethyst / amber)
 *   - ocean: Ocean (Aquamarine / deep blue)
 *   - emerald: Sage (Forest emerald / sage)
 *   - sunset: Terracotta (Warm burnt orange / amber)
 *   - rose: Wine (Deep crimson wine)
 *   - purple: Plum (Rich royal violet)
 *   - ancient: Ancient (Gilded gold / Egyptian teal)
 */
import type { AppTheme, ThemeMode, ThemeId, GlassTone } from '../types/quiz';

export const THEME_KEY = 'qmp_theme';
export const THEME_ACCENT_KEY = 'qmp_theme_accent';
export const GLASS_TONE_KEY = 'qmp_glass_tone';

export function normalizeTheme(value: unknown): AppTheme {
  if (value === 'light' || value === 'amoled' || value === 'ancient' || value === 'glass') {
    return value;
  }
  if (value === 'dark') return 'amoled';
  return 'light';
}

export function loadTheme(): AppTheme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'light';
  }
}

export function normalizeAccent(value: unknown): ThemeId {
  const valid: ThemeId[] = ['default', 'ocean', 'emerald', 'sunset', 'rose', 'purple', 'ancient'];
  return typeof value === 'string' && (valid as string[]).includes(value) ? (value as ThemeId) : 'default';
}

export function loadThemeAccent(): ThemeId {
  try {
    return normalizeAccent(localStorage.getItem(THEME_ACCENT_KEY));
  } catch {
    return 'default';
  }
}

export function normalizeGlassTone(value: unknown): GlassTone {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

export function loadGlassTone(): GlassTone {
  try {
    return normalizeGlassTone(localStorage.getItem(GLASS_TONE_KEY));
  } catch {
    return 'auto';
  }
}

/** Quiz-screen skin id that matches a theme mode. */
export function skinIdForTheme(theme: AppTheme): string {
  switch (theme) {
    case 'light': return 'exam-hall';
    case 'ancient': return 'papyrus';
    case 'glass': return 'liquid-glass';
    case 'amoled':
    default: return 'night-owl';
  }
}

/** Persist the theme and keep legacy quiz-skin key in sync. */
export function persistTheme(theme: AppTheme, accent?: ThemeId, glassTone?: GlassTone): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem('qmp_quiz_skin', skinIdForTheme(theme));
    if (accent) localStorage.setItem(THEME_ACCENT_KEY, accent);
    if (glassTone) localStorage.setItem(GLASS_TONE_KEY, glassTone);
  } catch {}
}
