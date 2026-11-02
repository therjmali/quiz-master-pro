import { QuizResult, QuizQuestion } from '../types/quiz';
import { getPracticeLabel } from './practiceNaming';

/** Stats aggregate for a filtered set of results */
export interface StatsAggregate {
  totalQuizzes: number;
  totalQuestions: number;
  correct: number;
  wrong: number;
  skipped: number;
  avgPercentage: number;
  bestScore: number;
  worstScore: number;
  totalTime: number;
  accuracy: number;
  gain: number;
  penalty: number;
  netScore: number;
  /** Average of individual quiz net-score percentages (weighted equally per quiz) */
  avgNetPercentage: number;
}

export type StatsFilter =
  | { type: 'main' }
  | { type: 'practice'; attemptNumber: number }
  | { type: 'all-practices' };

/** Get all practice attempts for a specific quiz (by parent ID or own ID) */
export function getPracticeAttemptsForQuiz(history: QuizResult[], parentId: string): QuizResult[] {
  return history
    .filter(r => r.attemptType === 'practice' && (r.parentQuizId === parentId))
    .sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));
}

/** Get the next practice attempt number for a quiz */
export function getNextAttemptNumber(history: QuizResult[], parentId: string): number {
  const existing = getPracticeAttemptsForQuiz(history, parentId);
  if (existing.length === 0) return 1;
  return Math.max(...existing.map(r => r.attemptNumber || 0)) + 1;
}

/** Filter history by attempt type */
export function filterByAttemptType(history: QuizResult[], type: 'main' | 'practice' | 'all'): QuizResult[] {
  if (type === 'all') return history;
  if (type === 'main') return history.filter(r => (r.attemptType || 'main') === 'main');
  return history.filter(r => r.attemptType === 'practice');
}

/** Filter history by specific attempt number */
export function filterByAttemptNumber(history: QuizResult[], attemptNumber: number): QuizResult[] {
  return history.filter(r => r.attemptType === 'practice' && r.attemptNumber === attemptNumber);
}

/** Filter by StatsFilter */
export function filterByStatsFilter(history: QuizResult[], filter: StatsFilter): QuizResult[] {
  if (filter.type === 'main') return filterByAttemptType(history, 'main');
  if (filter.type === 'all-practices') return filterByAttemptType(history, 'practice');
  return filterByAttemptNumber(history, filter.attemptNumber);
}

/** Calculate aggregate stats for a filtered set of results */
export function calculateStats(results: QuizResult[]): StatsAggregate {
  const totalQuizzes = results.length;
  const totalQuestions = results.reduce((a, r) => a + r.totalQuestions, 0);
  const correct = results.reduce((a, r) => a + r.correct, 0);
  const wrong = results.reduce((a, r) => a + r.wrong, 0);
  const skipped = results.reduce((a, r) => a + r.skipped, 0);
  const avgPercentage = totalQuizzes > 0 ? Math.round(results.reduce((a, r) => a + r.percentage, 0) / totalQuizzes) : 0;
  const bestScore = totalQuizzes > 0 ? Math.max(...results.map(r => r.percentage)) : 0;
  const worstScore = totalQuizzes > 0 ? Math.min(...results.map(r => r.percentage)) : 0;
  const totalTime = results.reduce((a, r) => a + r.timeTaken, 0);
  const accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
  const gain = results.reduce((a, r) => a + (r.gain || 0), 0);
  const penalty = results.reduce((a, r) => a + (r.penalty || 0), 0);
  const netScore = gain - penalty;
  // avgNetPercentage: average of each quiz's percentage (equally weighted per quiz)
  const avgNetPercentage = totalQuizzes > 0
    ? Math.max(0, Math.min(100, Math.round(results.reduce((a, r) => {
        const qPct = r.maxScore > 0 ? Math.max(0, ((r.netScore ?? r.gain - r.penalty) / r.maxScore) * 100) : r.percentage;
        return a + qPct;
      }, 0) / totalQuizzes)))
    : 0;

  return { totalQuizzes, totalQuestions, correct, wrong, skipped, avgPercentage, bestScore, worstScore, totalTime, accuracy, gain, penalty, netScore, avgNetPercentage };
}

