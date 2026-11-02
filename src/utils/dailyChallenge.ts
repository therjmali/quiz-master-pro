import { QuizQuestion, QuizResult } from '../types/quiz';


const KEY = 'qmp_daily_challenge';

export interface DailyChallengeState {
  lastDate: string;
  streak: number;
  totalCorrect: number;
  totalAttempted: number;
  todayQuestion?: QuizQuestion;
  todayResult?: { correct: boolean; userAnswer: string };
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function loadChallenge(): DailyChallengeState {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {} as any; }
}

export function saveChallenge(state: DailyChallengeState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function isChallengeCompletedToday(): boolean {
  const s = loadChallenge();
  return s.lastDate === today() && !!s.todayResult;
}

export function getChallengeStreak(): number {
  return loadChallenge().streak || 0;
}

export function pickChallengeQuestion(history: QuizResult[]): QuizQuestion | null {
  // Try wrong questions from history first
  const wrongQs: QuizQuestion[] = [];
  history.filter(r => r.quizData?.length > 0).forEach(r => {
    r.quizData.forEach((q, i) => {
      if (r.userAnswers[i] !== null && r.userAnswers[i] !== q.correctAnswer) {
        wrongQs.push(q);
      }
    });
  });
  if (wrongQs.length > 0) {
    return wrongQs[Math.floor(Math.random() * wrongQs.length)];
  }
  // Fall back to any question from history
  const allQs = history.filter(r => r.quizData?.length > 0).flatMap(r => r.quizData);
  if (allQs.length > 0) {
    return allQs[Math.floor(Math.random() * allQs.length)];
  }
  return null;
}

export function generateDailyChallenge(history: QuizResult[]): DailyChallengeState {
  const state = loadChallenge();
  const d = today();
  
  // Already generated for today
  if (state.lastDate === d && state.todayQuestion) return state;
  
  // Check if yesterday was completed to maintain streak
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split('T')[0];
  const wasYesterday = state.lastDate === yStr && state.todayResult;
  
  const question = pickChallengeQuestion(history);
  if (!question) return state;
  
  const newState: DailyChallengeState = {
    lastDate: d,
    streak: wasYesterday ? (state.streak || 0) : (state.lastDate === d ? (state.streak || 0) : 0),
    totalCorrect: state.totalCorrect || 0,
    totalAttempted: state.totalAttempted || 0,
    todayQuestion: question,
    todayResult: undefined,
  };
  saveChallenge(newState);
  return newState;
}

export function submitChallengeAnswer(answer: string): DailyChallengeState {
  const state = loadChallenge();
  if (!state.todayQuestion || state.todayResult) return state;
  
  const correct = answer === state.todayQuestion.correctAnswer;
  state.todayResult = { correct, userAnswer: answer };
  state.totalAttempted = (state.totalAttempted || 0) + 1;
  if (correct) {
    state.totalCorrect = (state.totalCorrect || 0) + 1;
    state.streak = (state.streak || 0) + 1;
  }
  saveChallenge(state);
  return state;
}
