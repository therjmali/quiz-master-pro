/**
 * Decides WHICH notifications to schedule and WHEN. Pure and deterministic (no Date.now, no storage),
 * so every rule is unit-tested. The notifier turns the plan into real OS notifications.
 *
 * Design: one-shot notifications for the next few days instead of endless repeating ones. Each time
 * the app opens (or a quiz is finished) the plan is rebuilt, which lets a reminder skip a day you have
 * already studied and keeps the texts accurate - and means the app never nags someone who stopped
 * using it for a week.
 */
export type NotifyKind = 'daily' | 'due' | 'streak' | 'exam' | 'weekly' | 'test';

export interface NotifySettings {
  enabled: boolean;
  dueReviews: { on: boolean; time: string };
  streak: { on: boolean; time: string };
  exams: { on: boolean };
  weekly: { on: boolean; day: number; time: string };   // day: 0 = Sunday
  quiet: { on: boolean; start: string; end: string };
}

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  enabled: false,
  dueReviews: { on: true, time: '18:00' },
  streak: { on: true, time: '20:30' },
  exams: { on: true },
  weekly: { on: false, day: 0, time: '18:00' },
  quiet: { on: true, start: '22:00', end: '07:00' },
};

export interface DailyReminder { enabled: boolean; time: string; days: number[]; subject?: string }
export interface ExamLite { id: string; subject: string; date: string }

export interface PlannerInput {
  now: Date;
  settings: NotifySettings;
  reminder: DailyReminder;
  exams: ExamLite[];
  studiedToday: boolean;
  dueCount: number;
  streakDays: number;
  horizonDays?: number;
  maxItems?: number;
}

export interface Planned { id: number; kind: NotifyKind; title: string; body: string; at: Date }

export const EXAM_MILESTONES = [30, 14, 7, 3, 1, 0];
const ID_BASE: Record<NotifyKind, number> = { daily: 10_000, due: 20_000, streak: 30_000, exam: 40_000, weekly: 50_000, test: 90_000 };

export function parseHM(value: string, fallback = [9, 0]): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim());
  if (!m) return [fallback[0], fallback[1]];
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return [h, min];
}

function atLocal(day: Date, hour: number, minute: number): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0, 0); }

/** True when `at` falls inside the quiet window (which may cross midnight). */
export function inQuietHours(at: Date, quiet: NotifySettings['quiet']): boolean {
  if (!quiet.on) return false;
  const [sh, sm] = parseHM(quiet.start, [22, 0]);
  const [eh, em] = parseHM(quiet.end, [7, 0]);
  const minutes = at.getHours() * 60 + at.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function planNotifications(input: PlannerInput): Planned[] {
  const { now, settings, reminder, exams, studiedToday, dueCount, streakDays } = input;
  if (!settings.enabled) return [];
  const horizon = input.horizonDays ?? 7;
  const out: Omit<Planned, 'id'>[] = [];
  const push = (kind: NotifyKind, at: Date, title: string, body: string) => {
    if (at.getTime() <= now.getTime() + 30_000) return;      // already past (or about to be)
    if (kind !== 'test' && inQuietHours(at, settings.quiet)) return;
    out.push({ kind, at, title, body });
  };

  for (let d = 0; d < horizon; d++) {
    const day = addDays(now, d);
    const weekday = day.getDay();
    const today = d === 0;

    if (reminder.enabled && reminder.days.includes(weekday) && !(today && studiedToday)) {
      const [h, m] = parseHM(reminder.time);
      push('daily', atLocal(day, h, m), 'Time to study',
        reminder.subject ? `A quick ${reminder.subject} quiz keeps you on track.` : 'A short quiz today keeps your streak going.');
    }

    if (settings.dueReviews.on && dueCount > 0) {
      const [h, m] = parseHM(settings.dueReviews.time);
      push('due', atLocal(day, h, m), 'Cards due for review',
        today ? `${dueCount} ${dueCount === 1 ? 'card is' : 'cards are'} ready - a 5 minute review locks them in.` : 'You have flashcards waiting for review.');
    }

    if (settings.streak.on && streakDays > 0 && !(today && studiedToday)) {
      const [h, m] = parseHM(settings.streak.time, [20, 30]);
      push('streak', atLocal(day, h, m), today && streakDays > 1 ? `${streakDays}-day streak at risk` : 'Keep your streak alive',
        'One quick quiz today is enough to keep it going.');
    }

    if (settings.weekly.on && weekday === settings.weekly.day) {
      const [h, m] = parseHM(settings.weekly.time, [18, 0]);
      push('weekly', atLocal(day, h, m), 'Your week in review', 'See your scores, streak and weak topics for the week.');
    }
  }

  if (settings.exams.on) {
    for (const exam of exams) {
      const examDay = new Date(`${exam.date}T12:00:00`);
      if (Number.isNaN(examDay.getTime())) continue;
      for (const m of EXAM_MILESTONES) {
        const at = atLocal(addDays(examDay, -m), 9, 0);
        const title = m === 0 ? `${exam.subject} exam is today` : `${exam.subject} exam in ${m} ${m === 1 ? 'day' : 'days'}`;
        const body = m === 0 ? 'You have prepared for this. Good luck!' : m <= 3 ? 'Do a final revision of your weak topics.' : 'Plan your remaining revision and practice quizzes.';
        push('exam', at, title, body);
      }
    }
  }

  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  const counters: Record<string, number> = {};
  return out.slice(0, input.maxItems ?? 60).map(p => {
    counters[p.kind] = (counters[p.kind] ?? 0) + 1;
    return { ...p, id: ID_BASE[p.kind] + counters[p.kind] };
  });
}

export function isOurNotificationId(id: number): boolean {
  return Object.values(ID_BASE).some(base => id > base && id <= base + 999);
}
