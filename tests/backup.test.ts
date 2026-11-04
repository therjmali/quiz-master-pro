import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetIdbForTests } from '../src/platform/idb';
import { BACKUP_FORMAT, BACKUP_SCHEMA, checksumOf, createBackup, deleteBackup, exportBackup, getBackupSettings, importBackupFile, isBackupDue, listBackups, parseBackupBytes, parseBackupText, restoreBackup, runAutoBackupIfDue, saveBackupSettings, verifyBackup, DEFAULT_BACKUP_SETTINGS } from '../src/platform/autoBackup';
import { __resetBaseCacheForTests } from '../src/platform/cloud/sections';
import { __resetHistoryTrashForTests, loadHistoryTrash, withoutHistoryTrash } from '../src/utils/historyTrash';
import { getHistory, setHistory } from '../src/utils/historyStore';
import type { QuizResult } from '../src/types/quiz';

const result = (id: string, timestamp: number) => ({ id, timestamp, totalQuestions: 5, score: 4, quizData: { title: id, questions: [] } }) as unknown as QuizResult;
const nov = Date.UTC(2026, 10, 3);
const tick = () => new Promise(r => setTimeout(r, 25));

beforeEach(() => {
  localStorage.clear(); __resetIdbForTests(); __resetBaseCacheForTests(); __resetHistoryTrashForTests();
  withoutHistoryTrash(() => setHistory([]));
  localStorage.setItem('qmp_settings', JSON.stringify({ theme: 'dark' }));
});

test('a backup is stored compressed, verified, counted and listed newest first', async () => {
  withoutHistoryTrash(() => setHistory([result('a', nov), result('b', nov + 1)]));
  const first = await createBackup('manual');
  assert.ok(first);
  assert.equal(first!.counts.history, 2);
  assert.equal(first!.compressed, true);
  assert.deepEqual(await verifyBackup(first!.id), { ok: true, message: 'Backup is intact (2 sections).' });
  const second = await createBackup('auto');
  const list = await listBackups();
  assert.deepEqual(list.map(m => m.id), [second!.id, first!.id]);
});

test('nothing is saved while the app has no data yet', async () => {
  localStorage.clear();
  assert.equal(await createBackup('manual'), null);
});

test('rotation keeps the newest N routine backups and caps safety backups separately', async () => {
  saveBackupSettings({ ...DEFAULT_BACKUP_SETTINGS, keep: 3 });
  for (let i = 0; i < 6; i++) {
    localStorage.setItem('qmp_settings', JSON.stringify({ n: i }));
    await createBackup('auto'); await new Promise(r => setTimeout(r, 3));
  }
  assert.equal((await listBackups()).filter(m => m.reason === 'auto').length, 3);
  for (let i = 0; i < 8; i++) {
    localStorage.setItem('qmp_settings', JSON.stringify({ s: i }));
    await createBackup('before-restore'); await new Promise(r => setTimeout(r, 3));
  }
  const list = await listBackups();
  assert.equal(list.filter(m => m.reason === 'before-restore').length, 5, 'at most 5 safety backups');
  assert.equal(list.filter(m => m.reason === 'auto').length, 3, 'routine backups untouched by safety rotation');
});

test('automatic backups run when due and the data changed, never when disabled or unchanged', async () => {
  const t0 = new Date('2026-11-03T08:00:00Z');
  assert.ok(await runAutoBackupIfDue(t0), 'first run creates one');
  assert.equal(await runAutoBackupIfDue(new Date(t0.getTime() + 25 * 3_600_000)), null, 'due, but nothing changed');
  localStorage.setItem('qmp_settings', JSON.stringify({ theme: 'light' }));
  assert.equal(await runAutoBackupIfDue(new Date(Date.now() + 1000)), null, 'changed, but not due yet');
  const later = new Date(Date.now() + 25 * 3_600_000);
  assert.ok(await runAutoBackupIfDue(later), 'changed and due -> backs up');
  saveBackupSettings({ ...getBackupSettings(), enabled: false });
  localStorage.setItem('qmp_settings', JSON.stringify({ theme: 'amoled' }));
  assert.equal(await runAutoBackupIfDue(new Date(later.getTime() + 99 * 3_600_000)), null, 'disabled');
});

test('due logic follows the interval', () => {
  const meta = { createdAt: '2026-11-03T00:00:00.000Z' } as never;
  const s = { enabled: true, intervalHours: 12, keep: 7 };
  assert.equal(isBackupDue(new Date('2026-11-03T11:00:00Z'), meta, s), false);
  assert.equal(isBackupDue(new Date('2026-11-03T12:00:00Z'), meta, s), true);
  assert.equal(isBackupDue(new Date(), undefined, s), true);
});

test('restoring brings data back, takes a safety backup first, and does not trash anything', async () => {
  withoutHistoryTrash(() => setHistory([result('keep', nov), result('old', nov + 5)]));
  const snapshot = await createBackup('manual');
  withoutHistoryTrash(() => setHistory([result('only-new', nov + 10)]));
  localStorage.setItem('qmp_settings', JSON.stringify({ theme: 'light' }));

  const res = await restoreBackup(snapshot!.id);
  assert.ok(res.safetyBackupId, 'safety backup of the pre-restore state');
  assert.deepEqual((await getHistory()).map(r => r.id).sort(), ['keep', 'old']);
  assert.deepEqual(JSON.parse(localStorage.getItem('qmp_settings')!), { theme: 'dark' });
  await tick();
  assert.equal((await loadHistoryTrash()).length, 0, 'restore is not a user deletion');

  // ...and the restore itself can be undone from the safety backup
  await restoreBackup(res.safetyBackupId!);
  assert.deepEqual((await getHistory()).map(r => r.id), ['only-new']);
});

test('export produces a self-checking file that imports cleanly; tampering is rejected', async () => {
  withoutHistoryTrash(() => setHistory([result('x', nov)]));
  const { filename, blob } = await exportBackup();
  assert.match(filename, /^quiz-master-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
  const text = await blob.text();
  const file = parseBackupText(text);
  assert.equal(file.format, BACKUP_FORMAT);

  withoutHistoryTrash(() => setHistory([]));
  const res = await importBackupFile(file);
  assert.ok(res.applied.length > 0);
  assert.deepEqual((await getHistory()).map(r => r.id), ['x']);

  const parsedBytes = await parseBackupBytes(new TextEncoder().encode(text));
  assert.equal(parsedBytes.checksum, file.checksum);

  const tampered = JSON.parse(text); tampered.sections.qmp_settings = { theme: 'evil' };
  assert.throws(() => parseBackupText(JSON.stringify(tampered)), /damaged/);
  assert.throws(() => parseBackupText('{"hello":1}'), /not a Quiz Master Pro backup/);
  assert.throws(() => parseBackupText('nope'), /not a valid backup/);
  const future = { ...file, schema: BACKUP_SCHEMA + 1 };
  assert.throws(() => parseBackupText(JSON.stringify(future)), /newer version/);
  assert.equal(checksumOf(file.sections), file.checksum);
});

test('deleting a backup removes it from the list and the store', async () => {
  const m = await createBackup('manual');
  await deleteBackup(m!.id);
  assert.equal((await listBackups()).length, 0);
  assert.equal((await verifyBackup(m!.id)).ok, false);
});
