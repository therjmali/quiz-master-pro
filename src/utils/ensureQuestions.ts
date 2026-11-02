/**
 * Load the full question list for a history record.
 *
 * Cloud history is stored as lightweight summaries (quizData is []). Saving such a record into an
 * Organizer folder used to create an EMPTY file ("0 Qs", can't practise, can't be matched).
 * This resolves the real questions from: the record itself → on-device detail cache → cloud.
 */
import type { QuizQuestion, QuizResult } from '../types/quiz';

export async function loadQuizQuestions(
  result: Pick<QuizResult, 'id' | 'timestamp' | 'quizData'>,
): Promise<QuizQuestion[]> {
  if (result.quizData?.length) return result.quizData;

  try {
    const { getQuizDetailFromIDB, parseFullRecord } = await import('../hooks/useHistorySync');

    // 1) On-device detail cache (keyed by cloud id and by timestamp)
    for (const key of [result.id, String(result.timestamp)]) {
      if (!key) continue;
      const hit = await getQuizDetailFromIDB(key);
      if (hit?.quizData?.length) return hit.quizData;
    }

    // 2) Cloud
    if (result.id) {
      const { getQuizDetail } = await import('zitejs/api');
      const resp = await getQuizDetail({ id: result.id });
      const full = parseFullRecord(resp.record);
      if (full.quizData?.length) return full.quizData;
    }
  } catch {
    /* offline or not found — caller decides how to degrade */
  }
  return [];
}
