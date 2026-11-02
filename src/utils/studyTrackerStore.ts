import type { Subject, Unit, SubTopic, DailyLog, StudyGoals, SUBJECT_COLORS } from '../types/studyTracker';

const KEYS = {
  subjects: 'qmp_st_subjects',
  logs: 'qmp_st_logs',
  goals: 'qmp_st_goals',
};

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* */ }
}

// ── Subjects ──
export function getSubjects(): Subject[] { return read<Subject[]>(KEYS.subjects, []); }
export function setSubjects(s: Subject[]) { write(KEYS.subjects, s); }
export function addSubject(s: Subject) { const all = getSubjects(); all.push(s); setSubjects(all); }
export function updateSubject(id: string, patch: Partial<Subject>) {
  setSubjects(getSubjects().map(s => s.id === id ? { ...s, ...patch } : s));
}
export function deleteSubject(id: string) { setSubjects(getSubjects().filter(s => s.id !== id)); }

// ── Units ──
export function addUnit(subjectId: string, unit: Unit) {
  setSubjects(getSubjects().map(s => s.id === subjectId ? { ...s, units: [...s.units, unit] } : s));
}
export function updateUnit(subjectId: string, unitId: string, patch: Partial<Unit>) {
  setSubjects(getSubjects().map(s => s.id === subjectId ? {
    ...s, units: s.units.map(u => u.id === unitId ? { ...u, ...patch } : u),
  } : s));
}

// ── SubTopics ──
export function addSubTopic(subjectId: string, unitId: string, topic: SubTopic) {
  setSubjects(getSubjects().map(s => s.id === subjectId ? {
    ...s, units: s.units.map(u => u.id === unitId ? { ...u, subTopics: [...u.subTopics, topic] } : u),
  } : s));
}
export function updateSubTopic(subjectId: string, unitId: string, topicId: string, patch: Partial<SubTopic>) {
  setSubjects(getSubjects().map(s => s.id === subjectId ? {
    ...s, units: s.units.map(u => u.id === unitId ? {
      ...u, subTopics: u.subTopics.map(t => t.id === topicId ? { ...t, ...patch } : t),
    } : u),
  } : s));
}

// ── Daily Logs ──
export function getDailyLogs(): DailyLog[] { return read<DailyLog[]>(KEYS.logs, []); }
export function setDailyLogs(logs: DailyLog[]) { write(KEYS.logs, logs); }
export function upsertDailyLog(log: DailyLog) {
  const all = getDailyLogs();
  const idx = all.findIndex(l => l.date === log.date);
  if (idx >= 0) all[idx] = log; else all.push(log);
  setDailyLogs(all);
}

// ── Goals ──
export const DEFAULT_GOALS: StudyGoals = {
  dailyHours: 4, dailyTopics: 8, weeklyHours: 28, weeklyTopics: 50,
  monthlyHours: 120, monthlyTopics: 200,
};
export function getGoals(): StudyGoals { return read<StudyGoals>(KEYS.goals, DEFAULT_GOALS); }
export function setGoals(g: StudyGoals) { write(KEYS.goals, g); }

// ── Helpers ──
let _uid = 0;
export function uid(): string { return `${Date.now()}-${++_uid}-${Math.random().toString(36).slice(2, 6)}`; }

/** Get all completed subtopics across all subjects */
export function getAllSubTopics(subjects?: Subject[]): (SubTopic & { subjectId: string; subjectName: string; subjectColor: string; unitName: string })[] {
  const subs = subjects ?? getSubjects();
  const result: (SubTopic & { subjectId: string; subjectName: string; subjectColor: string; unitName: string })[] = [];
  subs.forEach(s => s.units.forEach(u => u.subTopics.forEach(t => {
    result.push({ ...t, subjectId: s.id, subjectName: s.name, subjectColor: s.color, unitName: u.name });
  })));
  return result;
}
