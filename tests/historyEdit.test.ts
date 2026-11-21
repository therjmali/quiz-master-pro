import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { QuizResult } from '../src/types/quiz';
import { applyHistoryEdit, findResult, migrateResultKeys, resultKeyOf, DETAIL_PREFIX } from '../src/utils/historyEdit';
import { repairOrphanedEdits, matchOrphans } from '../src/utils/historyRepair';
import { __resetHistoryTrashForTests, getHistoryTrashSync, loadHistoryTrash, resultKey, saveHistoryTrash, trashRemovedResults, withoutHistoryTrash } from '../src/utils/historyTrash';
import { idbGet, idbSet } from '../src/utils/indexedDB';

beforeEach(() => { localStorage.clear(); __resetHistoryTrashForTests(); });

const D = 86_400_000;
const q = (n: number) => Array.from({ length: n }, (_, i) => ({ question: `Q${i}`, options: ['a', 'b', 'c', 'd'], correctAnswer: 'a' }));
const rec = (ts: number, extra: Partial<QuizResult> = {}): QuizResult => ({
  quizTitle: `Quiz ${ts}`, subject: 'FON', timestamp: ts, totalQuestions: 12, correct: 4, wrong: 4, skipped: 4, score: 4, timeTaken: 413,
  quizData: [], userAnswers: [], ...extra,
} as QuizResult);

test('edit: a name / subject / notes change updates the ONE record in place - same key, same position, others untouched', () => {
  const h = [rec(3 * D, { id: 'uuid-3' }), rec(2 * D, { id: 'uuid-2' }), rec(D)];
  const out = applyHistoryEdit(h, 'uuid-2', { quizTitle: 'Renamed', subject: 'OBG', notes: 'n' })!;
  assert.equal(out.history.length, 3);
  assert.equal(out.after.id, 'uuid-2');
  assert.equal(out.after.quizTitle, 'Renamed'); assert.equal(out.after.subject, 'OBG'); assert.equal(out.after.notes, 'n');
  assert.equal(resultKey(out.after), resultKey(out.before), 'identity unchanged');
  assert.strictEqual(out.history[0], h[0]); assert.strictEqual(out.history[2], h[2]);
  assert.notStrictEqual(out.after, out.before, 'immutable: a new object');
  assert.equal(h[1].quizTitle, `Quiz ${2 * D}`, 'the input list is never mutated');
});

test('edit: an empty name keeps the old one; unknown key returns null', () => {
  const h = [rec(D, { id: 'x' })];
  assert.equal(applyHistoryEdit(h, 'x', { quizTitle: '' })!.after.quizTitle, `Quiz ${D}`);
  assert.equal(applyHistoryEdit(h, 'nope', { quizTitle: 'a' }), null);
});

test('edit: changing the date of a record WITH an id keeps its identity, re-sorts, and nothing leaves the list', () => {
  const h = [rec(3 * D, { id: 'a' }), rec(2 * D, { id: 'b' }), rec(D, { id: 'c' })];
  const out = applyHistoryEdit(h, 'c', { timestamp: 5 * D })!;
  assert.deepEqual(out.history.map(r => r.id), ['c', 'a', 'b']);
  assert.equal(out.after.id, 'c'); assert.equal(out.after.timestamp, 5 * D);
  assert.equal(out.history.length, 3);
});

test('edit: a LEGACY record (no id) gets a permanent id before its date changes, so it is never "removed and added"', () => {
  const h = [rec(2 * D), rec(D)];
  const out = applyHistoryEdit(h, String(D), { timestamp: 9 * D })!;
  assert.ok(out.after.id && out.after.id.length >= 16, 'a UUID was assigned');
  assert.equal(out.history.length, 2);
  assert.equal(out.history.filter(r => r.timestamp === D).length, 0, 'no copy under the old date');
  assert.equal(findResult(out.history, out.after.id!)?.timestamp, 9 * D, 'found by its new id');
  // editing only the title does not need (or add) an id
  assert.equal(applyHistoryEdit(h, String(D), { quizTitle: 'x' })!.after.id, undefined);
});

test('edit: practice attempts of the edited quiz stay attached (date and id re-pointed)', () => {
  const parent = rec(D);
  const child = rec(2 * D, { attemptType: 'practice', parentQuizTimestamp: D } as Partial<QuizResult>);
  const other = rec(3 * D, { attemptType: 'practice', parentQuizTimestamp: 777 } as Partial<QuizResult>);
  const out = applyHistoryEdit([other, child, parent], String(D), { timestamp: 9 * D })!;
  const c = out.history.find(r => r.timestamp === 2 * D)!;
  assert.equal(c.parentQuizTimestamp, 9 * D); assert.equal(c.parentQuizId, out.after.id);
  assert.equal(out.history.find(r => r.timestamp === 3 * D)!.parentQuizTimestamp, 777, 'an unrelated attempt is untouched');
});

