import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ReactNs from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { countStatuses, flattenAttempts, orderAttemptItems, pickByStatus, summarizeResults, toCounts, type AttemptItem } from '../src/utils/attemptStats';
import { useStatusFilter } from '../src/hooks/useStatusFilter';
import StatusFilterBar from '../src/components/shared/StatusFilterBar';
import { buildQuestionDoc } from '../src/utils/reports/pdf/model';
import type { ReportKind } from '../src/utils/reports/pdf/types';

// tsx compiles .tsx with the classic JSX runtime, which looks for a global React at render time
(globalThis as Record<string, unknown>).React = ReactNs;

const Q = (n: number, extra: Record<string, unknown> = {}) => ({ question: `Question ${n}`, options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correctAnswer: 'Beta', difficulty: 'medium', ...extra });
const R = (id: string, qs: any[], answers: (string | null)[], extra: any = {}): any => ({ id, quizTitle: `Quiz ${id}`, subject: 'Pharma', timestamp: 1_700_000_000_000 + id.length, quizData: qs, userAnswers: answers, totalQuestions: qs.length, percentage: 50, correct: 0, wrong: 0, skipped: 0, timeTaken: 60, ...extra });

// quiz A: 3 correct, 2 wrong, 1 skipped, '' counts as skipped, multi-answer question, missing difficulty counts as medium
const A = R('a', [Q(1, { difficulty: 'easy' }), Q(2, { difficulty: 'easy' }), Q(3), Q(4, { difficulty: 'hard' }), Q(5, { correctAnswers: ['Gamma', 'Delta'] }), Q(6, { difficulty: undefined })], ['Beta', 'Beta', 'Alpha', 'Gamma', 'Delta', '']);
// quiz B: 2 correct, 1 wrong, 1 skipped
const B = R('bb', [Q(7, { difficulty: 'easy' }), Q(8), Q(9), Q(10, { difficulty: 'easy' })], ['Beta', 'Alpha', 'Beta', null]);
// quiz C: questions are NOT on this device, only saved counters (7 correct, 2 wrong, 1 skipped)
const C = R('ccc', [], [], { totalQuestions: 10, correct: 7, wrong: 2, skipped: 1 });

const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o as object).forEach(deepFreeze); } return o; };

test('statuses: multi-answer, empty string, null and missing difficulty are classified once, everywhere', () => {
  const items = flattenAttempts([A]);
  assert.deepEqual(items.map(i => i.status), ['correct', 'correct', 'wrong', 'wrong', 'correct', 'skipped']);
  assert.equal(items[5].level, 'medium');
  assert.deepEqual(countStatuses(items), { all: 6, correct: 3, wrong: 2, skipped: 1 });
});

test('summary = lists: counts of the master equal the items, and unavailable quizzes keep their saved totals', () => {
  const s = summarizeResults([A, B]);
  assert.deepEqual(toCounts(s), { all: 10, correct: 5, wrong: 3, skipped: 2 });
  assert.deepEqual(toCounts(s), countStatuses(flattenAttempts([A, B])));
  assert.equal(s.unavailableQuizzes, 0);
  const withC = summarizeResults([A, B, C]);
  assert.deepEqual(toCounts(withC), { all: 20, correct: 12, wrong: 5, skipped: 3 });
  assert.equal(withC.unavailableQuizzes, 1);
  assert.equal(withC.unavailableQuestions, 10);
  // the same numbers while the questions are still loading (summaries only) - totals must not jump
  const light = [A, B, C].map(r => ({ ...r, quizData: [] as any[], correct: r === A ? 3 : r === B ? 2 : 7, wrong: r === A ? 2 : r === B ? 1 : 2, skipped: 1 }));
  assert.deepEqual(toCounts(summarizeResults(light)), toCounts(withC));
});

test('difficulty scope: filtered counts, difficulty counts describe the whole scope, unavailable quizzes are left out', () => {
  const s = summarizeResults([A, B, C], 'easy');
  assert.deepEqual(toCounts(s), { all: 4, correct: 3, wrong: 0, skipped: 1 });
  assert.deepEqual([s.easy, s.medium, s.hard], [4, 5, 1]);
  assert.equal(s.unavailableQuizzes, 1);
  assert.deepEqual(toCounts(s), countStatuses(flattenAttempts([A, B, C], 'easy')));
});

test('immutability: nothing mutates the master, "all" returns the same array, a round trip loses nothing', () => {
  const master = deepFreeze([A, B].map(r => JSON.parse(JSON.stringify(r))));
  const items = Object.freeze(flattenAttempts(master));
  for (const f of ['correct', 'wrong', 'skipped', 'all', 'wrong', 'all'] as const) {
    const shown = pickByStatus(items, f);
    if (f === 'all') assert.equal(shown, items, 'all must be the master array itself');
    else assert.ok(shown.length < items.length && shown.every(i => i.status === f));
  }
  assert.equal(items.length, 10);
  const ordered = orderAttemptItems(items, 'original');
  assert.notEqual(ordered, items);
  assert.equal(orderAttemptItems(items, 'attempt').length, 10);
  assert.equal(items.length, 10);
});

