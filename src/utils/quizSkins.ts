import { loadTheme, skinIdForTheme } from './theme';

export interface QuizSkin {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  bgClass: string;
  optionClass: string;
  headerClass: string;
  textClass: string;
  previewGradient: string;
}

/**
 * Quiz-screen skins. There is no separate skin picker any more: the skin always follows the app
 * theme (Light → exam-hall, AMOLED → night-owl). See utils/theme.ts.
 */
export const QUIZ_SKINS: QuizSkin[] = [
  {
    id: 'exam-hall', name: 'Light', emoji: '✨', desc: 'Clean paper-style',
    bgClass: 'skin-exam-hall', optionClass: '', headerClass: '', textClass: '',
    previewGradient: 'from-gray-200 to-gray-300',
  },
  {
    id: 'night-owl', name: 'AMOLED', emoji: '🖤', desc: 'Pure black + blue',
    bgClass: 'skin-night-owl', optionClass: '', headerClass: '', textClass: '',
    previewGradient: 'from-gray-950 to-blue-950',
  },
];

/** The skin that matches the current app theme. */
export function getActiveSkin(): string {
  return skinIdForTheme(loadTheme());
}

/** Kept for backward compatibility — the skin is derived from the theme, so this is a no-op. */
export function setActiveSkin(_id: string) { /* derived from theme */ }

export function getSkinById(id: string): QuizSkin {
  return QUIZ_SKINS.find(s => s.id === id) || QUIZ_SKINS[1];
}
