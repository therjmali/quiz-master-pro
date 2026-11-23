import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SWITCH_FILTERS, activeSwitchFilters, filterSwitchList, subjectCounts, type SwitchFilters } from '../src/utils/quizSwitcher';

const NOW = new Date(2026, 10, 22, 12, 0, 0).getTime(); // 22 Nov 2026 12:00 local
const DAY = 86_400_000;
const R = (id: string, title: string, subject: string | undefined, daysAgo: number, net: number): any => ({ id, quizTitle: title, subject, timestamp: NOW - daysAgo * DAY, netScore: net, maxScore: 10, quizData: [], userAnswers: [], totalQuestions: 10, correct: net, wrong: 0, skipped: 0, percentage: net * 10, timeTaken: 1 });
const LIST = Object.freeze([
  R('1', 'Breast & menstruation OBG', 'OBG', 0, 6),
  R('2', 'Pharmacology set A', 'Pharma', 1, 9),
  R('3', 'Pharmacology set B', 'Pharma', 8, 4),
  R('4', 'Fundamentals of nursing', 'FON', 40, 7),
  R('5', 'Untitled mix', undefined, 3, 5),
]);
const F = (p: Partial<SwitchFilters>): SwitchFilters => ({ ...DEFAULT_SWITCH_FILTERS, ...p });
const ids = (f: Partial<SwitchFilters>) => filterSwitchList(LIST, F(f), NOW).map(r => r.id);

test('default: everything, newest first, the history list itself is not touched', () => {
  assert.deepEqual(ids({}), ['1', '2', '5', '3', '4']);
  assert.deepEqual(LIST.map(r => r.id), ['1', '2', '3', '4', '5'], 'frozen input, same order');
});

test('quiz name / subject search is case-insensitive', () => {
  assert.deepEqual(ids({ query: 'pharma' }), ['2', '3']);
  assert.deepEqual(ids({ query: '  OBG ' }), ['1']);
  assert.deepEqual(ids({ query: 'zzz' }), []);
});

test('several subjects at once; a quiz without subject counts as General', () => {
  assert.deepEqual(ids({ subjects: ['OBG', 'FON'] }), ['1', '4']);
  assert.deepEqual(ids({ subjects: ['General'] }), ['5']);
  assert.deepEqual(subjectCounts(LIST).map(s => `${s.subject}:${s.count}`), ['Pharma:2', 'FON:1', 'General:1', 'OBG:1']);
});

test('date presets and a custom range (inclusive, local days)', () => {
  assert.deepEqual(ids({ preset: 'today' }), ['1']);
  assert.deepEqual(ids({ preset: '7d' }), ['1', '2', '5']);
  assert.deepEqual(ids({ preset: '30d' }), ['1', '2', '5', '3']);
  assert.deepEqual(ids({ preset: 'custom', from: '2026-11-14', to: '2026-11-19' }), ['5', '3'], '3 days ago is 19 Nov (the end day counts), 8 days ago is 14 Nov (the start day counts)');
  assert.deepEqual(ids({ preset: 'custom', from: '2026-11-14', to: '2026-11-18' }), ['3'], 'the 19th is out when the range ends on the 18th');
  assert.deepEqual(ids({ preset: 'custom', from: '2026-11-21' }), ['1', '2']);
  assert.deepEqual(ids({ preset: 'custom', to: '2026-11-14' }), ['3', '4']);
  assert.deepEqual(ids({ preset: 'custom' }), ['1', '2', '5', '3', '4'], 'an empty range filters nothing');
});

test('filters combine (AND) and sorting works', () => {
  assert.deepEqual(ids({ query: 'pharma', preset: '7d' }), ['2']);
  assert.deepEqual(ids({ subjects: ['Pharma'], sort: 'score' }), ['2', '3']);
  assert.deepEqual(ids({ sort: 'old' }), ['4', '3', '5', '2', '1']);
  assert.deepEqual(ids({ sort: 'score' }), ['2', '4', '1', '5', '3']);
});

test('active filter count', () => {
  assert.equal(activeSwitchFilters(DEFAULT_SWITCH_FILTERS), 0);
  assert.equal(activeSwitchFilters(F({ query: 'x', subjects: ['OBG'], preset: '7d' })), 3);
  assert.equal(activeSwitchFilters(F({ sort: 'old' })), 0, 'sort is not a filter');
});