/** Get all unique practice rounds that exist in history */
export function getAvailablePracticeRounds(history: QuizResult[]): Array<{
  attemptNumber: number;
  label: string;
  count: number;
  latestTimestamp: number;
  avgScore: number;
}> {
  const map = new Map<number, { count: number; latestTimestamp: number; totalScore: number }>();
  history.forEach(r => {
    if (r.attemptType === 'practice' && r.attemptNumber) {
      const existing = map.get(r.attemptNumber);
      if (existing) {
        existing.count++;
        existing.latestTimestamp = Math.max(existing.latestTimestamp, r.timestamp);
        existing.totalScore += r.percentage;
      } else {
        map.set(r.attemptNumber, { count: 1, latestTimestamp: r.timestamp, totalScore: r.percentage });
      }
    }
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([attemptNumber, { count, latestTimestamp, totalScore }]) => ({
      attemptNumber,
      label: getPracticeLabel(attemptNumber, latestTimestamp),
      count,
      latestTimestamp,
      avgScore: Math.round(totalScore / count),
    }));
}

// ────────────────────────────────────────────────
// NEW: Practice Journey — per-quiz timeline data
// ────────────────────────────────────────────────

export interface JourneyNode {
  type: 'main' | 'practice';
  result: QuizResult;
  attemptNumber?: number;
  percentage: number;
  timestamp: number;
}

export interface PracticeJourney {
  parentId: string;
  quizTitle: string;
  subject?: string;
  nodes: JourneyNode[];
  improvement: number; // latest practice % - main %
}

/** Build practice journey timelines for quizzes that have practice attempts */
export function getPracticeJourneys(history: QuizResult[]): PracticeJourney[] {
  const mainQuizzes = history.filter(r => (r.attemptType || 'main') === 'main' && r.id);
  const journeys: PracticeJourney[] = [];

  for (const main of mainQuizzes) {
    const practices = history
      .filter(r => r.attemptType === 'practice' && r.parentQuizId === main.id)
      .sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));

    if (practices.length === 0) continue;

    const nodes: JourneyNode[] = [
      { type: 'main', result: main, percentage: main.percentage, timestamp: main.timestamp },
      ...practices.map(p => ({
        type: 'practice' as const,
        result: p,
        attemptNumber: p.attemptNumber,
        percentage: p.percentage,
        timestamp: p.timestamp,
      })),
    ];

    const latestPractice = practices[practices.length - 1];
    journeys.push({
      parentId: main.id!,
      quizTitle: main.quizTitle || 'Untitled Quiz',
      subject: main.subject,
      nodes,
      improvement: latestPractice.percentage - main.percentage,
    });
  }

  return journeys.sort((a, b) => {
    const aLatest = a.nodes[a.nodes.length - 1].timestamp;
    const bLatest = b.nodes[b.nodes.length - 1].timestamp;
    return bLatest - aLatest;
  });
}

// ────────────────────────────────────────────────
// NEW: Score Progression — per-round averages
// ────────────────────────────────────────────────

export interface RoundScore {
  round: string; // "Main", "P1", "P2" ...
  avgScore: number;
  count: number;
  avgTime: number; // avg time per question in that round
}

