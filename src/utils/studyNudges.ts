import { QuizResult } from '../types/quiz';
import { calculateStreak } from './scoring';
import { getUpcomingExams } from './examDates';
import { getDueItems } from './spacedRepetition';

const KEY = 'qmp_nudges';

export interface NudgeData {
  type: string;
  emoji: string;
  message: string;
  actionLabel?: string;
}

function getShownLog(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

function markShown(type: string) {
  const log = getShownLog();
  log[type] = Date.now();
  localStorage.setItem(KEY, JSON.stringify(log));
}

function wasShownRecently(type: string, hoursAgo = 24): boolean {
  const log = getShownLog();
  const ts = log[type];
  if (!ts) return false;
  return Date.now() - ts < hoursAgo * 3600000;
}

export function generateNudge(history: QuizResult[]): NudgeData | null {
  if (history.length < 2) return null;

  const streak = calculateStreak(history.map(r => r.timestamp));
  const todayStr = new Date().toDateString();
  const todayCount = history.filter(r => new Date(r.timestamp).toDateString() === todayStr).length;

  // Priority 1: Streak at risk
  if (streak > 0 && todayCount === 0 && !wasShownRecently('streak-risk')) {
    markShown('streak-risk');
    return { type: 'streak-risk', emoji: '🔥', message: `Your ${streak}-day streak ends today! Take a quick quiz to keep it alive`, actionLabel: 'Start Quiz' };
  }

  // Priority 2: Exam approaching
  const exams = getUpcomingExams(1);
  if (exams.length > 0 && exams[0].daysLeft <= 7 && !wasShownRecently('exam-approaching')) {
    const e = exams[0];
    const weekQuizzes = history.filter(r => Date.now() - r.timestamp < 7 * 86400000 && r.subject === e.subject).length;
    markShown('exam-approaching');
    return { type: 'exam-approaching', emoji: '⏰', message: `${e.subject} exam in ${e.daysLeft} days! You've practiced ${weekQuizzes} times this week`, actionLabel: 'Practice Now' };
  }

  // Priority 3: Spaced rep due
  const dueItems = getDueItems();
  if (dueItems.length >= 3 && !wasShownRecently('spaced-rep')) {
    markShown('spaced-rep');
    return { type: 'spaced-rep', emoji: '📅', message: `You have ${dueItems.length} spaced repetition questions due today`, actionLabel: 'Review Now' };
  }

  // Priority 4: Weak topic neglected
  const subjects = new Map<string, number>();
  history.forEach(r => {
    if (r.subject) subjects.set(r.subject, Math.max(subjects.get(r.subject) || 0, r.timestamp));
  });
  const neglected = Array.from(subjects.entries())
    .map(([s, ts]) => ({ subject: s, daysAgo: Math.floor((Date.now() - ts) / 86400000) }))
    .filter(x => x.daysAgo >= 3)
    .sort((a, b) => b.daysAgo - a.daysAgo);
  if (neglected.length > 0 && !wasShownRecently('weak-topic')) {
    markShown('weak-topic');
    return { type: 'weak-topic', emoji: '📚', message: `Your topic '${neglected[0].subject}' hasn't been practiced in ${neglected[0].daysAgo} days`, actionLabel: 'Practice' };
  }

  // Priority 5: Improvement celebration
  const thisWeek = history.filter(r => Date.now() - r.timestamp < 7 * 86400000);
  const lastWeek = history.filter(r => Date.now() - r.timestamp >= 7 * 86400000 && Date.now() - r.timestamp < 14 * 86400000);
  if (thisWeek.length >= 3 && lastWeek.length >= 3 && !wasShownRecently('improvement')) {
    const thisAvg = thisWeek.reduce((a, r) => a + r.percentage, 0) / thisWeek.length;
    const lastAvg = lastWeek.reduce((a, r) => a + r.percentage, 0) / lastWeek.length;
    const diff = Math.round(thisAvg - lastAvg);
    if (diff > 3) {
      markShown('improvement');
      return { type: 'improvement', emoji: '📈', message: `Your score improved ${diff}% this week compared to last week! Keep going!` };
    }
  }

  // Priority 6: Consistency praise
  if (streak >= 3 && !wasShownRecently('consistency', 48)) {
    markShown('consistency');
    return { type: 'consistency', emoji: '💪', message: `You've studied ${streak} days in a row — amazing consistency!` };
  }

  return null;
}
