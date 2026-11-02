import type { Subject, DailyLog, StudyGoals, SubTopic, StudyFilterState } from '../types/studyTracker';
import { getAllSubTopics } from './studyTrackerStore';

type EnrichedTopic = SubTopic & { subjectId: string; subjectName: string; subjectColor: string; unitName: string };

// ═══════════════════════════════════════════════════════
//  CORE: Effective Time Calculation (single source of truth)
// ═══════════════════════════════════════════════════════

/**
 * For a given date, get effective study minutes.
 * Topic timeSpent is PRIMARY. DailyLog hoursStudied is FALLBACK only
 * when no topic activity exists for that date.
 */
export function getEffectiveDayMinutes(
  date: string,
  topics: EnrichedTopic[],
  logs: DailyLog[],
  subjectFilter?: string,
  difficultyFilter?: string,
): number {
  const dayTopics = filterTopicsForDay(date, topics, subjectFilter, difficultyFilter);
  const topicMinutes = dayTopics.reduce((sum, t) => sum + (t.timeSpent || 0), 0);
  if (topicMinutes > 0) return topicMinutes;
  // Fallback: use log hours only if no topic activity
  const log = logs.find(l => l.date === date);
  return log ? log.hoursStudied * 60 : 0;
}

/**
 * Sum effective minutes over a date range (day-by-day iteration).
 * Never sum individually rounded values.
 */
export function getEffectiveRangeMinutes(
  from: string, to: string,
  topics: EnrichedTopic[], logs: DailyLog[],
  subjectFilter?: string, difficultyFilter?: string,
): number {
  let total = 0;
  const dates = getDateRange(from, to);
  for (const d of dates) {
    total += getEffectiveDayMinutes(d, topics, logs, subjectFilter, difficultyFilter);
  }
  return total;
}

export function minutesToHours(mins: number): number {
  return Math.round(mins * 10 / 60) / 10;
}

export function formatStudyHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ═══════════════════════════════════════════════════════
//  Filter Helpers
// ═══════════════════════════════════════════════════════

export function filterTopicsForDay(
  date: string, topics: EnrichedTopic[],
  subjectFilter?: string, difficultyFilter?: string,
): EnrichedTopic[] {
  let result = topics.filter(t => t.completedDate === date && t.status === 'complete');
  if (subjectFilter && subjectFilter !== 'all') result = result.filter(t => t.subjectId === subjectFilter);
  if (difficultyFilter && difficultyFilter !== 'All') result = result.filter(t => t.difficulty === difficultyFilter);
  return result;
}

export function filterTopicsInRange(
  from: string, to: string, topics: EnrichedTopic[],
  subjectFilter?: string, difficultyFilter?: string,
): EnrichedTopic[] {
  let result = topics.filter(t => t.completedDate && t.completedDate >= from && t.completedDate <= to && t.status === 'complete');
  if (subjectFilter && subjectFilter !== 'all') result = result.filter(t => t.subjectId === subjectFilter);
  if (difficultyFilter && difficultyFilter !== 'All') result = result.filter(t => t.difficulty === difficultyFilter);
  return result;
}

export function getInProcessTopics(
  topics: EnrichedTopic[], subjectFilter?: string, difficultyFilter?: string,
): EnrichedTopic[] {
  let result = topics.filter(t => t.status === 'in_process');
  if (subjectFilter && subjectFilter !== 'all') result = result.filter(t => t.subjectId === subjectFilter);
  if (difficultyFilter && difficultyFilter !== 'All') result = result.filter(t => t.difficulty === difficultyFilter);
  return result;
}

// ═══════════════════════════════════════════════════════
//  Date Utilities
// ═══════════════════════════════════════════════════════

export function getDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (cur <= end) {
    dates.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string { return fmtDate(new Date()); }

export function resolveFilterRange(filter: StudyFilterState): { from: string; to: string } {
  const now = new Date();
  const today = fmtDate(now);
  switch (filter.timeRange) {
    case 'today': return { from: today, to: today };
    case 'week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      d.setDate(d.getDate() - diff);
      const end = new Date(d);
      end.setDate(end.getDate() + 6);
      return { from: fmtDate(d), to: fmtDate(end) };
    }
    case 'month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: fmtDate(s), to: fmtDate(e) };
    }
    case 'custom': return { from: filter.from, to: filter.to };
    default: return { from: '2020-01-01', to: today };
  }
}

export function getPreviousPeriod(from: string, to: string): { from: string; to: string } {
  const s = new Date(from + 'T00:00:00');
  const e = new Date(to + 'T00:00:00');
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const prevEnd = new Date(s);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days + 1);
  return { from: fmtDate(prevStart), to: fmtDate(prevEnd) };
}

// ═══════════════════════════════════════════════════════
//  Streak Calculation
// ═══════════════════════════════════════════════════════

