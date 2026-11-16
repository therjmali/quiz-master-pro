/**
 * Shared rules for the status-card report format (PDF, preview, HTML and text all use these):
 *   [status icon] Q[n]. [difficulty icon] question
 *   options, a green check on the right of the answer
 *   divider, then the 📖 rationale (bullets only, no "Rationale"/"Explanation"/"Answer" labels).
 */
import type { ReportItem, ReportKind } from './types';

export type CardStatus = 'correct' | 'wrong' | 'skipped';
export type Level = 'easy' | 'medium' | 'hard';

export const STATUS_EMOJI: Record<CardStatus, string> = { correct: '✅', wrong: '❌', skipped: '⏭️' };
export const DIFF_EMOJI: Record<Level, string> = { easy: '🟢', medium: '🟡', hard: '🔴' };
export const BOOK_EMOJI = '📖';
export const AI_EMOJI = '🤖';

/** Card colours. Light = Tailwind green-50/red-50/yellow-50 (paper). Dark = the `dark:*-950/30` equivalents (HTML only). */
export const CARD_TONES: Record<CardStatus, { fill: string; line: string; darkFill: string; darkLine: string }> = {
  correct: { fill: '#f0fdf4', line: '#bbf7d0', darkFill: 'rgba(5,46,22,0.30)', darkLine: 'rgba(34,197,94,0.30)' },
  wrong: { fill: '#fef2f2', line: '#fecaca', darkFill: 'rgba(69,10,10,0.30)', darkLine: 'rgba(239,68,68,0.30)' },
  skipped: { fill: '#fefce8', line: '#fef08a', darkFill: 'rgba(66,32,6,0.30)', darkLine: 'rgba(234,179,8,0.30)' },
};

/** Difficulty icon only when the question has a known difficulty. */
export function levelOf(d: string | undefined | null): Level | null {
  const v = String(d ?? '').trim().toLowerCase();
  return v === 'easy' || v === 'medium' || v === 'hard' ? v : null;
}

/** Result cards are used for result reports; the exam paper (a blank test) and unknown statuses keep the plain layout. */
export function isCardItem(it: ReportItem, kind: ReportKind): it is ReportItem & { status: CardStatus } {
  return kind !== 'exam' && (it.status === 'correct' || it.status === 'wrong' || it.status === 'skipped');
}

const BULLET_RE = /^\s*(?:[•●▪◦·*\-–—]|\d+[.)])\s+/;

/** The original rationale as bullet lines (existing bullet marks are removed, inline " • " splits into lines). */
export function rationaleBullets(text: string | undefined | null): string[] {
  const out: string[] = [];
  for (const raw of String(text ?? '').replace(/\r/g, '').split('\n')) {
    for (const part of raw.split(/\s+[•●▪]\s+/)) {
      const t = part.replace(BULLET_RE, '').trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/**
 * Which options get the green check: the correct one on every card (so a skipped question still shows its answer),
 * and a red cross on the wrong pick of an attempted question. Only when answers are shown after each question.
 */
export function markedOptions(it: ReportItem, opts: { inlineAnswers: boolean; showUserAnswer: boolean }): { ok: boolean[]; no: boolean[] } {
  const ok = it.options.map(() => false), no = it.options.map(() => false);
  if (!opts.inlineAnswers || it.status === 'unknown') return { ok, no };
  it.options.forEach((o, i) => {
    const t = o.trim();
    if (it.correct.some(c => c.trim() === t)) ok[i] = true;
    else if (opts.showUserAnswer && it.status === 'wrong' && it.user !== null && String(it.user).trim() === t) no[i] = true;
  });
  return { ok, no };
}