export function getScoreProgression(history: QuizResult[]): RoundScore[] {
  // Main quizzes that have practices
  const mainWithPractice = history.filter(r => {
    if ((r.attemptType || 'main') !== 'main') return false;
    return history.some(p => p.attemptType === 'practice' && p.parentQuizId === r.id);
  });

  const result: RoundScore[] = [];

  if (mainWithPractice.length > 0) {
    const mainAvg = Math.round(mainWithPractice.reduce((a, r) => a + r.percentage, 0) / mainWithPractice.length);
    const mainAvgTime = mainWithPractice.reduce((a, r) => a + (r.totalQuestions > 0 ? r.timeTaken / r.totalQuestions : 0), 0) / mainWithPractice.length;
    result.push({ round: 'Main', avgScore: mainAvg, count: mainWithPractice.length, avgTime: Math.round(mainAvgTime) });
  }

  const rounds = getAvailablePracticeRounds(history);
  for (const round of rounds) {
    const roundResults = history.filter(r => r.attemptType === 'practice' && r.attemptNumber === round.attemptNumber);
    const avgTime = roundResults.reduce((a, r) => a + (r.totalQuestions > 0 ? r.timeTaken / r.totalQuestions : 0), 0) / roundResults.length;
    result.push({
      round: `P${round.attemptNumber}`,
      avgScore: round.avgScore,
      count: round.count,
      avgTime: Math.round(avgTime),
    });
  }

  return result;
}

// ────────────────────────────────────────────────
// NEW: Mastery Tracker
// ────────────────────────────────────────────────

export type MasteryStatus = 'mastered' | 'improving' | 'weak' | 'unknown';

export interface QuestionMastery {
  question: string;
  correctAnswer: string;
  status: MasteryStatus;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  lastCorrect: boolean;
}

/** Analyze mastery of questions across practice attempts */
export function getQuestionMasteries(history: QuizResult[]): QuestionMastery[] {
  const practiceResults = history.filter(r => r.attemptType === 'practice').sort((a, b) => a.timestamp - b.timestamp);
  if (practiceResults.length === 0) return [];

  const questionMap = new Map<string, { correct: number; wrong: number; attempts: number; lastCorrect: boolean; correctAnswer: string }>();

  for (const result of practiceResults) {
    if (!result.quizData?.length) continue;
    result.quizData.forEach((q, i) => {
      const key = q.question;
      const existing = questionMap.get(key) || { correct: 0, wrong: 0, attempts: 0, lastCorrect: false, correctAnswer: q.correctAnswer };
      existing.attempts++;
      const ua = result.userAnswers[i];
      if (ua === q.correctAnswer) {
        existing.correct++;
        existing.lastCorrect = true;
      } else if (ua !== null) {
        existing.wrong++;
        existing.lastCorrect = false;
      }
      questionMap.set(key, existing);
    });
  }

  const masteries: QuestionMastery[] = [];
  questionMap.forEach((data, question) => {
    let status: MasteryStatus = 'unknown';
    if (data.correct >= 2 && data.lastCorrect) status = 'mastered';
    else if (data.wrong > 0 && data.lastCorrect) status = 'improving';
    else if (data.wrong > 0 && !data.lastCorrect) status = 'weak';
    else if (data.correct >= 1) status = 'improving';

    masteries.push({
      question,
      correctAnswer: data.correctAnswer,
      status,
      attempts: data.attempts,
      correctCount: data.correct,
      wrongCount: data.wrong,
      lastCorrect: data.lastCorrect,
    });
  });

  return masteries;
}

export function getMasterySummary(masteries: QuestionMastery[]) {
  const mastered = masteries.filter(m => m.status === 'mastered').length;
  const improving = masteries.filter(m => m.status === 'improving').length;
  const weak = masteries.filter(m => m.status === 'weak').length;
  const total = masteries.length;
  return { mastered, improving, weak, total };
}

// ────────────────────────────────────────────────
// NEW: Weak Questions — consistently missed
// ────────────────────────────────────────────────

export interface WeakQuestion {
  question: string;
  correctAnswer: string;
  options: string[];
  timesWrong: number;
  timesAttempted: number;
  lastUserAnswer: string | null;
  quizTitle?: string;
}