export function calculateStudyStreak(topics: EnrichedTopic[], logs: DailyLog[]): number {
  const activeDays = new Set<string>();
  topics.filter(t => t.status === 'complete' && t.completedDate).forEach(t => activeDays.add(t.completedDate!));
  logs.filter(l => l.hoursStudied > 0).forEach(l => activeDays.add(l.date));

  let streak = 0;
  const check = new Date();
  let today = fmtDate(check);
  if (!activeDays.has(today)) {
    check.setDate(check.getDate() - 1);
  }
  while (activeDays.has(fmtDate(check))) {
    streak++;
    check.setDate(check.getDate() - 1);
  }
  return streak;
}

export function longestStreak(topics: EnrichedTopic[], logs: DailyLog[]): number {
  const activeDays = new Set<string>();
  topics.filter(t => t.status === 'complete' && t.completedDate).forEach(t => activeDays.add(t.completedDate!));
  logs.filter(l => l.hoursStudied > 0).forEach(l => activeDays.add(l.date));
  const sorted = Array.from(activeDays).sort();
  if (!sorted.length) return 0;
  let max = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const curr = new Date(sorted[i] + 'T00:00:00');
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) { cur++; max = Math.max(max, cur); } else { cur = 1; }
  }
  return max;
}

// ═══════════════════════════════════════════════════════
//  Study Rhythm (time-of-day distribution)
// ═══════════════════════════════════════════════════════

export interface RhythmCell {
  label: string;
  range: string;
  count: number;
  isPeak: boolean;
}

export function getStudyRhythm(topics: EnrichedTopic[]): RhythmCell[] {
  const cells = [
    { label: '🌅 Morning', range: '6AM–12PM', count: 0, isPeak: false },
    { label: '☀️ Afternoon', range: '12PM–5PM', count: 0, isPeak: false },
    { label: '🌆 Evening', range: '5PM–9PM', count: 0, isPeak: false },
    { label: '🌙 Night', range: '9PM–6AM', count: 0, isPeak: false },
  ];
  topics.filter(t => t.completedTime).forEach(t => {
    const h = parseInt(t.completedTime!.split(':')[0], 10);
    if (h >= 6 && h < 12) cells[0].count++;
    else if (h >= 12 && h < 17) cells[1].count++;
    else if (h >= 17 && h < 21) cells[2].count++;
    else cells[3].count++;
  });
  const max = Math.max(...cells.map(c => c.count));
  if (max > 0) cells.forEach(c => { c.isPeak = c.count === max; });
  return cells;
}

// ═══════════════════════════════════════════════════════
//  Chart Data Helpers
// ═══════════════════════════════════════════════════════

export interface DayChartPoint {
  date: string;
  label: string;
  topics: number;
  minutes: number;
  hours: number;
}

export function buildDayChartData(
  from: string, to: string,
  topics: EnrichedTopic[], logs: DailyLog[],
  subjectFilter?: string, difficultyFilter?: string,
  maxBuckets = 35,
): DayChartPoint[] {
  const dates = getDateRange(from, to);
  const raw: DayChartPoint[] = dates.map(d => {
    const dayTopics = filterTopicsForDay(d, topics, subjectFilter, difficultyFilter);
    const mins = getEffectiveDayMinutes(d, topics, logs, subjectFilter, difficultyFilter);
    const dt = new Date(d + 'T00:00:00');
    return {
      date: d,
      label: `${dt.getDate()}/${dt.getMonth() + 1}`,
      topics: dayTopics.length,
      minutes: mins,
      hours: Math.round(mins * 10 / 60) / 10,
    };
  });

  // Smart sampling if too many points
  if (raw.length <= maxBuckets) return raw;
  const bucketSize = Math.ceil(raw.length / maxBuckets);
  const sampled: DayChartPoint[] = [];
  for (let i = 0; i < raw.length; i += bucketSize) {
    const chunk = raw.slice(i, i + bucketSize);
    const totalMins = chunk.reduce((s, c) => s + c.minutes, 0);
    const totalTopics = chunk.reduce((s, c) => s + c.topics, 0);
    sampled.push({
      date: chunk[0].date,
      label: chunk.length > 1 ? `${chunk[0].label}–${chunk[chunk.length - 1].label}` : chunk[0].label,
      topics: totalTopics,
      minutes: totalMins,
      hours: Math.round(totalMins * 10 / 60) / 10,
    });
  }
  return sampled;
}

// ═══════════════════════════════════════════════════════
//  Motivational Quotes
// ═══════════════════════════════════════════════════════

export const QUOTES = [
  { text: 'The expert in anything was once a beginner.', author: 'Helen Hayes' },
  { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela' },
  { text: 'The beautiful thing about learning is that nobody can take it away from you.', author: 'B.B. King' },
  { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
  { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
];