test('REGRESSION: the old edit trashed the original and left an unopenable copy; the new one trashes nothing', async () => {
  const h = [rec(D)];
  const out = applyHistoryEdit(h, String(D), { timestamp: 9 * D })!;
  // the app saves an edit with trash suppression (an edit is not a delete)
  withoutHistoryTrash(() => trashRemovedResults(h, out.history));
  await new Promise(r => setTimeout(r, 20));
  assert.equal((await loadHistoryTrash()).length, 0, 'nothing was parked in Trash');
  // and the legacy behaviour (date changed in place, still no id) would have trashed it:
  __resetHistoryTrashForTests();
  trashRemovedResults(h, [{ ...h[0], timestamp: 9 * D }]);
  await new Promise(r => setTimeout(r, 20));
  assert.equal((await loadHistoryTrash()).length, 1, 'this is the bug that was fixed');
  // a record that has an id never "disappears" on a date edit, even without suppression
  localStorage.clear(); __resetHistoryTrashForTests();
  const withId = [rec(D, { id: 'k' })];
  trashRemovedResults(withId, applyHistoryEdit(withId, 'k', { timestamp: 9 * D })!.history);
  await new Promise(r => setTimeout(r, 20));
  assert.equal((await loadHistoryTrash()).length, 0);
});

test('migrate: saved questions, pin, rating, revision sheet and negative-marking state follow a legacy record to its new id and date', async () => {
  const before = rec(D);
  await idbSet(DETAIL_PREFIX + D, { ...before, quizData: q(12), userAnswers: Array(12).fill('a') });
  localStorage.setItem('rjquiz:pinnedIds', JSON.stringify([String(D), 'other']));
  localStorage.setItem('qmp_quiz_ratings', JSON.stringify({ [String(D)]: { stars: 4 } }));
  localStorage.setItem('qmp_original_scores', JSON.stringify({ [String(D)]: { score: 4 } }));
  localStorage.setItem(`qmp_revision_${D}`, '"sheet"');
  const out = applyHistoryEdit([before], String(D), { timestamp: 9 * D, quizTitle: 'New name' })!;
  await migrateResultKeys(out.before, out.after);
  const byTs = await idbGet<QuizResult>(DETAIL_PREFIX + 9 * D);
  const byId = await idbGet<QuizResult>(DETAIL_PREFIX + out.after.id);
  assert.equal(byTs?.quizData.length, 12, 'questions reachable by the new date');
  assert.equal(byId?.quizData.length, 12, 'and by the id');
  assert.equal(byTs?.quizTitle, 'New name'); assert.equal(byTs?.timestamp, 9 * D);
  assert.equal(await idbGet(DETAIL_PREFIX + D), undefined, 'old key cleaned up');
  assert.deepEqual(JSON.parse(localStorage.getItem('rjquiz:pinnedIds')!), [out.after.id, 'other']);
  assert.ok(JSON.parse(localStorage.getItem('qmp_quiz_ratings')!)[String(9 * D)]);
  assert.ok(JSON.parse(localStorage.getItem('qmp_original_scores')!)[out.after.id!]);
  assert.equal(localStorage.getItem(`qmp_revision_${9 * D}`), '"sheet"'); assert.equal(localStorage.getItem(`qmp_revision_${D}`), null);
  await migrateResultKeys(out.before, out.after); // idempotent
  assert.equal((await idbGet<QuizResult>(DETAIL_PREFIX + 9 * D))?.quizData.length, 12);
});

test('repair: an edited copy without questions gets them back from the trashed original, and the leftover leaves Trash', async () => {
  const original = rec(D, { quizData: q(12) as any });
  const edited = rec(9 * D, { quizTitle: 'Edited name' });
  await saveHistoryTrash([{ result: original, deletedAt: 5 }]);
  __resetHistoryTrashForTests();
  const n = await repairOrphanedEdits([edited, rec(3 * D, { totalQuestions: 20, correct: 9 })]);
  assert.equal(n, 1);
  const fixed = await idbGet<QuizResult>(DETAIL_PREFIX + 9 * D);
  assert.equal(fixed?.quizData.length, 12); assert.equal(fixed?.quizTitle, 'Edited name'); assert.equal(fixed?.timestamp, 9 * D);
  __resetHistoryTrashForTests();
  assert.equal(getHistoryTrashSync().length === 0 && (await loadHistoryTrash()).length, 0, 'trash entry consumed');
  assert.equal(await repairOrphanedEdits([edited]), 0, 'idempotent');
});

test('repair: never guesses - ambiguous or non-matching trash is left alone; a record that still has questions is not touched', async () => {
  const a = rec(D, { quizData: q(12) as any }), b = rec(2 * D, { quizData: q(12) as any });
  const orphan = rec(9 * D);
  assert.equal(matchOrphans([orphan], [{ result: a, deletedAt: 1 }, { result: b, deletedAt: 1 }]).length, 0, 'two identical candidates: no guess');
  assert.equal(matchOrphans([orphan], [{ result: rec(D, { correct: 5, quizData: q(12) as any }), deletedAt: 1 }]).length, 0, 'different numbers: no match');
  await saveHistoryTrash([{ result: a, deletedAt: 1 }]); __resetHistoryTrashForTests();
  await idbSet(DETAIL_PREFIX + 9 * D, { ...orphan, quizData: q(12) });
  assert.equal(await repairOrphanedEdits([orphan]), 0, 'has its questions already');
  assert.equal(resultKeyOf({ id: 'z', timestamp: 1 }), 'z');
});
