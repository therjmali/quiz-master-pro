import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, shardHistory, unshardHistory, readAllLocalSections, applySectionsToDevice, isSyncKey, describeSection } from '../src/platform/cloud/sections';
import { encodeSectionValue, decodeSectionValue, isPacked, parseHave } from '../src/platform/cloud/remote';
import { installStorageHook } from '../src/platform/storageHook';
import { onLocalChange, setSyncWriteGuard } from '../src/platform/cloud/changeBus';
import { getHistory, setHistory, getHistorySync } from '../src/utils/historyStore';
import { loadHistoryTrash, withoutHistoryTrash, purgeExpiredHistoryTrash, setTrashRetentionDays, emptyHistoryTrash, __resetHistoryTrashForTests, resultKey, daysLeft } from '../src/utils/historyTrash';
import { restoreFromHistoryTrash } from '../src/utils/historyTrashActions';
import type { QuizResult } from '../src/types/quiz';

const nov = Date.UTC(2026, 10, 3, 10);
const oct = Date.UTC(2026, 9, 3, 10);
const result = (id: string | undefined, timestamp: number, extra: object = {}) =>
  ({ id, timestamp, totalQuestions: 10, score: 7, quizData: { title: `Quiz ${id ?? timestamp}`, questions: [] }, ...extra }) as unknown as QuizResult;
const tick = () => new Promise(r => setTimeout(r, 25));

