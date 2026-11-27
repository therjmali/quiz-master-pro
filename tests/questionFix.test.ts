import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit, fixAttempt, fixQuestionList, inferScoring, sameOptionSet, isEffectiveEdit, previewFix, questionKey, remapAnswer, rescoreResult, revertQuestion, validateEdit } from '../src/utils/questionFix';
import { calculateScore } from '../src/utils/scoring';
import { reviewStatus } from '../src/utils/reviewOptions';

const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o as object).forEach(deepFreeze); } return o; };
const Q = (n: number, correct: string, extra: any = {}): any => ({ question: `Question ${n}?`, options: ['Fowler', 'Knee chest', 'Supine', 'Side lying'], correctAnswer: correct, difficulty: 'medium', rationale: 'As per the book.', ...extra });

// the owner's case: the pasted key said "Knee chest", the right answer is "Side lying" and they answered Side lying
function attempt(over: any = {}): any {
  const quizData = [Q(1, 'Fowler'), Q(2, 'Knee chest'), Q(3, 'Supine'), Q(4, 'Side lying')];
  const userAnswers = ['Fowler', 'Side lying', null, 'Supine'];
  const s = calculateScore(quizData, userAnswers, 1, true, 0.25);
  return { id: 'r1', quizTitle: 'Nursing', timestamp: 1_700_000_000_000, quizData, userAnswers, totalQuestions: 4, ...s, score: s.netScore, timeTaken: 60, ...over };
}

test('validation: empty text, too few options, duplicates, answer not among the options', () => {
  const q = Q(1, 'Fowler');
  assert.deepEqual(validateEdit(q, { correctAnswer: 'Side lying' }), []);
  assert.match(validateEdit(q, { question: '   ' })[0], /empty/);
  assert.match(validateEdit(q, { options: ['Only one'] })[0], /at least 2/);
  assert.match(validateEdit(q, { options: ['a', 'A'] })[0], /same/);
  assert.match(validateEdit(q, { options: ['a', ''] })[0], /text/);
  assert.match(validateEdit(q, { correctAnswer: 'Not an option' })[0], /one of the options/);
  assert.match(validateEdit(q, { options: Array.from({ length: 9 }, (_, i) => `o${i}`) })[0], /At most/);
});

test('changing the key: the answer you gave becomes correct, the question moves from wrong to correct, the score follows', () => {
  const r = deepFreeze(attempt());
  assert.equal(r.correct, 1); assert.equal(r.wrong, 2); assert.equal(r.skipped, 1);
  const out = fixAttempt(r, questionKey('question 2?'), { edit: { correctAnswer: 'Side lying' } })!;
  assert.deepEqual(out.changedIndexes, [1]);
  assert.equal(reviewStatus(out.result.quizData[1], out.result.userAnswers[1]), 'correct');
  assert.equal(out.result.correct, 2); assert.equal(out.result.wrong, 1); assert.equal(out.result.skipped, 1);
  assert.equal(out.result.gain, 2); assert.equal(out.result.penalty, 0.25); assert.equal(out.result.netScore, 1.75);
  assert.equal(out.result.percentage, 44);
  assert.equal(out.result.accuracy, 67);
  assert.equal(out.before.netScore, 0.5); assert.equal(out.after.netScore, 1.75);
  assert.equal(out.result.quizData[1].fix?.original.correctAnswer, 'Knee chest');
  assert.equal(out.result.userAnswers[1], 'Side lying', 'the answers you gave are never rewritten by a key change');
  assert.deepEqual(r.userAnswers, ['Fowler', 'Side lying', null, 'Supine'], 'the input attempt was not touched (deep frozen)');
});

test('changing the key can also turn a correct answer into a wrong one (and re-applies the penalty)', () => {
  const out = fixAttempt(attempt(), questionKey('question 1?'), { edit: { correctAnswer: 'Supine' } })!;
  assert.equal(reviewStatus(out.result.quizData[0], out.result.userAnswers[0]), 'wrong');
  assert.equal(out.result.correct, 0); assert.equal(out.result.wrong, 3); assert.equal(out.result.penalty, 0.75);
  assert.equal(out.result.netScore, 0, 'never below zero');
});