export function getWeakQuestions(history: QuizResult[], limit = 10): WeakQuestion[] {
  const practiceResults = history.filter(r => r.attemptType === 'practice').sort((a, b) => a.timestamp - b.timestamp);
  const qMap = new Map<string, WeakQuestion>();

  for (const result of practiceResults) {
    if (!result.quizData?.length) continue;
    result.quizData.forEach((q, i) => {
      const ua = result.userAnswers[i];
      const existing = qMap.get(q.question);
      if (existing) {
        existing.timesAttempted++;
        if (ua !== null && ua !== q.correctAnswer) existing.timesWrong++;
        existing.lastUserAnswer = ua;
      } else {
        qMap.set(q.question, {
          question: q.question,
          correctAnswer: q.correctAnswer,
          options: q.options,
          timesWrong: ua !== null && ua !== q.correctAnswer ? 1 : 0,
          timesAttempted: 1,
          lastUserAnswer: ua,
          quizTitle: result.quizTitle,
        });
      }
    });
  }

  return Array.from(qMap.values())
    .filter(q => q.timesWrong >= 1)
    .sort((a, b) => b.timesWrong - a.timesWrong || b.timesAttempted - a.timesAttempted)
    .slice(0, limit);
}

// ────────────────────────────────────────────────
// NEW: Speed Trend
// ────────────────────────────────────────────────

export interface SpeedRound {
  round: string;
  avgSecondsPerQ: number;
  count: number;
}

export function getSpeedTrend(history: QuizResult[]): SpeedRound[] {
  const rounds = getAvailablePracticeRounds(history);
  const result: SpeedRound[] = [];

  for (const round of rounds) {
    const roundResults = history.filter(r => r.attemptType === 'practice' && r.attemptNumber === round.attemptNumber);
    const totalTimePerQ = roundResults.reduce((a, r) => a + (r.totalQuestions > 0 ? r.timeTaken / r.totalQuestions : 0), 0);
    result.push({
      round: `P${round.attemptNumber}`,
      avgSecondsPerQ: Math.round(totalTimePerQ / roundResults.length),
      count: roundResults.length,
    });
  }
  return result;
}

// ────────────────────────────────────────────────
// NEW: Practice Goals
// ────────────────────────────────────────────────

const PRACTICE_GOAL_KEY = 'rjquiz:practice_goal';

export interface PracticeGoalData {
  weeklyTarget: number;
  lastUpdated: number;
}

export function getPracticeGoal(): PracticeGoalData {
  try {
    const raw = localStorage.getItem(PRACTICE_GOAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { weeklyTarget: 5, lastUpdated: Date.now() };
}

export function setPracticeGoal(target: number) {
  localStorage.setItem(PRACTICE_GOAL_KEY, JSON.stringify({ weeklyTarget: target, lastUpdated: Date.now() }));
}

export function getWeeklyPracticeCount(history: QuizResult[]): number {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  return history.filter(r => r.attemptType === 'practice' && r.timestamp >= weekStart.getTime()).length;
}

// ────────────────────────────────────────────────
// NEW: Quick Re-Practice — quizzes needing more work
// ────────────────────────────────────────────────

export interface RePracticeItem {
  mainResult: QuizResult;
  latestPractice: QuizResult;
  practiceCount: number;
  latestScore: number;
}

export function getQuizzesNeedingPractice(history: QuizResult[], limit = 5): RePracticeItem[] {
  const mainQuizzes = history.filter(r => (r.attemptType || 'main') === 'main' && r.id);
  const items: RePracticeItem[] = [];

  for (const main of mainQuizzes) {
    const practices = history
      .filter(r => r.attemptType === 'practice' && r.parentQuizId === main.id)
      .sort((a, b) => b.timestamp - a.timestamp);

    const latest = practices[0] || main;
    if (latest.percentage < 80) {
      items.push({
        mainResult: main,
        latestPractice: latest,
        practiceCount: practices.length,
        latestScore: latest.percentage,
      });
    }
  }

  return items.sort((a, b) => a.latestScore - b.latestScore).slice(0, limit);
}
