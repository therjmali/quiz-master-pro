import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSegments, MAX_SEGMENTS } from '../src/components/quiz/SegmentedProgress';

test('one block per question: attempted = done, the rest = none, exactly one current block', () => {
  const segs = buildSegments([true, false, true, false, false], 2);
  assert.equal(segs.length, 5);
  assert.deepEqual(segs.map(s => s.state), ['done', 'none', 'done', 'none', 'none']);
  assert.deepEqual(segs.map(s => s.current), [false, false, true, false, false]);
});

test('a single question and an empty quiz', () => {
  assert.deepEqual(buildSegments([false], 0).map(s => s.state), ['none']);
  assert.equal(buildSegments([], 0).length, 0);
  assert.equal(buildSegments([true], 0)[0].state, 'done');
});

test('exactly MAX_SEGMENTS questions still get one block each', () => {
  const a = Array.from({ length: MAX_SEGMENTS }, (_, i) => i % 2 === 0);
  assert.equal(buildSegments(a, 0).length, MAX_SEGMENTS);
});

test('long quizzes (200 questions) are grouped so blocks stay readable; partial groups fill proportionally; current stays inside one group', () => {
  const answered = Array.from({ length: 200 }, (_, i) => i < 100); // first half done
  const segs = buildSegments(answered, 150);
  assert.ok(segs.length <= MAX_SEGMENTS && segs.length > 40, `grouped into ${segs.length}`);
  assert.equal(segs[0].state, 'done'); assert.equal(segs[segs.length - 1].state, 'none');
  assert.equal(segs.filter(s => s.current).length, 1);
});

test('grouped block with some answered questions is "part" with a proportional fill', () => {
  const segs = buildSegments(Array.from({ length: 120 }, (_, i) => i === 0), 0); // groups of 2
  assert.equal(segs[0].state, 'part'); assert.equal(segs[0].fill, 50);
});
