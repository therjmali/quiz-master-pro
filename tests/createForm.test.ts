import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CREATED_QUIZ_KEY, INPUT_KEY, markCreatedQuiz, resetCreateFormIfOwnQuiz } from '../src/utils/createForm';

beforeEach(() => { localStorage.clear(); });
const qs = (tag: string) => Array.from({ length: 4 }, (_, i) => ({ question: `${tag} ${i}` }));

test('finishing the quiz that came from the Create form empties the form text and forgets the link', () => {
  localStorage.setItem(INPUT_KEY, 'Q1. pasted text...');
  markCreatedQuiz(qs('A'));
  assert.equal(resetCreateFormIfOwnQuiz([...qs('A')].reverse()), true, 'same quiz, any order');
  assert.equal(localStorage.getItem(INPUT_KEY), null);
  assert.equal(localStorage.getItem(CREATED_QUIZ_KEY), null);
});

test('finishing a different quiz (practice from results, something started elsewhere) never wipes text typed for another quiz', () => {
  localStorage.setItem(INPUT_KEY, 'half-written next quiz');
  markCreatedQuiz(qs('A'));
  assert.equal(resetCreateFormIfOwnQuiz(qs('B')), false);
  assert.equal(localStorage.getItem(INPUT_KEY), 'half-written next quiz');
  assert.equal(resetCreateFormIfOwnQuiz([]), false);
});

test('nothing marked: nothing cleared', () => {
  localStorage.setItem(INPUT_KEY, 'text');
  assert.equal(resetCreateFormIfOwnQuiz(qs('A')), false);
  assert.equal(localStorage.getItem(INPUT_KEY), 'text');
});
