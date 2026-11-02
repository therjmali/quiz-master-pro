import { QuizResult } from '../../types/quiz';
import { SubjectBreakdown, ReportMeta } from './reportData';

export function getGrade(pct: number): { grade: string; color: string } {
  if (pct >= 90) return { grade: 'A+', color: '#10b981' };
  if (pct >= 80) return { grade: 'A',  color: '#10b981' };
  if (pct >= 70) return { grade: 'B',  color: '#3b82f6' };
  if (pct >= 60) return { grade: 'C',  color: '#f59e0b' };
  if (pct >= 50) return { grade: 'D',  color: '#f97316' };
  return           { grade: 'F',  color: '#ef4444' };
}

export function getScoreColor(pct: number): string {
  if (pct >= 75) return '#10b981';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
}

export function formatTimeSec(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function computeSubjectBreakdown(results: QuizResult[]): SubjectBreakdown[] {
  const map = new Map<string, { correct: number; total: number }>();
  results.forEach(r => {
    const subj = r.subject?.trim() || 'General';
    const entry = map.get(subj) || { correct: 0, total: 0 };
    entry.correct += r.correct;
    entry.total   += r.totalQuestions;
    map.set(subj, entry);
  });
  return Array.from(map.entries())
    .map(([subject, { correct, total }]) => ({
      subject,
      correct,
      total,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);
}

export function computeReportMeta(results: QuizResult[]): ReportMeta {
  if (!results.length) throw new Error('No results to build report from');

  const totalQ    = results.reduce((a, r) => a + r.totalQuestions, 0);
  const correct   = results.reduce((a, r) => a + r.correct,        0);
  const wrong     = results.reduce((a, r) => a + r.wrong,          0);
  const skipped   = results.reduce((a, r) => a + r.skipped,        0);
  const timeTaken = results.reduce((a, r) => a + r.timeTaken,      0);

  const percentage = results.length === 1
    ? results[0].percentage
    : Math.round(results.reduce((a, r) => a + r.percentage, 0) / results.length);

  const accuracy = (correct + wrong) > 0
    ? Math.round((correct / (correct + wrong)) * 100)
    : 0;

  const passMark = results[0].passMark ?? 50;
  const { grade, color: gradeColor } = getGrade(percentage);
  const scoreColor = getScoreColor(percentage);

  const title   = results.length === 1
    ? (results[0].quizTitle || 'Quiz Report')
    : 'Profile Performance Report';
  const subject = results.length === 1 ? (results[0].subject || '') : '';

  return {
    title,
    subject,
    date:    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    grade,
    gradeColor,
    scoreColor,
    isPassed: percentage >= passMark,
    totalQ,
    correct,
    wrong,
    skipped,
    percentage,
    accuracy,
    timeTaken,
    quizCount:        results.length,
    subjectBreakdown: computeSubjectBreakdown(results),
    passMark,
  };
}
