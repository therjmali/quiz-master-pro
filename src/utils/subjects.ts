const SUBJECTS_KEY = 'qmp_user_subjects';

// Color pool auto-assigned by index
const COLOR_POOL = [
  { chip: 'bg-blue-500/20 text-blue-300 border-blue-500/30',     badge: 'bg-blue-500/15 text-blue-400 border-blue-500/25',     dot: 'bg-blue-400' },
  { chip: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400' },
  { chip: 'bg-purple-500/20 text-purple-300 border-purple-500/30',   badge: 'bg-purple-500/15 text-purple-400 border-purple-500/25',   dot: 'bg-purple-400' },
  { chip: 'bg-amber-500/20 text-amber-300 border-amber-500/30',     badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25',     dot: 'bg-amber-400' },
  { chip: 'bg-teal-500/20 text-teal-300 border-teal-500/30',       badge: 'bg-teal-500/15 text-teal-400 border-teal-500/25',       dot: 'bg-teal-400' },
  { chip: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30', badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25', dot: 'bg-indigo-400' },
  { chip: 'bg-rose-500/20 text-rose-300 border-rose-500/30',       badge: 'bg-rose-500/15 text-rose-400 border-rose-500/25',       dot: 'bg-rose-400' },
  { chip: 'bg-orange-500/20 text-orange-300 border-orange-500/30', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/25', dot: 'bg-orange-400' },
  { chip: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',       badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',       dot: 'bg-cyan-400' },
  { chip: 'bg-lime-500/20 text-lime-300 border-lime-500/30',       badge: 'bg-lime-500/15 text-lime-400 border-lime-500/25',       dot: 'bg-lime-400' },
  { chip: 'bg-pink-500/20 text-pink-300 border-pink-500/30',       badge: 'bg-pink-500/15 text-pink-400 border-pink-500/25',       dot: 'bg-pink-400' },
  { chip: 'bg-violet-500/20 text-violet-300 border-violet-500/30', badge: 'bg-violet-500/15 text-violet-400 border-violet-500/25', dot: 'bg-violet-400' },
];

export const DEFAULT_NURSING_SUBJECTS = [
  'Medical-Surgical Nursing',
  'Community Health Nursing',
  'Obstetrics & Gynaecological Nursing',
  'Child Health Nursing',
  'Mental Health Nursing',
  'Pharmacology',
  'Anatomy & Physiology'
];

export function getUserSubjects(): string[] {
  try {
    const stored = localStorage.getItem(SUBJECTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveUserSubjects(subjects: string[]): void {
  localStorage.setItem(SUBJECTS_KEY, JSON.stringify(subjects));
}

export function addUserSubject(name: string): string[] {
  const subjects = getUserSubjects();
  const trimmed = name.trim();
  if (trimmed && !subjects.find(s => s.toLowerCase() === trimmed.toLowerCase())) {
    subjects.push(trimmed);
    saveUserSubjects(subjects);
  }
  return [...getUserSubjects()];
}

export function deleteUserSubject(name: string): string[] {
  const subjects = getUserSubjects().filter(s => s !== name);
  saveUserSubjects(subjects);
  return subjects;
}

export function renameUserSubject(oldName: string, newName: string): string[] {
  const trimmed = newName.trim();
  if (!trimmed) return getUserSubjects();
  const subjects = getUserSubjects().map(s => s === oldName ? trimmed : s);
  saveUserSubjects(subjects);
  return subjects;
}

export function getSubjectColors(subject: string): { chip: string; badge: string; dot: string } {
  const subjects = getUserSubjects();
  const idx = subjects.indexOf(subject);
  if (idx >= 0) return COLOR_POOL[idx % COLOR_POOL.length];
  // Fallback for subjects not in list (e.g., old data)
  const hash = subject.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLOR_POOL[hash % COLOR_POOL.length];
}

/** Scan quiz history and auto-add any missing subjects to the user's list. Returns count of newly added subjects. */
export function syncSubjectsFromHistory(history: Array<{ subject?: string }>): number {
  const existing = getUserSubjects().map(s => s.toLowerCase());
  let added = 0;
  const seen = new Set(existing);
  for (const r of history) {
    const subj = r.subject?.trim();
    if (!subj) continue;
    const lower = subj.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      addUserSubject(subj);
      added++;
    }
  }
  return added;
}

// Keep SUBJECTS export as empty for backward compat (unused now)
export const SUBJECTS: string[] = [];
export type SubjectType = string;
export const SUBJECT_COLORS: Record<string, { chip: string; badge: string; dot: string }> = {};
