import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFTS_KEY, MAX_DRAFTS, clearDrafts, draftIdFor, getDraft, listDrafts, putDraft, removeDraft, removeDraftForQuiz, upsertDraft, type SessionBlob } from '../src/utils/drafts';
import { buildDetailShards, isSyncKey, describeSection } from '../src/platform/cloud/sections';

beforeEach(() => { localStorage.clear(); });

const quiz = (tag: string, n = 5) => Array.from({ length: n }, (_, i) => ({ question: `${tag} question ${i}`, options: ['a', 'b', 'c', 'd'], correctAnswer: 'a' }));
const blob = (tag: string, answered = 2, extra: Partial<SessionBlob> = {}): SessionBlob => ({
  quizData: quiz(tag) as any, settings: { quizTitle: `Quiz ${tag}`, subject: 'Pharma' } as any, currentIndex: answered,
  userAnswers: Array.from({ length: 5 }, (_, i) => (i < answered ? 'a' : null)), flaggedQuestions: [false, false, false, false, false],
  accumulatedTime: 30, timeLeftPerQ: [], forcedNext: [], totalTimeLeft: 0, savedAt: 1, ...extra,
});

test('draftIdFor: same questions = same id (even shuffled), different quiz = different id', () => {
  const a = quiz('A'), b = [...quiz('A')].reverse();
  assert.equal(draftIdFor(a), draftIdFor(b));
  assert.notEqual(draftIdFor(a), draftIdFor(quiz('B')));
  assert.notEqual(draftIdFor(quiz('A', 5)), draftIdFor(quiz('A', 6)));
  assert.equal(draftIdFor(quiz('A')), draftIdFor(quiz('A').map(q => ({ ...q, question: q.question.toUpperCase() }))), 'case-insensitive');
});

test('drafts: exiting the same quiz twice keeps ONE draft with the newest progress (no duplicates)', () => {
  upsertDraft(blob('A', 1), 1000);
  upsertDraft(blob('A', 3), 2000);
  const list = listDrafts();
  assert.equal(list.length, 1);
  assert.equal(list[0].answered, 3); assert.equal(list[0].savedAt, 2000); assert.equal(list[0].title, 'Quiz A'); assert.equal(list[0].total, 5);
});

test('drafts: at most 5 - the 6th replaces the oldest', () => {
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach((t, i) => upsertDraft(blob(t), 1000 + i));
  const list = listDrafts();
  assert.equal(list.length, MAX_DRAFTS);
  assert.deepEqual(list.map(d => d.title), ['Quiz F', 'Quiz E', 'Quiz D', 'Quiz C', 'Quiz B']);
  assert.equal(Object.keys(JSON.parse(localStorage.getItem(DRAFTS_KEY)!).items).length, 5, 'storage is trimmed too (so it syncs trimmed)');
});

test('drafts: re-saving an old quiz moves it to the top and does not evict a newer one', () => {
  ['A', 'B', 'C', 'D', 'E'].forEach((t, i) => upsertDraft(blob(t), 1000 + i));
  upsertDraft(blob('A', 4), 5000);
  const list = listDrafts();
  assert.equal(list.length, 5); assert.equal(list[0].title, 'Quiz A'); assert.equal(list[0].answered, 4);
});

test('drafts: remove, undo (putDraft), remove by quiz, clear, get', () => {
  const d = upsertDraft(blob('A'), 1000)!; upsertDraft(blob('B'), 2000);
  assert.equal(getDraft(d.id)?.title, 'Quiz A');
  removeDraft(d.id); assert.equal(listDrafts().length, 1);
  putDraft(d); assert.equal(listDrafts().length, 2);
  removeDraftForQuiz(quiz('B') as any); assert.deepEqual(listDrafts().map(x => x.title), ['Quiz A']);
  clearDrafts(); assert.equal(listDrafts().length, 0); assert.equal(localStorage.getItem(DRAFTS_KEY), null);
});

test('drafts: broken or empty entries are ignored, empty quiz is not saved, 8 merged devices still show 5', () => {
  assert.equal(upsertDraft({ ...blob('A'), quizData: [] }), null);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify({ v: 1, items: { x: 'not json', y: JSON.stringify({ session: { quizData: [] } }) } }));
  assert.equal(listDrafts().length, 0);
  const items: Record<string, string> = {};
  for (let i = 0; i < 8; i++) { const d = upsertDraft(blob(`Q${i}`), 1000 + i)!; items[d.id] = JSON.stringify(d); }
  localStorage.setItem(DRAFTS_KEY, JSON.stringify({ v: 1, items })); // what a merge of two devices could produce
  assert.equal(listDrafts().length, 5);
});

test('draft keeps everything needed to resume (answers, flags, timers, settings)', () => {
  const d = upsertDraft(blob('A', 3, { accumulatedTime: 123, flaggedQuestions: [true, false, false, false, false], totalTimeLeft: 77 }), 1000)!;
  const s = getDraft(d.id)!.session;
  assert.equal(s.accumulatedTime, 123); assert.equal(s.totalTimeLeft, 77); assert.deepEqual(s.userAnswers.slice(0, 3), ['a', 'a', 'a']); assert.equal(s.flaggedQuestions[0], true); assert.equal(s.quizData.length, 5);
});

test('cloud: quiz-detail shards are keyed by month, skip items that already carry questions, and are valid sync keys', () => {
  const t1 = Date.UTC(2026, 9, 12), t2 = Date.UTC(2026, 10, 3), t3 = Date.UTC(2026, 10, 9);
  const hist = [
    { id: 'a', timestamp: t1, quizData: [] }, { id: 'b', timestamp: t2, quizData: [] }, { id: 'c', timestamp: t3, quizData: [{ question: 'inline' }] }, { id: 'd', timestamp: t3 + 1, quizData: [] },
  ] as any[];
  const full = (r: any) => (r.id === 'd' ? undefined : { ...r, quizData: [{ question: `Q of ${r.id}` }], userAnswers: ['x'] });
  const shards = buildDetailShards(hist, full);
  assert.deepEqual(Object.keys(shards).sort(), ['qd:2026-10', 'qd:2026-11']);
  assert.deepEqual(Object.keys(shards['qd:2026-11'].items), ['b']);
  assert.equal(isSyncKey('qd:2026-11'), true); assert.equal(isSyncKey('qd:garbage'), false); assert.equal(isSyncKey('qmp_drafts_v1'), true);
  assert.match(describeSection('qd:2026-10')!.label, /Quiz questions - October 2026/);
});
