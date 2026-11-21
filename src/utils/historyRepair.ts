/**
 * Repair for quizzes damaged by the old Library edit (date / time changed on a record without an id):
 * the original ended up in Trash holding its questions, and the edited copy in the Library had none, so it
 * would not open. This re-attaches the questions to the edited copy and takes the leftover out of Trash.
 *
 * A trashed record is only used when it matches exactly ONE history record that has no saved questions, on
 * every number of the attempt (question count, correct, wrong, skipped, score, time taken). Idempotent.
 */
import type { QuizResult } from '../types/quiz';
import { idbGetMulti, idbSet } from './indexedDB';
import { loadHistoryTrash, deleteFromHistoryTrash, resultKey, type TrashedResult } from './historyTrash';
import { DETAIL_PREFIX } from './historyEdit';

const same = (a: QuizResult, b: QuizResult) =>
  a.totalQuestions === b.totalQuestions && a.correct === b.correct && a.wrong === b.wrong && a.skipped === b.skipped &&
  Math.round(a.score ?? 0) === Math.round(b.score ?? 0) && Math.abs((a.timeTaken ?? 0) - (b.timeTaken ?? 0)) < 1;

/** Pure matching step (unit-tested): which trash entries belong to which orphaned history record. */
export function matchOrphans(orphans: readonly QuizResult[], trash: readonly TrashedResult[]): Array<{ orphan: QuizResult; from: TrashedResult }> {
  const out: Array<{ orphan: QuizResult; from: TrashedResult }> = [];
  const used = new Set<string>();
  for (const orphan of orphans) {
    const cands = trash.filter(t =>
      (t.result.quizData?.length ?? 0) > 0 && !used.has(resultKey(t.result)) &&
      t.result.timestamp !== orphan.timestamp && same(t.result, orphan));
    if (cands.length !== 1) continue; // none, or ambiguous: never guess
    const rivals = orphans.filter(o => o !== orphan && same(cands[0].result, o));
    if (rivals.length) continue;
    used.add(resultKey(cands[0].result));
    out.push({ orphan, from: cands[0] });
  }
  return out;
}

/** Returns how many quizzes were repaired. */
export async function repairOrphanedEdits(history: readonly QuizResult[]): Promise<number> {
  const trash = await loadHistoryTrash();
  if (!trash.length || !history.length) return 0;
  const lite = history.filter(r => !(r.quizData?.length));
  if (!lite.length) return 0;
  const keys = [...new Set(lite.flatMap(r => [DETAIL_PREFIX + r.timestamp, ...(r.id ? [DETAIL_PREFIX + r.id] : [])]))];
  const have = await idbGetMulti<QuizResult>(keys);
  const hasQuestions = (k: string) => ((have.get(k)?.quizData?.length) ?? 0) > 0;
  const orphans = lite.filter(r => !hasQuestions(DETAIL_PREFIX + r.timestamp) && !(r.id && hasQuestions(DETAIL_PREFIX + r.id)));
  if (!orphans.length) return 0;
  const matches = matchOrphans(orphans, trash);
  for (const { orphan, from } of matches) {
    const repaired: QuizResult = { ...from.result, id: orphan.id ?? from.result.id, timestamp: orphan.timestamp, quizTitle: orphan.quizTitle, subject: orphan.subject, notes: orphan.notes };
    await idbSet(DETAIL_PREFIX + orphan.timestamp, repaired);
    if (orphan.id) await idbSet(DETAIL_PREFIX + orphan.id, repaired);
  }
  if (matches.length) await deleteFromHistoryTrash(matches.map(m => resultKey(m.from.result)));
  return matches.length;
}
