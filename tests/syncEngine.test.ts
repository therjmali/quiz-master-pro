import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FakeCloud, FakeDevice } from './helpers';
import { CloudError } from '../src/platform/cloud/http';
import { __setEngineDepsForTests, __resetEngineForTests, syncNow, noteLocalChange, resolveFirstSync, getSyncState, restoreRevision, fetchRevisions, wipeCloudCopy, DATA_APPLIED_EVENT, pushDeviceOverCloud, pullCloudOverDevice, isSyncWriteGuarded } from '../src/platform/cloud/syncEngine';
import { __restoreIdbForTests, __snapshotIdbForTests, idbGet, STORE } from '../src/platform/idb';
import { __resetBaseCacheForTests, loadMeta } from '../src/platform/cloud/sections';

/** A phone = its own localStorage + bookkeeping store + app data. */
class Phone {
  dev: FakeDevice;
  ls: Storage;
  idb: ReturnType<typeof __snapshotIdbForTests> | null = null;
  constructor(public name: string, public userId = 'user-1') {
    this.dev = new FakeDevice(name, userId);
    const make = (globalThis as unknown as { Storage: new () => Storage }).Storage;
    this.ls = new make();
  }
}

let cloud: FakeCloud;

async function on<T>(phone: Phone, fn: () => Promise<T>): Promise<T> {
  (globalThis as unknown as { localStorage: Storage }).localStorage = phone.ls;
  __restoreIdbForTests(phone.idb);
  __resetBaseCacheForTests();
  __resetEngineForTests();
  __setEngineDepsForTests({
    getUserId: () => phone.userId, getEndpoint: () => 'https://example.supabase.co',
    remote: cloud, readLocal: phone.dev.readLocal, applyLocal: phone.dev.applyLocal,
  });
  try { return await fn(); } finally { phone.idb = __snapshotIdbForTests(); }
}

beforeEach(() => { cloud = new FakeCloud(); });

const settings = (extra: object = {}) => ({ theme: 'dark', negative: 0.25, ...extra });

test('first sync of a device with an empty cloud uploads everything and keeps an untouched backup', async () => {
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings());
  a.dev.edit('hist:2026-11', { items: { r1: { id: 'r1', score: 80, timestamp: 1 } } });
  const res = await on(a, () => syncNow('test'));
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(cloud.data()).sort(), ['hist:2026-11', 'qmp_settings']);
  assert.equal(getSyncState().phase, 'synced');
  const backup = await on(a, () => idbGet<{ verified: boolean; sections: object }>(STORE.kv, 'premigration:user-1'));
  assert.ok(backup, 'pre-migration backup exists');
  assert.equal(backup!.verified, true, 'and was verified after the upload');
});

test('a new empty device receives everything from the cloud and tells the app to reload', async () => {
  cloud.seed({ qmp_settings: settings(), bookmarks: { folders: { f1: { id: 'f1', name: 'Anatomy' } } } });
  const b = new Phone('B');
  let applied = false;
  const handler = () => { applied = true; };
  window.addEventListener(DATA_APPLIED_EVENT, handler);
  const res = await on(b, () => syncNow('test'));
  window.removeEventListener(DATA_APPLIED_EVENT, handler);
  assert.equal(res.ok, true);
  assert.deepEqual(b.dev.data, cloud.data());
  assert.equal(applied, true);
});

test('two devices that edit different parts of the same section both keep their changes', async () => {
  const a = new Phone('A'); const b = new Phone('B');
  a.dev.edit('qmp_settings', settings());
  await on(a, () => syncNow('a1'));
  await on(b, () => syncNow('b1'));
  a.dev.edit('qmp_settings', settings({ theme: 'light' }));
  b.dev.edit('qmp_settings', settings({ negative: 0.5 }));
  await on(a, async () => { noteLocalChange(); await syncNow('a2'); });
  const rb = await on(b, async () => { noteLocalChange(); return syncNow('b2'); });
  assert.equal(rb.conflicts, 0);
  assert.deepEqual(b.dev.data.qmp_settings, { theme: 'light', negative: 0.5 });
  await on(a, async () => { noteLocalChange(); await syncNow('a3'); });
  assert.deepEqual(a.dev.data.qmp_settings, { theme: 'light', negative: 0.5 });
  assert.deepEqual(cloud.data().qmp_settings, { theme: 'light', negative: 0.5 });
});

test('quiz history added on two phones the same month is combined, not overwritten', async () => {
  const a = new Phone('A'); const b = new Phone('B');
  a.dev.edit('hist:2026-11', { items: { r1: { id: 'r1', score: 70 } } });
  await on(a, () => syncNow('a1'));
  await on(b, () => syncNow('b1'));
  a.dev.edit('hist:2026-11', { items: { r1: { id: 'r1', score: 70 }, r2: { id: 'r2', score: 90 } } });
  b.dev.edit('hist:2026-11', { items: { r1: { id: 'r1', score: 70 }, r3: { id: 'r3', score: 60 } } });
  await on(a, async () => { noteLocalChange(); await syncNow('a2'); });
  await on(b, async () => { noteLocalChange(); await syncNow('b2'); });
  const ids = Object.keys((b.dev.data['hist:2026-11'] as { items: object }).items).sort();
  assert.deepEqual(ids, ['r1', 'r2', 'r3']);
  assert.deepEqual(Object.keys((cloud.data()['hist:2026-11'] as { items: object }).items).sort(), ['r1', 'r2', 'r3']);
});

