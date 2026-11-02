import { QuizResult } from '../types/quiz';

export interface QuizGroup {
  id: string;
  quizTitle: string;
  subject?: string;
  mainResult?: QuizResult;
  practices: QuizResult[];
  allResults: QuizResult[];
  latestResult: QuizResult;
  improvement: number;
  lastPracticedAt: number | null;
  bestScore: number;
}

export function getGroupPinId(g: QuizGroup): string {
  const r = g.mainResult || g.latestResult;
  return r.id || String(r.timestamp);
}

export function groupQuizzes(history: QuizResult[]): QuizGroup[] {
  const gm = new Map<string, { main?: QuizResult; practices: QuizResult[] }>();

  for (const r of history) {
    const isMain = (r.attemptType || 'main') === 'main';
    if (isMain) {
      const key = r.id || `t${r.timestamp}`;
      const g = gm.get(key) || { practices: [] };
      g.main = r;
      gm.set(key, g);
    } else {
      const key = r.parentQuizId || (r.parentQuizTimestamp ? `t${r.parentQuizTimestamp}` : `s${r.timestamp}`);
      const g = gm.get(key) || { practices: [] };
      g.practices.push(r);
      gm.set(key, g);
    }
  }

  return Array.from(gm.entries()).map(([id, { main, practices }]) => {
    const sp = practices.sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));
    const all = main ? [main, ...sp] : [...sp];
    const latest = all[all.length - 1];
    const first = all[0];
    const lp = sp.length > 0 ? sp[sp.length - 1] : null;
    const raw = (main || sp[0])?.quizTitle || 'Quiz';
    const clean = raw.replace(/\s*—\s*Practice\s+\d+\w*\s+\d{4}$/i, '').trim();

    return {
      id,
      quizTitle: clean || `Quiz · ${first.totalQuestions} Questions`,
      subject: (main || sp[0])?.subject,
      mainResult: main,
      practices: sp,
      allResults: all,
      latestResult: latest,
      improvement: all.length > 1 ? latest.percentage - first.percentage : 0,
      lastPracticedAt: lp?.timestamp || null,
      bestScore: Math.max(...all.map(r => r.percentage)),
    };
  }).sort((a, b) => b.latestResult.timestamp - a.latestResult.timestamp);
}
