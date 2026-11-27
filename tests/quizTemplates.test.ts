import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TEMPLATES, TEMPLATE_STORE_KEY, applyTemplateToSettings, deleteTemplate, describeRules, duplicateTemplate, getDefaultTemplate, getTemplates, isTemplateActive, loadTemplateStore, moveTemplate, resetTemplateCache, restoreFactoryTemplates, rulesToPatch, sanitizeRules, saveTemplate, setDefaultTemplate, templateDescription, totalSecondsFor } from '../src/utils/quizTemplates';
import { PRACTICE_MODES, totalTimerSeconds } from '../src/utils/examModes';
import type { QuizSettings } from '../src/types/quiz';

const BASE: QuizSettings = { difficulty: 'all', mode: 'submit', timerMode: 'off', timerEnabled: false, timerValue: 30, timerUnit: 'sec', totalTimerValue: 30, totalTimerUnit: 'min', instantFeedbackDelay: 3, marksPerQuestion: 1, negativeMarking: false, negativeMarks: 0.25, shuffleQuestions: false, shuffleOptions: true, quizTitle: 'Keep me', passMark: 70, subject: 'FON' };
beforeEach(() => { localStorage.clear(); resetTemplateCache(); });

test('three built-in templates, Default first and the default', () => {
  const t = getTemplates();
  assert.deepEqual(t.map(x => x.id), ['default', 'practice', 'exam']);
  assert.equal(getDefaultTemplate().id, 'default');
  assert.deepEqual(t.map(x => x.name), ['Default', 'Practice', 'Exam']);
});

test('Default: paste 50 questions and Start = 50 min total clock, classic submit at end, +1 / -0.25, pass 50%', () => {
  const s = applyTemplateToSettings(BASE, getDefaultTemplate());
  assert.equal(s.mode, 'submit');
  assert.equal(s.timerMode, 'total');
  assert.equal(s.totalMinutesPerQuestion, 1);
  assert.equal(totalTimerSeconds(s, 50), 50 * 60, 'the quiz engine turns it into 50 minutes for 50 questions');
  assert.equal(totalTimerSeconds(s, 7), 7 * 60);
  assert.equal(s.marksPerQuestion, 1); assert.equal(s.negativeMarking, true); assert.equal(s.negativeMarks, 0.25); assert.equal(s.passMark, 50);
  assert.equal(s.templateId, 'default');
  assert.equal(s.quizTitle, 'Keep me', 'title and subject are never touched');
  assert.equal(s.subject, 'FON');
  assert.equal(totalSecondsFor(getDefaultTemplate().rules, 50), 3000);
});

test('Practice and Exam set exactly what the old two modes set', () => {
  for (const old of PRACTICE_MODES) {
    const tpl = getTemplates().find(t => t.id === old.id)!;
    const patch = rulesToPatch(tpl.rules, tpl.builtIn);
    for (const k of Object.keys(old.patch) as (keyof QuizSettings)[]) {
      assert.equal(patch[k], old.patch[k], `${old.id}.${String(k)}`);
    }
  }
  assert.deepEqual(getTemplates()[1].rules.rationale, { showBook: true, showAi: true });
});

test('a template is active until a rule is changed by hand', () => {
  const tpl = getDefaultTemplate();
  const s = applyTemplateToSettings(BASE, tpl);
  assert.equal(isTemplateActive(tpl, s), true);
  assert.equal(isTemplateActive(tpl, { ...s, passMark: 60 }), false);
  assert.equal(isTemplateActive(tpl, { ...s, templateId: 'practice' }), false);
  const prac = getTemplates()[1];
  assert.equal(isTemplateActive(prac, applyTemplateToSettings(BASE, prac), { showBook: true, showAi: true }), true);
  assert.equal(isTemplateActive(prac, applyTemplateToSettings(BASE, prac), { showBook: true, showAi: false }), false, 'rationale choice counts too');
});

test('rules are clamped so a template can never break a quiz', () => {
  const r = sanitizeRules({ perQuestionSeconds: -4, totalMinutes: 99999, minutesPerQuestion: 0, marksPerQuestion: 0, negativeMarks: -1, passMark: 500, style: 'weird' as any, timer: 'nope' as any });
  assert.equal(r.perQuestionSeconds, 5); assert.equal(r.totalMinutes, 600); assert.equal(r.minutesPerQuestion, 0.25);
  assert.equal(r.marksPerQuestion, 0.25); assert.equal(r.negativeMarks, 0); assert.equal(r.passMark, 100);
  assert.equal(r.style, 'submit'); assert.equal(r.timer, 'off');
  assert.equal(sanitizeRules({ negativeMarks: Number.NaN }).negativeMarks, 0.25);
});

test('create, edit, duplicate, reorder, set default', () => {
  const t = saveTemplate({ emoji: '⚡', name: ' Speed round ', rules: { timer: 'question', perQuestionSeconds: 30, negativeMarking: false } });
  assert.equal(t.name, 'Speed round');
  assert.equal(getTemplates().length, 4);
  const edited = saveTemplate({ id: t.id, emoji: '⚡', name: 'Speed', rules: { ...t.rules, perQuestionSeconds: 20 } });
  assert.equal(edited.rules.perQuestionSeconds, 20);
  assert.equal(getTemplates().length, 4);
  const copy = duplicateTemplate(t.id)!;
  assert.equal(copy.name, 'Speed copy');
  assert.equal(getTemplates().findIndex(x => x.id === copy.id), getTemplates().findIndex(x => x.id === t.id) + 1);
  setDefaultTemplate(t.id);
  assert.equal(getDefaultTemplate().id, t.id);
  const order0 = getTemplates().map(x => x.id);
  moveTemplate(t.id, -1);
  const i = order0.indexOf(t.id);
  const expected = [...order0]; [expected[i - 1], expected[i]] = [expected[i], expected[i - 1]];
  assert.deepEqual(getTemplates().map(x => x.id), expected, 'one step up');
  moveTemplate(t.id, 1);
  assert.deepEqual(getTemplates().map(x => x.id), order0, 'and one step down');
  const before = getTemplates().map(x => x.id);
  moveTemplate(before[0], -1);
  assert.deepEqual(getTemplates().map(x => x.id), before, 'moving the first one up does nothing');
});

