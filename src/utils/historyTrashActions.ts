import type { QuizResult } from '../types/quiz';
import { getHistory, setHistory } from './historyStore';
import { loadHistoryTrash, deleteFromHistoryTrash, resultKey, withoutHistoryTrash } from './historyTrash';
import { storeQuizDetail } from '../hooks/useHistorySync';

/** Put results back into the history (newest first) and remove them from the trash. */
export async function restoreFromHistoryTrash(keys: readonly string[]): Promise<number> {
  const wanted = new Set(keys);
  const trash = await loadHistoryTrash();
  const restore = trash.filter(t => wanted.has(resultKey(t.result))).map(t => t.result as QuizResult);
  if (restore.length === 0) return 0;
  await Promise.all(
    restore
      .filter(r => Array.isArray(r.quizData) && r.quizData.length > 0)
      .flatMap(r => [
        storeQuizDetail(String(r.timestamp), r),
        ...(r.id ? [storeQuizDetail(String(r.id), r)] : []),
      ]),
  );
  const current = await getHistory();
  const existing = new Set(current.map(resultKey));
  const merged = [...restore.filter(r => !existing.has(resultKey(r))), ...current]
    .sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0));
  withoutHistoryTrash(() => setHistory(merged));
  await deleteFromHistoryTrash(keys);
  return restore.length;
}
