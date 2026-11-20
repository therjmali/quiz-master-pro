import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCorrectOption, optionVisuals, reviewStatus } from '../src/utils/reviewOptions';

const opts = ['Alpha drug', 'Beta blocker', 'Gamma globulin', 'Delta agent'];
const q = { correctAnswer: 'Beta blocker' };

test('review status: correct, wrong and skipped (null / undefined)', () => {
  assert.equal(reviewStatus(q, 'Beta blocker'), 'correct');
  assert.equal(reviewStatus(q, 'Alpha drug'), 'wrong');
  assert.equal(reviewStatus(q, null), 'skipped');
  assert.equal(reviewStatus(q, undefined), 'skipped');
});

test('scenario A (correct): only the picked option is green, everything else neutral', () => {
  assert.deepEqual(optionVisuals(q, opts, 'Beta blocker'), ['neutral', 'correct', 'neutral', 'neutral']);
});

test('scenario B (wrong): the pick is red, the right option is green, the rest neutral', () => {
  assert.deepEqual(optionVisuals(q, opts, 'Delta agent'), ['neutral', 'correct', 'neutral', 'wrong']);
});

test('scenario C (skipped): only the right option is green, nothing is ever red', () => {
  const v = optionVisuals(q, opts, null);
  assert.deepEqual(v, ['neutral', 'correct', 'neutral', 'neutral']);
  assert.ok(!v.includes('wrong'));
});

test('multi-answer questions: every right option is green; a wrong pick is the only red one', () => {
  const m = { correctAnswer: 'Beta blocker', correctAnswers: ['Beta blocker', 'Gamma globulin'] };
  assert.deepEqual(optionVisuals(m, opts, 'Delta agent'), ['neutral', 'correct', 'correct', 'wrong']);
  assert.equal(reviewStatus(m, 'Gamma globulin'), 'correct');
  assert.deepEqual(optionVisuals(m, opts, 'Gamma globulin'), ['neutral', 'correct', 'correct', 'neutral']);
});

test('a wrong pick whose text appears twice marks only the first copy', () => {
  const dup = ['Same', 'Beta blocker', 'Same', 'Delta agent'];
  assert.deepEqual(optionVisuals(q, dup, 'Same'), ['wrong', 'correct', 'neutral', 'neutral']);
});

test('comparison ignores stray whitespace', () => {
  assert.equal(isCorrectOption(q, '  Beta blocker '), true);
  assert.equal(reviewStatus(q, 'Beta blocker '), 'correct');
});

test('a pick that is not among the options never produces a red row and never throws', () => {
  assert.deepEqual(optionVisuals(q, opts, 'Something removed by an edit'), ['neutral', 'correct', 'neutral', 'neutral']);
});
