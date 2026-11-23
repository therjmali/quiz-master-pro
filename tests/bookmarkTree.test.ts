import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addBookmarkToTree, removeBookmarkNode, isQuestionBookmarked, getAllBookmarks, loadFileTree } from '../src/utils/fileTree';

const data = (n: number) => ({ question: `Bookmark question ${n}?`, options: ['a', 'b', 'c', 'd'], correctAnswer: 'a', userAnswer: null, quizTitle: 'Quiz One', subject: 'OBG', bookmarkedAt: 1 });
beforeEach(() => { localStorage.clear(); });

// Regression: the quiz screen showed "Bookmarked!" but the header icon stayed outline, because the tree was changed in
// place and the SAME object came back, so React saw no new state and never re-rendered.
test('addBookmarkToTree returns a NEW tree and leaves the old one untouched', () => {
  const root = loadFileTree();
  const before = JSON.stringify(root);
  const next = addBookmarkToTree(root, data(1));
  assert.notEqual(next, root, 'a new reference, so React re-renders');
  assert.equal(JSON.stringify(root), before, 'the input tree was not mutated');
  assert.equal(isQuestionBookmarked(root, data(1).question), false);
  assert.equal(isQuestionBookmarked(next, data(1).question), true);
});

test('adding the same question again keeps the same tree (no duplicate)', () => {
  const t1 = addBookmarkToTree(loadFileTree(), data(1));
  const t2 = addBookmarkToTree(t1, data(1));
  assert.equal(t2, t1);
  assert.equal(getAllBookmarks(t2).length, 1);
});

test('removeBookmarkNode returns a NEW tree too (the icon must turn off again)', () => {
  const t1 = addBookmarkToTree(addBookmarkToTree(loadFileTree(), data(1)), data(2));
  const target = getAllBookmarks(t1).find(b => b.bookmarkData?.question === data(1).question)!;
  const snapshot = JSON.stringify(t1);
  const t2 = removeBookmarkNode(t1, target.id);
  assert.notEqual(t2, t1);
  assert.equal(JSON.stringify(t1), snapshot, 'the input tree was not mutated');
  assert.equal(isQuestionBookmarked(t2, data(1).question), false);
  assert.equal(isQuestionBookmarked(t2, data(2).question), true);
});

test('the bookmark survives a reload (saved by the call itself)', () => {
  addBookmarkToTree(loadFileTree(), data(7));
  assert.equal(isQuestionBookmarked(loadFileTree(), data(7).question), true);
});