test('book order sorts inside each attempt on a copy and keeps attempts together', () => {
  const r1 = R('x1', [Q(1, { originalIndex: 2 }), Q(2, { originalIndex: 0 }), Q(3, { originalIndex: 1 })], ['Beta', 'Beta', 'Beta']);
  const r2 = R('x22', [Q(4, { originalIndex: 1 }), Q(5, { originalIndex: 0 })], ['Beta', null]);
  const items = flattenAttempts([r1, r2]);
  const ordered = orderAttemptItems(items, 'original');
  assert.deepEqual(ordered.map(i => i.q.question), ['Question 2', 'Question 3', 'Question 1', 'Question 5', 'Question 4']);
  assert.deepEqual(items.map(i => i.q.question), ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5']);
});

test('useStatusFilter: counts depend on the master only; displayed follows the filter', () => {
  const items: readonly AttemptItem[] = flattenAttempts([A, B]);
  const probe = (filter: string) => {
    let out: any;
    const C0 = () => { out = useStatusFilter(items, { filter }); return null; };
    renderToStaticMarkup(createElement(C0));
    return out as ReturnType<typeof useStatusFilter<AttemptItem>>;
  };
  const all = probe('all'), wrong = probe('wrong'), skipped = probe('skipped'), junk = probe('bookmarked');
  for (const r of [all, wrong, skipped, junk]) assert.deepEqual(r.counts, { all: 10, correct: 5, wrong: 3, skipped: 2 });
  assert.equal(all.displayed, items);
  assert.equal(junk.displayed, items, 'an unknown extra filter reads as All');
  assert.equal(wrong.displayed.length, 3);
  assert.equal(skipped.displayed.length, 2);
  // saved totals win when some attempts have no question details
  let t: any;
  renderToStaticMarkup(createElement(() => { t = useStatusFilter(items, { filter: 'wrong', totals: { all: 20, correct: 12, wrong: 5, skipped: 3 } }); return null; }));
  assert.deepEqual(t.counts, { all: 20, correct: 12, wrong: 5, skipped: 3 });
  assert.equal(t.displayed.length, 3);
});

test('StatusFilterBar: All + four emoji pills, each with its count; the active one is selected; counts never depend on the selection', () => {
  const counts = { all: 138, correct: 80, wrong: 36, skipped: 22, bookmarked: 7 };
  const bar = (value: string, c = counts) => renderToStaticMarkup(createElement(StatusFilterBar, { value, onChange: () => undefined, counts: c }));
  for (const value of ['all', 'correct', 'wrong', 'skipped', 'bookmarked', 'none']) {
    const html = bar(value);
    assert.equal((html.match(/role="tab"/g) || []).length, 5);
    for (const [k, name, n] of [['all', 'All questions', 138], ['correct', 'Correct', 80], ['wrong', 'Mistakes', 36], ['skipped', 'Skipped', 22], ['bookmarked', 'Bookmarked', 7]] as const) {
      assert.match(html, new RegExp(`data-testid="status-pill-${k}"[^>]*data-count="${n}"`));
      assert.ok(html.includes(`aria-label="${name} (${n})"`));
    }
    assert.equal((html.match(/aria-selected="true"/g) || []).length, value === 'none' ? 0 : 1);
    // "All" is the only pill with a word; the other four are emoji only
    assert.equal((html.match(/>All</g) || []).length, 1);
    for (const e of ['\u2705', '\u274C', '\u23ED\uFE0F', '\uD83D\uDD16']) assert.ok(html.includes(e), `emoji ${e}`);
    assert.ok(!/Mistakes<|Correct<|Skipped<|Bookmarked</.test(html), 'no text labels on the emoji pills');
  }
  assert.match(bar('all'), /bg-indigo-600/);
  assert.match(bar('correct'), /bg-green-700/);
  assert.match(bar('wrong'), /bg-red-600/);
  assert.match(bar('skipped'), /bg-yellow-400/);
  assert.match(bar('bookmarked'), /bg-violet-600/);
  // big numbers stay short enough for one straight line, the exact number stays in the aria-label
  const big = bar('all', { all: 12400, correct: 9999, wrong: 2, skipped: 0, bookmarked: 0 });
  assert.ok(big.includes('>12.4k<') && big.includes('>9,999<') && big.includes('aria-label="All questions (12400)"'));
});

test('export parity: every download tile exports exactly the number its badge shows, built from the master only', () => {
  const master = deepFreeze([A, B].map(r => JSON.parse(JSON.stringify(r))));
  const counts = toCounts(summarizeResults(master));
  const base = { order: 'attempt' as const, difficulty: 'all' as const, rationale: { showBook: false, showAi: false }, rationaleCache: {}, scope: 'profile' as const };
  const n = (kind: ReportKind) => buildQuestionDoc(master, { ...base, kind }).items?.length;
  assert.equal(n('all'), counts.all);
  assert.equal(n('correct'), counts.correct);
  assert.equal(n('wrong'), counts.wrong);
  assert.equal(n('skipped'), counts.skipped);
  assert.equal(n('exam'), counts.all);
  // a difficulty pick narrows the PDF and matches the scoped summary
  const easy = buildQuestionDoc(master, { ...base, kind: 'all', difficulty: 'easy' }).items?.length;
  assert.equal(easy, summarizeResults(master, 'easy').all);
});
