import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_MODES, totalTimerSeconds } from '../src/utils/examModes';
import type { QuizSettings } from '../src/types/quiz';

const total = (over: Partial<QuizSettings>) => ({ timerMode: 'total', ...over }) as QuizSettings;

test('exam clock scales with the number of questions: 1 minute per question = questions x 60 s', () => {
  for (const n of [1, 17, 37, 100, 200]) assert.equal(totalTimerSeconds(total({ totalMinutesPerQuestion: 1 }), n), n * 60);
});

test('exam mode is one minute per question (locks and moves on), i.e. the whole exam can never run longer than questions x 60 s', () => {
  const exam = PRACTICE_MODES.find(m => m.id === 'exam')!.patch;
  assert.equal(exam.timerMode, 'per-question'); assert.equal(exam.timerValue, 60); assert.equal(exam.timerUnit, 'sec');
  assert.equal(exam.mode, 'submit', 'answers only at the end');
});

test('without a per-question rate the fixed total from the settings is used; per-question / off give no total clock', () => {
  assert.equal(totalTimerSeconds(total({ totalTimerValue: 45, totalTimerUnit: 'min' }), 10), 2700);
  assert.equal(totalTimerSeconds({ timerMode: 'per-question' } as QuizSettings, 10), 0);
  assert.equal(totalTimerSeconds({ timerMode: 'off' } as QuizSettings, 10), 0);
  assert.equal(totalTimerSeconds(total({ totalMinutesPerQuestion: 1 }), 0), 30 * 1, 'no questions: falls back to the fixed value');
});
