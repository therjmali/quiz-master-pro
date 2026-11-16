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
  localStorage.removeItem('qmp_theme');
  assert.equal(loadTheme(), 'light', 'nothing saved and no dark preference: Light');
  (globalThis as any).window = Object.assign((globalThis as any).window ?? {}, { matchMedia: () => ({ matches: true }) });
  assert.equal(loadTheme(), 'dark', 'a new install follows the phone when it is set to dark');
  localStorage.setItem('qmp_theme', 'light'); assert.equal(loadTheme(), 'light', 'a saved choice always wins');
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

test('AI provider choice: "use only this key" has no silent fallback; the default still falls back', async () => {
  const { saveAiClientPrefs, availableProviders, getAiClientPrefs } = await import('../src/platform/ai/providers');
  localStorage.setItem('qmp_user_api_keys', JSON.stringify({ gemini: 'AIzaKey1234567890', openai: 'sk-test-1234567890' }));
  saveAiClientPrefs({ preferred: 'openai', models: {} });
  assert.deepEqual(availableProviders().map(p => p.provider), ['openai', 'gemini'], 'preferred first, the other key is the fallback');
  saveAiClientPrefs({ preferred: 'openai', only: true, models: {} });
  assert.equal(getAiClientPrefs().only, true);
  assert.deepEqual(availableProviders().map(p => p.provider), ['openai'], 'only: just the chosen key');
  saveAiClientPrefs({ preferred: 'cohere', only: true, models: {} });
  assert.deepEqual(availableProviders().map(p => p.provider), ['gemini', 'openai'].sort((a, b) => 0), 'the chosen key was removed: nothing is stuck, every saved key is offered again');
  saveAiClientPrefs({ preferred: null, only: true, models: {} });
  assert.ok(availableProviders().length === 2, 'Auto: all saved keys');
});