test('editing an option keeps the answers given on it (they follow the new text), and the key follows too', () => {
  const r = attempt();
  const out = fixAttempt(r, questionKey('Question 2?'), { edit: { options: ['Fowler', 'Knee-chest position', 'Supine', 'Side lying'] } })!;
  assert.equal(out.result.quizData[1].correctAnswer, 'Knee-chest position', 'the old key follows its edited option');
  assert.equal(out.result.quizData[1].options[1], 'Knee-chest position');
  const r2 = fixAttempt(r, questionKey('Question 4?'), { edit: { options: ['Fowler', 'Knee chest', 'Supine', 'Left side-lying'] } })!;
  assert.equal(r2.result.quizData[3].correctAnswer, 'Left side-lying');
  const supine = attempt({ userAnswers: ['Fowler', 'Side lying', null, 'Supine'] });
  const r3 = fixAttempt(supine, questionKey('Question 4?'), { edit: { options: ['Fowler', 'Knee chest', 'Supine position', 'Side lying'] } })!;
  assert.equal(r3.result.userAnswers[3], 'Supine position', 'an answer given on an edited option follows it');
});

test('editing the text: other copies of the old text are the same question', () => {
  const out = fixAttempt(attempt(), questionKey('  QUESTION 3?  '), { edit: { question: 'Which position is best?' } })!;
  assert.equal(out.result.quizData[2].question, 'Which position is best?');
  assert.equal(out.result.quizData[2].fix?.original.question, 'Question 3?');
  assert.equal(out.result.correct, 1, 'a text edit alone does not move the score');
});

test('only one position, and no match = null', () => {
  const r = attempt({ quizData: [Q(1, 'Fowler'), Q(1, 'Fowler')], userAnswers: ['Fowler', 'Fowler'], totalQuestions: 2 });
  const one = fixAttempt(r, questionKey('Question 1?'), { edit: { correctAnswer: 'Supine' } }, { only: 1 })!;
  assert.deepEqual(one.changedIndexes, [1]);
  const both = fixAttempt(r, questionKey('Question 1?'), { edit: { correctAnswer: 'Supine' } })!;
  assert.deepEqual(both.changedIndexes, [0, 1]);
  assert.equal(fixAttempt(r, questionKey('No such question'), { edit: { correctAnswer: 'Supine' } }), null);
});

test('revert restores the original question and the original score', () => {
  const r = attempt();
  const fixed = fixAttempt(r, questionKey('Question 2?'), { edit: { correctAnswer: 'Side-lying', question: 'Question 2 (edited)?', options: ['Fowler', 'Knee chest', 'Supine', 'Side-lying'] } })!;
  const back = fixAttempt(fixed.result, questionKey('Question 2 (edited)?'), { revert: true })!;
  assert.equal(back.result.quizData[1].question, 'Question 2?');
  assert.equal(back.result.quizData[1].correctAnswer, 'Knee chest');
  assert.deepEqual(back.result.quizData[1].options, ['Fowler', 'Knee chest', 'Supine', 'Side lying']);
  assert.equal(back.result.quizData[1].fix, undefined);
  assert.equal(fixed.result.userAnswers[1], 'Side-lying', 'the answer followed the edited option');
  assert.equal(back.result.userAnswers[1], 'Side lying', 'and followed it back');
  assert.equal(back.result.netScore, r.netScore);
  assert.equal(back.result.correct, r.correct);
});

test('a second correction keeps the FIRST original, so revert always goes back to the pasted version', () => {
  const q = Q(1, 'Fowler');
  const a = applyEdit(q, { correctAnswer: 'Supine' }).question;
  const b = applyEdit(a, { correctAnswer: 'Side lying' }).question;
  assert.equal(b.fix?.original.correctAnswer, 'Fowler');
  assert.equal(revertQuestion(b).question.correctAnswer, 'Fowler');
});

test('scoring is inferred from older attempts and read from new ones', () => {
  assert.deepEqual(inferScoring(attempt()), { marksPerQuestion: 1, negativeMarking: true, negativeMarks: 0.25 });
  assert.deepEqual(inferScoring(attempt({ scoring: { marksPerQuestion: 4, negativeMarking: true, negativeMarks: 1 } })), { marksPerQuestion: 4, negativeMarking: true, negativeMarks: 1 });
  const noWrong = attempt({ userAnswers: ['Fowler', 'Knee chest', null, 'Side lying'] });
  const s = calculateScore(noWrong.quizData, noWrong.userAnswers, 2, true, 0.5);
  const old = { ...noWrong, ...s, maxScore: 8 };
  assert.deepEqual(inferScoring(old, { negativeMarking: true, negativeMarks: 0.5 }), { marksPerQuestion: 2, negativeMarking: true, negativeMarks: 0.5 }, 'no wrong answer: the penalty rate comes from your default rules');
  const noNeg = attempt({ penalty: 0, userAnswers: ['Fowler', 'Side lying', null, 'Supine'] });
  assert.equal(inferScoring(noNeg).negativeMarking, false, 'wrong answers without a penalty = negative marking was off');
});

