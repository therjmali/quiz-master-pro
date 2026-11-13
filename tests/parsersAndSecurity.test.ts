import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSVText, autoMapColumns, validateAndConvert } from '../src/utils/csvParser';
import { parseMcqText, toMcqText, MCQ_SAMPLE } from '../src/utils/quizParser';
import { calculateScore, calculateStreak, derivePercentage, healResult } from '../src/utils/scoring';
import { generateOfflineNotes, noteEntriesToHtml } from '../src/utils/offlineNotes';
import { getExamDates, DEFAULT_EXAMS } from '../src/utils/examDates';

test('RFC-4180 CSV parser handles escaped quotes, multiline quoted cells, CRLF, and UTF-8 BOM', () => {
  const csv = '\uFEFFQuestion,Option A,Option B,Option C,Option D,Answer,Explanation\r\n'
    + '"What does ""ATP"" stand for,\r\nand where is it made?","Adenosine ""tri"" phosphate",ADP,AMP,GTP,A,"Line 1\r\nLine 2, with comma"\r\n'
    + 'Simple question?,Yes,No,Maybe,Never,Yes,Plain explanation\r\n';
  const parsed = parseCSVText(csv);
  assert.equal(parsed.totalRows, 2);
  assert.deepEqual(parsed.headers, ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer', 'Explanation']);
  assert.equal(parsed.rows[0][0], 'What does "ATP" stand for,\r\nand where is it made?');
  assert.equal(parsed.rows[0][1], 'Adenosine "tri" phosphate');
  assert.equal(parsed.rows[0][6], 'Line 1\r\nLine 2, with comma');

  const mapping = autoMapColumns(parsed.headers) as Required<ReturnType<typeof autoMapColumns>>;
  const { questions, errors } = validateAndConvert(parsed.rows, mapping);
  assert.equal(errors.length, 0);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].correctAnswer, 'Adenosine "tri" phosphate');
});

test('MCQ parser round-trips canonical MCQ format and flags duplicates', () => {
  const first = parseMcqText(MCQ_SAMPLE);
  assert.equal(first.issues.length, 0);
  assert.equal(first.questions.length, 1);
  const serialized = toMcqText(first.questions);
  const second = parseMcqText(serialized);
  assert.equal(second.issues.length, 0);
  assert.equal(second.questions[0].correctAnswer, 'Mitochondria');

  const dup = parseMcqText(`${MCQ_SAMPLE}\n\n${MCQ_SAMPLE.replace('Q1(E).', 'Q2(E).')}`);
  assert.equal(dup.duplicates.length, 1);
});

test('scoring calculates negative marking, clamps at zero, and self-heals stale percentages', () => {
  const qs = [
    { question: 'Q1', options: ['A', 'B'], correctAnswer: 'A', difficulty: 'easy' as const },
    { question: 'Q2', options: ['A', 'B'], correctAnswer: 'B', difficulty: 'medium' as const },
    { question: 'Q3', options: ['A', 'B'], correctAnswer: 'A', difficulty: 'hard' as const },
    { question: 'Q4', options: ['A', 'B'], correctAnswer: 'B', difficulty: 'easy' as const },
  ];
  const score = calculateScore(qs, ['A', 'A', 'B', null], 4, true, 1);
  assert.equal(score.correct, 1);
  assert.equal(score.wrong, 2);
  assert.equal(score.skipped, 1);
  assert.equal(score.gain, 4);
  assert.equal(score.penalty, 2);
  assert.equal(score.netScore, 2);
  assert.equal(score.maxScore, 16);
  assert.equal(score.percentage, 13);
  assert.equal(score.accuracy, 33);

  const clamped = calculateScore(qs, ['B', 'A', 'B', 'A'], 1, true, 0.5);
  assert.equal(clamped.netScore, 0, 'netScore never drops below zero');
  assert.equal(derivePercentage(3, 4, true), 75);

  const healed = healResult({ score: 8, netScore: 8, maxScore: 10, percentage: 99 } as any);
  assert.equal(healed.percentage, 80);

  const now = Date.now();
  assert.equal(calculateStreak([now, now - 86_400_000, now - 2 * 86_400_000]), 3);
});

test('offlineNotes escapes HTML entities safely and highlights answers containing <, >, &, and $&', () => {
  const entries = generateOfflineNotes([
    {
      question: 'Which expression is unsafe?',
      options: ['<img src=x onerror=alert(1)> & "$&"', 'Safe'],
      correctAnswer: '<img src=x onerror=alert(1)> & "$&"',
      difficulty: 'medium',
      rationale: 'Always escape <img src=x onerror=alert(1)> & "$&" before highlighting.',
    },
  ]);
  const html = noteEntriesToHtml(entries, 'XSS "<script>alert(1)</script>" Test', true, 'Security & <HTML>');
  assert.equal(html.includes('<script>'), false, 'title script tag must be escaped');
  assert.equal(html.includes('<img src=x'), false, 'raw img tag must never appear in output HTML');
  assert.ok(html.includes('<span class="answer-word">&lt;img src=x onerror=alert(1)&gt; &amp; &quot;$&amp;&quot;</span>'), 'escaped answer is highlighted cleanly without $& corruption');
});

test('fresh devices start with zero hardcoded mock exams', () => {
  localStorage.clear();
  assert.equal(DEFAULT_EXAMS.length, 0);
  assert.deepEqual(getExamDates(), []);
});
