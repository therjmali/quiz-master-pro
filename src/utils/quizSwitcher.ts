import type { QuizResult } from '../types/quiz';
import { derivePercentage } from './scoring';

export type DatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';
export type SwitchSort = 'new' | 'old' | 'score';

export interface SwitchFilters {
  query: string;
  /** several subjects can be on together; empty = every subject */
  subjects: readonly string[];
  preset: DatePreset;
  /** custom range, YYYY-MM-DD (local time); either side may be empty */
  from: string;
  to: string;
  sort: SwitchSort;
}

export const DEFAULT_SWITCH_FILTERS: SwitchFilters = { query: '', subjects: [], preset: 'all', from: '', to: '', sort: 'new' };

export const subjectOf = (r: Pick<QuizResult, 'subject'>): string => (r.subject && r.subject.trim()) || 'General';
const DAY = 86_400_000;

/** start of the local day for a YYYY-MM-DD string (NaN when empty / invalid) */
function dayStart(v: string): number {
  if (!v) return NaN;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(y, (m || 1) - 1, d || 1).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** How many filters are on (shown on the button so you can see the list is narrowed). */
export function activeSwitchFilters(f: SwitchFilters): number {
  return (f.query.trim() ? 1 : 0) + (f.subjects.length ? 1 : 0) + (f.preset !== 'all' ? 1 : 0);
}

/** Pure: returns a NEW array; the history list is never changed or re-ordered in place. */
export function filterSwitchList(list: readonly QuizResult[], f: SwitchFilters, now: number = Date.now()): QuizResult[] {
  const q = f.query.trim().toLowerCase();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  let from = NaN, to = NaN;
  if (f.preset === 'today') from = startToday.getTime();
  else if (f.preset === '7d') from = startToday.getTime() - 6 * DAY;
  else if (f.preset === '30d') from = startToday.getTime() - 29 * DAY;
  else if (f.preset === 'custom') { from = dayStart(f.from); const t = dayStart(f.to); to = Number.isNaN(t) ? NaN : t + DAY - 1; }

  const out = list.filter(r => {
    if (q && !`${r.quizTitle || ''} ${subjectOf(r)}`.toLowerCase().includes(q)) return false;
    if (f.subjects.length && !f.subjects.includes(subjectOf(r))) return false;
    if (!Number.isNaN(from) && r.timestamp < from) return false;
    if (!Number.isNaN(to) && r.timestamp > to) return false;
    return true;
  });
  const score = (r: QuizResult) => derivePercentage(r.netScore, r.maxScore);
  return out.sort((a, b) => f.sort === 'old' ? a.timestamp - b.timestamp : f.sort === 'score' ? score(b) - score(a) || b.timestamp - a.timestamp : b.timestamp - a.timestamp);
}

/** Subjects of the list with how many quizzes each has, biggest first. */
export function subjectCounts(list: readonly QuizResult[]): { subject: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of list) m.set(subjectOf(r), (m.get(subjectOf(r)) || 0) + 1);
  return [...m.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject));
}