test('fingerprints ignore key order but notice real changes', () => {
  assert.equal(fingerprint({ a: 1, b: [1, 2] }), fingerprint({ b: [1, 2], a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
  assert.notEqual(fingerprint('1'), fingerprint(1));
});

test('history is sharded by month and rebuilt newest-first; legacy results without an id are kept', () => {
  const list = [result('a', nov), result('b', oct), result(undefined, nov + 5)] as unknown as Array<Record<string, unknown>>;
  const shards = shardHistory(list);
  assert.deepEqual(Object.keys(shards).sort(), ['hist:2026-10', 'hist:2026-11']);
  assert.equal(Object.keys(shards['hist:2026-11'].items).length, 2);
  const back = unshardHistory(shards);
  assert.equal(back.length, 3);
  assert.deepEqual(back.map(r => r.timestamp), [nov + 5, nov, oct]);
  assert.equal(describeSection('hist:2026-11').label, 'Quiz history - November 2026');
  assert.ok(isSyncKey('hist:2026-11') && isSyncKey('bookmarks') && !isSyncKey('qmp_api_keys') && !isSyncKey('hist:bad'));
});

test('secrets and caches are never part of the sync set', () => {
  for (const key of ['qmp_api_keys', 'qmp_user_api_keys', 'qmp_input', 'qmp_active_session', 'qm-supabase-auth-v1', 'qmp_rationale_cache']) {
    assert.equal(isSyncKey(key), false, `${key} must stay on the device`);
  }
});

test('plain localStorage values round-trip, including raw strings and deletions', async () => {
  localStorage.setItem('qmp_settings', JSON.stringify({ a: 1 }));
  localStorage.setItem('qmp_theme', 'dark');
  const read = await readAllLocalSections();
  assert.deepEqual(read.qmp_settings, { a: 1 });
  assert.deepEqual(read.qmp_theme, { __raw: 'dark' });

  const changed = await applySectionsToDevice({ qmp_settings: { a: 2 }, qmp_theme: { __raw: 'light' } });
  assert.deepEqual(changed.sort(), ['qmp_settings', 'qmp_theme']);
  assert.equal(localStorage.getItem('qmp_theme'), 'light', 'raw string written back raw');
  assert.deepEqual(JSON.parse(localStorage.getItem('qmp_settings')!), { a: 2 });

  const skipped = await applySectionsToDevice({ qmp_settings: { a: 3 } }, new Set(['qmp_settings', 'qmp_theme']));
  assert.deepEqual(skipped, [], 'keys changed mid-sync are skipped');
  assert.deepEqual(JSON.parse(localStorage.getItem('qmp_settings')!), { a: 2 });

  await applySectionsToDevice({ qmp_settings: { a: 3 } });
  assert.equal(localStorage.getItem('qmp_theme'), null, 'section absent from the target is removed');
});

test('quiz history is read from and written back to the real history store', async () => {
  setHistory([result('a', nov), result('b', oct)]);
  const sections = await readAllLocalSections();
  assert.deepEqual(Object.keys(sections).filter(k => k.startsWith('hist:')).sort(), ['hist:2026-10', 'hist:2026-11']);

  const target = { ...sections, 'hist:2026-11': { items: { ...(sections['hist:2026-11'] as { items: object }).items, c: result('c', nov + 1) } } };
  const changed = await applySectionsToDevice(target);
  assert.deepEqual(changed, ['hist:2026-11']);
  assert.deepEqual((await getHistory()).map(r => r.id), ['c', 'a', 'b']);
});

test('deleting a result moves it to the local trash; restore puts it back', async () => {
  __resetHistoryTrashForTests();
  setHistory([result('x', nov), result('y', nov + 10)]);
  setHistory([result('y', nov + 10)]);                        // user deletes "x"
  await tick();
  let trash = await loadHistoryTrash();
  assert.equal(trash.length, 1);
  assert.equal(resultKey(trash[0].result), 'x');

  assert.equal(await restoreFromHistoryTrash(['x']), 1);
  assert.deepEqual(getHistorySync().map(r => r.id), ['y', 'x']);
  trash = await loadHistoryTrash();
  assert.equal(trash.length, 0, 'restored items leave the trash');
  assert.equal(getHistorySync().length, 2, 'restoring does not trash anything itself');
});

test('removals made by sync/restore are not trashed, and trash expires after the retention period', async () => {
  __resetHistoryTrashForTests();
  withoutHistoryTrash(() => setHistory([]));          // clean slate left by earlier tests
  await emptyHistoryTrash();
  setHistory([result('p', nov), result('q', nov + 1)]);
  withoutHistoryTrash(() => setHistory([result('q', nov + 1)]));
  await tick();
  assert.equal((await loadHistoryTrash()).length, 0);

  setHistory([result('q', nov + 1), result('r', nov + 2)]);
  setHistory([result('q', nov + 1)]);                          // delete r
  await tick();
  assert.equal((await loadHistoryTrash()).length, 1);
  const deletedAt = (await loadHistoryTrash())[0].deletedAt;
  setTrashRetentionDays(30);
  assert.equal(await purgeExpiredHistoryTrash(deletedAt + 29 * 86_400_000), 0, 'still inside the window');
  assert.equal(daysLeft(deletedAt, deletedAt + 10 * 86_400_000), 20);
  assert.equal(await purgeExpiredHistoryTrash(deletedAt + 31 * 86_400_000), 1, 'expired items are purged');
  setHistory([result('q', nov + 1), result('s', nov + 3)]);
  setHistory([result('q', nov + 1)]);
  await tick();
  setTrashRetentionDays(0);
  assert.equal(await purgeExpiredHistoryTrash(deletedAt + 9999 * 86_400_000), 0, 'retention 0 keeps everything');
  setTrashRetentionDays(30);
});

test('large sections are gzip-compressed transparently and restored byte-for-byte', async () => {
  const big = { items: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`q${i}`, { id: `q${i}`, text: 'What is the first-line treatment of postpartum haemorrhage? '.repeat(4), options: ['A', 'B', 'C', 'D'] }])) };
  const packed = await encodeSectionValue(big);
  assert.equal(isPacked(packed), true);
  assert.ok(JSON.stringify(packed).length < JSON.stringify(big).length / 3, 'at least 3x smaller');
  assert.deepEqual(await decodeSectionValue(packed), big);
  const small = { a: 1 };
  assert.equal(await encodeSectionValue(small), small, 'small values are stored as-is');
  assert.deepEqual(await decodeSectionValue(small), small);
});

test('the "have" header is parsed into per-section hashes', () => {
  assert.deepEqual(parseHave('hist:2026-11:abc,qmp_settings:def'), { 'hist:2026-11': 'abc', qmp_settings: 'def' });
  assert.equal(parseHave(''), null);
});

test('the storage hook reports only real changes to synced keys', () => {
  installStorageHook();
  const seen: Array<string | undefined> = [];
  const off = onLocalChange(k => seen.push(k));
  localStorage.setItem('qmp_pinned', '["a"]');
  localStorage.setItem('qmp_pinned', '["a"]');         // same value: no event
  localStorage.setItem('qmp_api_keys', 'secret');      // not synced: no event
  localStorage.setItem('qmp_pinned', '["a","b"]');
  localStorage.removeItem('qmp_pinned');
  localStorage.removeItem('qmp_pinned');               // already gone: no event
  setSyncWriteGuard(true);
  localStorage.setItem('qmp_pinned', 'guarded');       // the engine's own writes are silent
  setSyncWriteGuard(false);
  off();
  assert.deepEqual(seen, ['qmp_pinned', 'qmp_pinned', 'qmp_pinned']);
});