test('a real disagreement keeps this device value and is recorded in the sync log', async () => {
  const a = new Phone('A'); const b = new Phone('B');
  a.dev.edit('qmp_settings', settings());
  await on(a, () => syncNow('a1'));
  await on(b, () => syncNow('b1'));
  a.dev.edit('qmp_settings', settings({ theme: 'light' }));
  b.dev.edit('qmp_settings', settings({ theme: 'amoled' }));
  await on(a, async () => { noteLocalChange(); await syncNow('a2'); });
  const rb = await on(b, async () => { noteLocalChange(); return syncNow('b2'); });
  assert.equal(rb.conflicts, 1);
  assert.equal((b.dev.data.qmp_settings as { theme: string }).theme, 'amoled');
  const conflict = getSyncState().conflicts[0];
  assert.equal(conflict.key, 'qmp_settings');
  assert.match(conflict.remotePreview, /light/);
});

test('a deletion on one device is applied on the other', async () => {
  const a = new Phone('A'); const b = new Phone('B');
  a.dev.edit('qmp_pinned', ['q1']); a.dev.edit('qmp_settings', settings());
  await on(a, () => syncNow('a1'));
  await on(b, () => syncNow('b1'));
  a.dev.remove('qmp_pinned');
  await on(a, async () => { noteLocalChange(); await syncNow('a2'); });
  assert.equal('qmp_pinned' in cloud.data(), false);
  await on(b, async () => { noteLocalChange(); await syncNow('b2'); });
  assert.equal('qmp_pinned' in b.dev.data, false);
  assert.ok('qmp_settings' in b.dev.data);
});

test('a version conflict (another device pushed first) is merged and retried transparently', async () => {
  const a = new Phone('A'); const b = new Phone('B');
  a.dev.edit('qmp_settings', settings());
  await on(a, () => syncNow('a1'));
  await on(b, () => syncNow('b1'));
  a.dev.edit('qmp_pinned', ['x']);
  b.dev.edit('qmp_theme', { __raw: 'dark' });
  // While B is about to push, A sneaks in a push.
  cloud.beforePush = () => { cloud.seed({ ...cloud.data(), qmp_pinned: ['x'] }); };
  const rb = await on(b, async () => { noteLocalChange(); return syncNow('b2'); });
  assert.equal(rb.ok, true);
  assert.deepEqual(Object.keys(cloud.data()).sort(), ['qmp_pinned', 'qmp_settings', 'qmp_theme']);
  assert.deepEqual(b.dev.data.qmp_pinned, ['x']);
  assert.ok(cloud.pushes >= 2);
});

test('first contact with an account that already has different data asks before touching anything', async () => {
  cloud.seed({ qmp_settings: settings({ theme: 'light' }), qmp_pinned: ['cloud'] });
  const b = new Phone('B');
  b.dev.edit('qmp_settings', settings({ theme: 'amoled' }));
  const res = await on(b, () => syncNow('boot'));
  assert.equal(res.ok, false);
  assert.equal(getSyncState().phase, 'needs-choice');
  assert.equal(getSyncState().needsChoice?.localSections, 1);
  assert.equal(getSyncState().needsChoice?.remoteSections, 2);
  assert.deepEqual(b.dev.data, { qmp_settings: settings({ theme: 'amoled' }) }, 'device untouched while waiting');
  assert.equal(cloud.pushes, 0, 'nothing uploaded while waiting');
});

test('first-sync choice "cloud" replaces the device, "device" replaces the cloud, "merge" combines', async () => {
  // cloud
  cloud = new FakeCloud(); cloud.seed({ qmp_settings: settings({ theme: 'light' }), qmp_pinned: ['c'] });
  let p = new Phone('B'); p.dev.edit('qmp_settings', settings({ theme: 'amoled' })); p.dev.edit('qmp_theme', { __raw: 'x' });
  await on(p, () => syncNow('boot'));
  await on(p, () => resolveFirstSync('cloud'));
  assert.deepEqual(p.dev.data, cloud.data());
  assert.equal('qmp_theme' in p.dev.data, false, 'device-only section removed by "use cloud"');
  // device
  cloud = new FakeCloud(); cloud.seed({ qmp_settings: settings({ theme: 'light' }), qmp_pinned: ['c'] });
  p = new Phone('C'); p.dev.edit('qmp_settings', settings({ theme: 'amoled' }));
  await on(p, () => syncNow('boot'));
  await on(p, () => resolveFirstSync('device'));
  assert.deepEqual(cloud.data(), { qmp_settings: settings({ theme: 'amoled' }) });
  // merge
  cloud = new FakeCloud(); cloud.seed({ qmp_settings: settings({ theme: 'light' }), qmp_pinned: ['c'] });
  p = new Phone('D'); p.dev.edit('qmp_settings', settings({ theme: 'amoled' })); p.dev.edit('qmp_theme', { __raw: 'x' });
  await on(p, () => syncNow('boot'));
  await on(p, () => resolveFirstSync('merge'));
  assert.deepEqual(Object.keys(cloud.data()).sort(), ['qmp_pinned', 'qmp_settings', 'qmp_theme']);
  assert.deepEqual(Object.keys(p.dev.data).sort(), ['qmp_pinned', 'qmp_settings', 'qmp_theme']);
});

