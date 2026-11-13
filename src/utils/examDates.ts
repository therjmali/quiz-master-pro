export interface ExamDate {
  id: string;
  subject: string;
  label?: string;
  title?: string;
  date: string; // ISO date string YYYY-MM-DD
  time?: string; // HH:MM
  targetScore?: number;
  emoji?: string;
  color?: string;
  notes?: string;
}

export type ExamConfig = ExamDate;

const KEY = 'qmp_exam_dates';

export const DEFAULT_EXAMS: ExamDate[] = [];

export function getExamDates(): ExamDate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveExamDates(dates: ExamDate[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(dates));
  } catch {}
}

export function addExamDate(exam: Omit<ExamDate, 'id'>): ExamDate {
  const dates = getExamDates();
  const entry: ExamDate = {
    ...exam,
    id: `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: exam.label || exam.subject,
    emoji: exam.emoji || '📝',
    time: exam.time || '09:00',
    color: exam.color || '#38BDF8',
  };
  dates.push(entry);
  saveExamDates(dates);
  return entry;
}

export function removeExamDate(id: string) {
  saveExamDates(getExamDates().filter((e) => e.id !== id));
}

export function updateExamDate(id: string, patch: Partial<ExamDate>) {
  saveExamDates(getExamDates().map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export function getDaysRemaining(dateStr: string): number {
  const diff = new Date(`${dateStr}T23:59:59`).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export function getUpcomingExams(max = 5): (ExamDate & { daysLeft: number })[] {
  return getExamDates()
    .map((e) => ({ ...e, daysLeft: getDaysRemaining(e.date) }))
    .filter((e) => e.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, max);
}