test('every template can be edited, including the built-ins (and edits survive a reload)', () => {
  saveTemplate({ id: 'default', emoji: '🧭', name: 'My default', rules: { ...getDefaultTemplate().rules, passMark: 40, negativeMarks: 0.5 } });
  resetTemplateCache();
  assert.equal(getDefaultTemplate().name, 'My default');
  assert.equal(getDefaultTemplate().rules.passMark, 40);
  assert.equal(applyTemplateToSettings(BASE, getDefaultTemplate()).negativeMarks, 0.5);
});

test('delete: any template, but never the last; deleting the default moves the default', () => {
  assert.equal(deleteTemplate('default'), true);
  assert.deepEqual(getTemplates().map(t => t.id), ['practice', 'exam']);
  assert.equal(getDefaultTemplate().id, 'practice', 'the first remaining template becomes the default');
  assert.equal(deleteTemplate('exam'), true);
  assert.equal(deleteTemplate('practice'), false, 'the last one stays');
  assert.equal(getTemplates().length, 1);
  assert.equal(deleteTemplate('nope'), false);
});

test('restore factory templates brings the three back and keeps your own', () => {
  const mine = saveTemplate({ emoji: '🧪', name: 'Mine', rules: {} });
  saveTemplate({ id: 'exam', emoji: '🏥', name: 'Changed', rules: { passMark: 10 } });
  deleteTemplate('practice');
  restoreFactoryTemplates();
  const t = getTemplates();
  assert.deepEqual(t.map(x => x.id), ['default', 'practice', 'exam', mine.id]);
  assert.equal(t[2].name, 'Exam'); assert.equal(t[2].rules.passMark, 50);
  assert.equal(getDefaultTemplate().id, 'default');
});

test('the number of templates is limited', () => {
  for (let i = getTemplates().length; i < MAX_TEMPLATES; i++) saveTemplate({ emoji: '📝', name: `T${i}`, rules: {} });
  assert.equal(getTemplates().length, MAX_TEMPLATES);
  assert.throws(() => saveTemplate({ emoji: '📝', name: 'one too many', rules: {} }), /up to/);
  assert.equal(duplicateTemplate('default'), null);
});

test('descriptions are worked out from the rules unless you wrote one', () => {
  assert.equal(describeRules(getDefaultTemplate().rules), '1 min per Q (total) · Submit at end · +1 / −0.25 · Pass 50%');
  assert.equal(templateDescription(getTemplates()[1]), 'Instant feedback · both rationales');
  assert.equal(describeRules({ ...getDefaultTemplate().rules, timer: 'total', totalMinutes: 90, negativeMarking: false }), '90 min total · Submit at end · +1 · Pass 50%');
  assert.equal(describeRules({ ...getDefaultTemplate().rules, timer: 'question', perQuestionSeconds: 90 }).startsWith('90s per Q'), true);
});

test('a cloud sync that rewrites the stored templates is picked up by the next read', () => {
  assert.equal(getDefaultTemplate().id, 'default');
  const store = JSON.parse(localStorage.getItem(TEMPLATE_STORE_KEY)!);
  store.defaultId = 'exam';
  store.items[1].name = 'Synced practice';
  localStorage.setItem(TEMPLATE_STORE_KEY, JSON.stringify(store));
  assert.equal(getDefaultTemplate().id, 'exam');
  assert.equal(getTemplates()[1].name, 'Synced practice');
});

test('damaged storage falls back to the three built-ins; older user templates are carried over once', () => {
  localStorage.setItem(TEMPLATE_STORE_KEY, '{not json');
  resetTemplateCache();
  assert.equal(getTemplates().length, 3);
  localStorage.clear(); resetTemplateCache();
  localStorage.setItem('qmp_user_templates', JSON.stringify([{ id: 'old1', emoji: '📚', label: 'Old speed', desc: 'x', patch: { mode: 'live', timerMode: 'per-question', timerValue: 45, timerUnit: 'sec', marksPerQuestion: 2, negativeMarking: true, negativeMarks: 0.5, passMark: 60 } }]));
  const t = getTemplates();
  assert.equal(t.length, 4);
  assert.equal(t[3].name, 'Old speed'); assert.equal(t[3].rules.style, 'live'); assert.equal(t[3].rules.timer, 'question'); assert.equal(t[3].rules.perQuestionSeconds, 45);
  assert.equal(t[3].rules.marksPerQuestion, 2); assert.equal(t[3].rules.passMark, 60);
  localStorage.setItem(TEMPLATE_STORE_KEY, JSON.stringify({ v: 2, defaultId: 'ghost', items: [] }));
  resetTemplateCache();
  assert.equal(loadTemplateStore().items.length >= 1, true);
  assert.equal(getDefaultTemplate() !== undefined, true, 'an unknown default id is repaired');
});
