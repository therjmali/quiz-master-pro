import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTheme, skinIdForTheme, loadTheme, persistTheme, DEFAULT_THEME } from '../src/utils/theme';
import { isAiOn, resolveSelected, savedKeyChoices, withAiOn } from '../src/utils/aiChoices';

test('theme: exactly two modes; legacy stored values are mapped', () => {
  assert.equal(normalizeTheme('light'), 'light'); assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('amoled'), 'dark', 'old Ink -> Dark');
  assert.equal(normalizeTheme('ancient'), 'light', 'old Papyrus -> Light');
  assert.equal(normalizeTheme('garbage'), DEFAULT_THEME); assert.equal(normalizeTheme(null), DEFAULT_THEME);
  localStorage.setItem('qmp_glass_tone', 'dark'); assert.equal(normalizeTheme('glass'), 'dark');
  localStorage.setItem('qmp_glass_tone', 'light'); assert.equal(normalizeTheme('glass'), 'light');
  localStorage.removeItem('qmp_glass_tone');
  assert.equal(skinIdForTheme('dark'), 'night-owl'); assert.equal(skinIdForTheme('light'), 'exam-hall');
  localStorage.setItem('qmp_theme', 'amoled'); assert.equal(loadTheme(), 'dark');
  persistTheme('dark'); assert.equal(localStorage.getItem('qmp_theme'), 'dark'); assert.equal(localStorage.getItem('qmp_quiz_skin'), 'night-owl');
});

test('AI generation: only saved, enabled keys are offered; one switch drives quiz + rationale AI', () => {
  assert.deepEqual(savedKeyChoices({}), []);
  assert.deepEqual(savedKeyChoices({ gemini: '  ', openai: '' }), [], 'blank keys are not saved keys');
  const keys = { gemini: 'AIzaX', openai: 'sk-1', anthropic: 'sk-ant', cohere: 'c', openaiEnabled: false };
  assert.deepEqual(savedKeyChoices(keys).map(c => c.label), ['🔑 Gemini', '🔑 Anthropic', '🔑 Cohere'], 'switched-off keys are hidden');
  const choices = savedKeyChoices(keys);
  assert.equal(resolveSelected(choices, 'anthropic'), 'anthropic');
  assert.equal(resolveSelected(choices, 'openai'), 'gemini', 'a stale preference falls back to the first key');
  assert.equal(resolveSelected([], 'gemini'), null);
  const off = withAiOn({ quizHelper: 'local', reportHelper: 'local' }, false);
  assert.deepEqual(off, { quizHelper: 'off', reportHelper: 'off' }); assert.equal(isAiOn(off), false);
  const on = withAiOn(off, true);
  assert.deepEqual(on, { quizHelper: 'cloud', reportHelper: 'cloud' }); assert.equal(isAiOn(on), true);
});
