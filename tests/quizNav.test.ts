import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOpenIndex, prevOpenIndex, canEnterQuestion, tickSeconds } from '../src/utils/quizNav';

const none = [false, false, false, false, false];

test('nextOpenIndex: next question, skips expired ones, -1 at the end', () => {
  assert.equal(nextOpenIndex(0, none, 5), 1);
  assert.equal(nextOpenIndex(1, [false, false, true, true, false], 5), 4);
  assert.equal(nextOpenIndex(1, [false, false, true, true, true], 5), -1);
  assert.equal(nextOpenIndex(4, none, 5), -1);
});

test('prevOpenIndex: never lands on an expired question, respects mock-exam lock', () => {
  assert.equal(prevOpenIndex(3, [false, true, true, false, false]), 0);
  assert.equal(prevOpenIndex(2, [true, true, false]), -1);
  assert.equal(prevOpenIndex(0, none), -1);
  assert.equal(prevOpenIndex(3, none, false), -1);
});

test('canEnterQuestion: expired is locked both ways; mock exam blocks going back', () => {
  const exp = [false, true, false, false];
  assert.equal(canEnterQuestion(1, 2, exp, false), false);
  assert.equal(canEnterQuestion(1, 0, exp, false), false);
  assert.equal(canEnterQuestion(0, 2, exp, false), true);
  assert.equal(canEnterQuestion(0, 2, exp, true), false);
  assert.equal(canEnterQuestion(3, 2, exp, true), true);
  assert.equal(canEnterQuestion(2, 2, exp, true), true);
});

test('tickSeconds: wall-clock based, catches up after throttling, ignores clock going backwards', () => {
  assert.equal(tickSeconds(10_000, 9_000), 1);
  assert.equal(tickSeconds(9_995, 9_000), 0);
  assert.equal(tickSeconds(70_000, 10_000), 60);
  assert.equal(tickSeconds(5_000, 9_000), 0);
  assert.equal(tickSeconds(10_000_000, 0, 120), 120);
  assert.equal(tickSeconds(NaN, 0), 0);
});