test('data written on the device while the sync is in flight is never overwritten', async () => {
  const a = new Phone('A'); const b = new Phone('B');
  a.dev.edit('qmp_settings', settings());
  await on(a, () => syncNow('a1'));
  await on(b, () => syncNow('b1'));
  b.dev.edit('qmp_pinned', ['before']);
  // the user keeps typing while B talks to the server
  cloud.beforePush = () => { b.dev.edit('qmp_pinned', ['typed-during-sync']); };
  await on(b, async () => { noteLocalChange(); await syncNow('b2'); });
  assert.deepEqual(b.dev.data.qmp_pinned, ['typed-during-sync'], 'newer device value survives the sync');
  assert.equal(getSyncState().phase, 'synced');
});

test('a second sync with nothing changed does no upload and no device writes', async () => {
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings());
  await on(a, async () => {
    await syncNow('first');
    const pushes = cloud.pushes; const logs = a.dev.appliedLog.length;
    const res = await syncNow('idle');
    assert.equal(res.ok, true);
    assert.equal(cloud.pushes, pushes);
    assert.equal(a.dev.appliedLog.length, logs);
    assert.deepEqual(res.pushed, []);
  });
});

test('a different account on the same device never inherits the previous account base', async () => {
  const a = new Phone('A', 'user-1');
  a.dev.edit('qmp_settings', settings());
  await on(a, () => syncNow('first'));
  assert.equal(loadMeta().userId, 'user-1');
  a.userId = 'user-2';
  cloud = new FakeCloud();                 // user-2 has their own empty cloud
  const res = await on(a, () => syncNow('switched'));
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(cloud.data()), ['qmp_settings'], 'device data uploaded as a fresh first contact');
});

test('server rejections and a missing cloud schema surface as clear states', async () => {
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings());
  cloud.rejectKeys.add('qmp_settings');
  const rejected = await on(a, () => syncNow('t'));
  assert.equal(rejected.ok, false);
  assert.match(rejected.error ?? '', /rejected/i);
  assert.equal(getSyncState().phase, 'error');

  cloud.rejectKeys.clear();
  cloud.failNextPushWith = new CloudError('Cloud database is not set up yet.', 'not_set_up', 404);
  const missing = await on(a, () => syncNow('t2'));
  assert.equal(missing.ok, false);
  assert.equal(getSyncState().phase, 'not-set-up');
});

test('restore points bring back an earlier state on this device', async () => {
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings());
  await on(a, async () => {
    await syncNow('v1');
    a.dev.edit('qmp_settings', settings({ theme: 'light' }));
    noteLocalChange(); await syncNow('v2');
    const revisions = await fetchRevisions();
    assert.ok(revisions.length >= 2);
    const oldest = revisions[revisions.length - 1];
    const res = await restoreRevision(oldest.version);
    assert.equal(res.ok, true);
    assert.deepEqual(a.dev.data.qmp_settings, settings());
  });
});

test('"use this device" and "use cloud" are explicit and complete', async () => {
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings({ theme: 'amoled' }));
  cloud.seed({ qmp_settings: settings({ theme: 'light' }), qmp_pinned: ['c'] });
  await on(a, async () => { await pushDeviceOverCloud(); });
  assert.deepEqual(cloud.data(), { qmp_settings: settings({ theme: 'amoled' }) });
  cloud.seed({ qmp_settings: settings({ theme: 'light' }), qmp_pinned: ['c'] });
  await on(a, async () => { await pullCloudOverDevice(); });
  assert.deepEqual(a.dev.data, cloud.data());
});

test('wiping the cloud copy leaves this device data intact', async () => {
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings());
  await on(a, async () => { await syncNow('v1'); await wipeCloudCopy(); });
  assert.deepEqual(cloud.data(), {});
  assert.ok('qmp_settings' in a.dev.data);
});

test('sync write guard is active during applyLocal and always released afterward (even without reload)', async () => {
  cloud.seed({ qmp_settings: settings({ theme: 'light' }) });
  const b = new Phone('B');
  let guardedDuringApply = false;
  const origApply = b.dev.applyLocal;
  b.dev.applyLocal = async (target, skip) => {
    guardedDuringApply = isSyncWriteGuarded();
    return origApply(target, skip);
  };
  await on(b, async () => {
    const res = await syncNow('pull-check');
    assert.equal(res.ok, true);
    assert.equal(guardedDuringApply, true, 'write guard suppresses local change loop while applying remote data');
    assert.equal(isSyncWriteGuarded(), false, 'write guard is released immediately after applyLocal finishes');
  });
});
