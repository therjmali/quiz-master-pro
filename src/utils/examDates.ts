export interface ExamDate {
  id: string;
  subject: string;
  date: string; // ISO date string
  targetScore?: number;
}

const KEY = 'qmp_exam_dates';

export function getExamDates(): ExamDate[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveExamDates(dates: ExamDate[]) {
  localStorage.setItem(KEY, JSON.stringify(dates));
}

export function addExamDate(exam: Omit<ExamDate, 'id'>): ExamDate {
  const dates = getExamDates();
  const entry: ExamDate = { ...exam, id: Date.now().toString(36) };
  dates.push(entry);
  saveExamDates(dates);
  return entry;
}

export function removeExamDate(id: string) {
  saveExamDates(getExamDates().filter(e => e.id !== id));
}

export function updateExamDate(id: string, patch: Partial<ExamDate>) {
  saveExamDates(getExamDates().map(e => e.id === id ? { ...e, ...patch } : e));
}

export function getDaysRemaining(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export function getUpcomingExams(max = 3): (ExamDate & { daysLeft: number })[] {
  return getExamDates()
    .map(e => ({ ...e, daysLeft: getDaysRemaining(e.date) }))
    .filter(e => e.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, max);
}
