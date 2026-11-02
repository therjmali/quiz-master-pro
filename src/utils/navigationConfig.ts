import { Screen } from '../types/quiz';

export const SCREEN_PATHS: Record<Screen, string> = {
  'dashboard': '/',
  'practice-dashboard': '/practice',
  'setup': '/create',
  'quiz': '/quiz',
  'summary': '/quiz/summary',
  'results': '/results',
  'profile': '/profile',
  'library': '/library',
  'stats': '/stats',
  'report-preview': '/report',
  'flashcards': '/flashcards',
};

export function pathToScreen(p: string): Screen {
  for (const [s, path] of Object.entries(SCREEN_PATHS)) {
    if (path === p) return s as Screen;
  }
  return 'dashboard';
}

export const SWIPEABLE_SCREENS: Screen[] = [
  'dashboard', 'practice-dashboard', 'library', 'setup', 'stats', 'profile',
];

export const TAB_LABELS: Record<string, string> = {
  dashboard: 'Home',
  'practice-dashboard': 'Practice',
  library: 'Library',
  setup: 'Create',
  stats: 'Stats',
  profile: 'Profile',
};

export const BG_THEMES = [
  'bg-[#0A0A0F]',
  'from-[#0A0A1A] to-[#1A0A2E]',
  'from-[#0A1A0F] to-[#0A2818]',
  'from-[#1A0A0F] to-[#2A0818]',
  'from-[#0E0A20] to-[#200A28]',
  'from-[#0A1520] to-[#152040]',
];
