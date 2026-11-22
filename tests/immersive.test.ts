import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getStatusBarMode, setStatusBarMode, shouldHideStatusBar, IMMERSIVE_KEY, STATUS_BAR_MODE_KEY } from '../src/platform/immersive';

beforeEach(() => { localStorage.clear(); });

test('status bar: default is hidden everywhere', () => {
  assert.equal(getStatusBarMode(), 'always');
});

test('status bar: the old v3.12 switch migrates (off stays off, anything else becomes the new default)', () => {
  localStorage.setItem(IMMERSIVE_KEY, 'off');
  assert.equal(getStatusBarMode(), 'off');
  localStorage.setItem(IMMERSIVE_KEY, 'on');
  assert.equal(getStatusBarMode(), 'always');
});

test('status bar: the new mode wins over the old switch and is stored', () => {
  localStorage.setItem(IMMERSIVE_KEY, 'off');
  setStatusBarMode('quiz');
  assert.equal(localStorage.getItem(STATUS_BAR_MODE_KEY), 'quiz');
  assert.equal(getStatusBarMode(), 'quiz');
  setStatusBarMode('off');
  assert.equal(getStatusBarMode(), 'off');
  assert.equal(localStorage.getItem(IMMERSIVE_KEY), 'off', 'old readers see "off"');
});

test('status bar: which screens hide it', () => {
  for (const inQuiz of [true, false]) assert.equal(shouldHideStatusBar('always', inQuiz), true);
  assert.equal(shouldHideStatusBar('quiz', true), true);
  assert.equal(shouldHideStatusBar('quiz', false), false);
  for (const inQuiz of [true, false]) assert.equal(shouldHideStatusBar('off', inQuiz), false);
});