test('marks per question other than 1 are respected when re-scoring', () => {
  const quizData = [Q(1, 'Fowler'), Q(2, 'Knee chest')];
  const userAnswers = ['Fowler', 'Side lying'];
  const s = calculateScore(quizData, userAnswers, 4, true, 1);
  const r: any = { id: 'x', timestamp: 1, quizData, userAnswers, totalQuestions: 2, ...s, score: s.netScore, scoring: { marksPerQuestion: 4, negativeMarking: true, negativeMarks: 1 } };
  const out = fixAttempt(r, questionKey('Question 2?'), { edit: { correctAnswer: 'Side lying' } })!;
  assert.equal(out.result.netScore, 8); assert.equal(out.result.maxScore, 8); assert.equal(out.result.percentage, 100);
});

test('preview shows the status and the score change before saving', () => {
  const r = attempt();
  const p = previewFix(r, 1, { correctAnswer: 'Side lying' });
  assert.equal(p.ok, true); assert.equal(p.statusBefore, 'wrong'); assert.equal(p.statusAfter, 'correct');
  assert.equal(p.before.netScore, 0.5); assert.equal(p.after.netScore, 1.75);
  assert.equal(previewFix(r, 1, { correctAnswer: 'Nope' }).ok, false);
  const same = previewFix(r, 1, { correctAnswer: 'Knee chest' });
  assert.equal(same.statusAfter, same.statusBefore);
  assert.equal(isEffectiveEdit(r.quizData[1], { correctAnswer: 'knee chest' }), false, 'same answer, different case = no change');
  assert.equal(isEffectiveEdit(r.quizData[1], { correctAnswer: 'Side lying' }), true);
});

test('library files, bookmarks and other lists: the same correction reaches every copy', () => {
  const list = deepFreeze([Q(1, 'Fowler'), Q(2, 'Knee chest'), Q(3, 'Supine')]);
  const { list: fixed, changed } = fixQuestionList(list, questionKey('question 2?'), { edit: { correctAnswer: 'Side lying' } });
  assert.equal(changed, 1);
  assert.equal(fixed![1].correctAnswer, 'Side lying');
  assert.equal(fixed![0], list[0], 'untouched questions are reused');
  assert.equal(fixQuestionList(undefined, 'x', { revert: true }).list, undefined);
});

test('remapAnswer and rescoreResult basics', () => {
  assert.equal(remapAnswer(null, new Map([['a', 'b']])), null);
  assert.equal(remapAnswer('a', new Map([['a', 'b']])), 'b');
  assert.equal(remapAnswer('zzz', new Map([['a', 'b']])), 'zzz');
  const r = attempt();
  assert.deepEqual(rescoreResult(r, { marksPerQuestion: 1, negativeMarking: true, negativeMarks: 0.25 }).netScore, r.netScore);
});

test('two different questions with the same text are never mixed up: only copies with the same options follow the fix', () => {
  const generic = (key: string, opts: string[]): any => ({ question: 'Which of the following is correct?', options: opts, correctAnswer: key, difficulty: 'medium' });
  const quizData = [generic('B', ['A', 'B', 'C', 'D']), generic('Yes', ['Yes', 'No', 'Maybe', 'Never']), generic('w', ['w', 'x', 'y', 'z'])];
  const userAnswers = ['A', 'Yes', 'x'];
  const s = calculateScore(quizData, userAnswers, 1, true, 0.25);
  const r: any = { id: 'g', timestamp: 5, quizData, userAnswers, totalQuestions: 3, ...s, score: s.netScore };
  const out = fixAttempt(r, questionKey('Which of the following is correct?'), { edit: { correctAnswer: 'A' } }, { matchOptions: ['A', 'B', 'C', 'D'] })!;
  assert.deepEqual(out.changedIndexes, [0], 'the other two have different options and are left alone (and nothing throws)');
  assert.equal(out.result.quizData[1].correctAnswer, 'Yes');
  assert.equal(sameOptionSet(['a', ' B ', 'c'], ['C', 'b', 'A']), true, 'order, case and spacing do not matter');
  assert.equal(sameOptionSet(['a', 'b'], ['a', 'b', 'c']), false);
  const { list, changed } = fixQuestionList(quizData, questionKey('Which of the following is correct?'), { edit: { correctAnswer: 'A' } }, ['A', 'B', 'C', 'D']);
  assert.equal(changed, 1); assert.equal(list![0].correctAnswer, 'A'); assert.equal(list![1], quizData[1]);
  // the targeted question itself still reports a bad edit
  assert.throws(() => fixAttempt(r, questionKey('Which of the following is correct?'), { edit: { correctAnswer: 'Nope' } }, { only: 0 }), /one of the options/);
});
