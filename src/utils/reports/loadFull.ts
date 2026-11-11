/** History rows are light summaries; reports need every question. Local-first (works offline), server only if one exists. */
import type { QuizQuestion, QuizResult } from '../../types/quiz';
import { getQuizDetailsFromIDB } from '../../hooks/useHistorySync';
import { hasBackend } from '../../platform/ai/caller';

function parseFullRecord(r: any): QuizResult {
  let quizData: QuizQuestion[] = [];
  let userAnswers: (string | null)[] = [];
  try { quizData = JSON.parse(r.quizDataJson || '[]'); } catch { /* ignore */ }
  try { userAnswers = JSON.parse(r.userAnswersJson || '[]'); } catch { /* ignore */ }
  const correct = r.correctCount || 0, wrong = r.wrongCount || 0, skipped = r.skippedCount || 0;
  const score = r.score || 0, maxScore = r.maxScore || 0;
  return {
    id: r.id, totalQuestions: r.totalQuestions || correct + wrong + skipped, quizData, userAnswers, score, maxScore,
    percentage: maxScore > 0 ? Math.max(0, Math.min(100, Math.round((score / maxScore) * 100))) : (r.percentage || 0),
    correct, wrong, skipped, gain: r.gain ?? correct, penalty: r.penalty ?? 0, netScore: score,
    accuracy: correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0,
    timeTaken: r.timeTakenSeconds || 0, difficulty: r.difficulty,
    timestamp: r.localTimestamp || (r.createdAt ? new Date(r.createdAt).getTime() : Date.now()),
    quizTitle: r.quizTitle || undefined, subject: r.subject || undefined, passMark: undefined,
    attemptType: r.attemptType === 'Practice' ? 'practice' : 'main', attemptNumber: r.attemptNumber || undefined,
    parentQuizId: r.parentQuizId || undefined, parentQuizTimestamp: undefined, notes: r.notes || undefined,
  } as QuizResult;
}

export interface LoadReport { results: QuizResult[]; missing: number }

export async function loadFullResults(summaries: QuizResult[]): Promise<LoadReport> {
  const need = summaries.filter(r => !r.quizData || r.quizData.length === 0);
  if (!need.length) return { results: summaries, missing: 0 };
  const keys = [...new Set(need.flatMap(r => [r.id || String(r.timestamp), String(r.timestamp)]))];
  let idb = new Map<string, QuizResult>();
  try { idb = await getQuizDetailsFromIDB(keys); } catch { /* IndexedDB unavailable */ }

  const server = new Map<string, QuizResult>();
  if (hasBackend() && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    const still = need.filter(r => r.id && !(idb.get(r.id)?.quizData?.length || idb.get(String(r.timestamp))?.quizData?.length));
    if (still.length) {
      try {
        const { getQuizDetail } = await import('zitejs/api');
        await Promise.allSettled(still.map(async r => {
          const resp = await getQuizDetail({ id: r.id! });
          if (resp.record) { const full = parseFullRecord(resp.record); if (full.quizData.length) server.set(r.id!, full); }
        }));
      } catch { /* server unreachable: use what is on the device */ }
    }
  }
  let missing = 0;
  const results = summaries.map(r => {
    if (r.quizData?.length) return r;
    if (r.id && server.has(r.id)) return server.get(r.id)!;
    const a = (r.id && idb.get(r.id)) || idb.get(String(r.timestamp));
    if (a?.quizData?.length) return { ...r, ...a, id: r.id ?? a.id };
    if (r.totalQuestions > 0) missing++;
    return r;
  });
  return { results, missing };
}
