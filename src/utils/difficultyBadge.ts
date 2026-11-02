/**
 * Unified difficulty + question-type badge helpers.
 * Merges the old separate difficulty badge and purple 🏷️ type badge
 * into a single combined badge everywhere in the app.
 */

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface BadgeInfo {
  /** Short code: H / M / E */
  code: string;
  /** Full label like "H · Pharmacology" or just "HARD" */
  label: string;
  /** Emoji dot */
  emoji: string;
  /** Tailwind classes for text + bg + border */
  classes: string;
  /** For HTML reports: inline style colors */
  cssClass: string;
  /** HTML report badge background/color/border inline styles */
  htmlStyle: string;
}

const DIFF_MAP: Record<DifficultyLevel, { code: string; emoji: string; classes: string; cssClass: string; htmlBg: string; htmlColor: string; htmlBorder: string }> = {
  hard: {
    code: 'H',
    emoji: '🔴',
    classes: 'text-red-400 bg-red-400/10 border border-red-500/20',
    cssClass: 'b-hard',
    htmlBg: '#fee2e2',
    htmlColor: '#991b1b',
    htmlBorder: '#fca5a5',
  },
  medium: {
    code: 'M',
    emoji: '🟡',
    classes: 'text-amber-400 bg-amber-400/10 border border-amber-500/20',
    cssClass: 'b-medium',
    htmlBg: '#fef3c7',
    htmlColor: '#92400e',
    htmlBorder: '#fcd34d',
  },
  easy: {
    code: 'E',
    emoji: '🟢',
    classes: 'text-emerald-400 bg-emerald-400/10 border border-emerald-500/20',
    cssClass: 'b-easy',
    htmlBg: '#d1fae5',
    htmlColor: '#065f46',
    htmlBorder: '#a7f3d0',
  },
};

export function getMergedBadge(difficulty: DifficultyLevel | string, questionType?: string): BadgeInfo {
  const diff = (difficulty as DifficultyLevel) || 'medium';
  const m = DIFF_MAP[diff] || DIFF_MAP.medium;

  const label = questionType
    ? `${m.code} · ${questionType}`
    : diff.toUpperCase();

  return {
    code: m.code,
    label,
    emoji: m.emoji,
    classes: m.classes,
    cssClass: m.cssClass,
    htmlStyle: `background:${m.htmlBg};color:${m.htmlColor};border:1px solid ${m.htmlBorder}`,
  };
}

/**
 * Returns the HTML for a merged badge in reports.
 */
export function mergedBadgeHtml(difficulty: string, questionType?: string): string {
  const badge = getMergedBadge(difficulty as DifficultyLevel, questionType);
  return `<span class="b" style="${badge.htmlStyle}">${badge.emoji} ${escHtml(badge.label)}</span>`;
}

function escHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
