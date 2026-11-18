import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FakeCloud, FakeDevice } from './helpers';
import { CloudError } from '../src/platform/cloud/http';
import { __setEngineDepsForTests, __resetEngineForTests, syncNow, noteLocalChange, resolveFirstSync, getSyncState, restoreRevision, fetchRevisions, wipeCloudCopy, DATA_APPLIED_EVENT, pushDeviceOverCloud, pullCloudOverDevice, isSyncWriteGuarded } from '../src/platform/cloud/syncEngine';
import { getOutbox, clearOutbox } from '../src/platform/cloud/syncQueue';
import { subscribeToRealtime, unsubscribeFromRealtime, sendSyncPing, isRealtimeConnected, getRealtimeStatus, __setRealtimeClientForTests } from '../src/platform/cloud/realtimeSync';
import { resetBackoff, getEligibleItems, dequeueQueuedBefore, recordFailure, getStuckItems } from '../src/platform/cloud/syncQueue';
import { generateUUID } from '../src/platform/cloud/uuid';
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

test('offline disconnected state queues local records and pushes to cloud upon reconnection', async () => {
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings());
  // 1. Initial sync while online
  await on(a, () => syncNow('initial'));
  assert.equal(getSyncState().phase, 'synced');

  // 2. Simulate offline disconnected state
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: false },
    writable: true,
    configurable: true,
  });
  const quizId = generateUUID();
  a.dev.edit('hist:2026-11', { items: { [quizId]: { id: quizId, score: 95, timestamp: Date.now() } } });

  await on(a, async () => {
    noteLocalChange('hist:2026-11', a.dev.data['hist:2026-11']);
    const offlineRes = await syncNow('try-while-offline');
    assert.equal(offlineRes.ok, false);
    assert.equal(offlineRes.error, 'Offline');
  });

  // Verify record is parked in persistent outbox queue
  assert.ok(getOutbox().some(item => item.sectionKey === 'hist:2026-11'), 'mutation is parked in outbox');

  // 3. Simulate reconnection
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    writable: true,
    configurable: true,
  });
  const reconnectRes = await on(a, () => syncNow('online-reconnect'));
  assert.equal(reconnectRes.ok, true);
  assert.equal(getSyncState().phase, 'synced');

  // Verify pushed to Supabase cloud
  const cloudHistory = cloud.data()['hist:2026-11'] as { items: Record<string, any> };
  assert.ok(cloudHistory?.items?.[quizId], 'record was pushed to cloud after reconnection');
  assert.equal(cloudHistory.items[quizId].score, 95);
  // ...and the outbox is EMPTY again: nothing stays "pending", nothing keeps retrying in the background
  assert.equal(getOutbox().length, 0, 'the outbox is drained after a successful sync');
  assert.equal(getSyncState().pendingCount, 0);
});


/* ───────────────────────── outbox ───────────────────────── */

test('outbox: a successful sync clears what it covered; a change made during the sync stays queued', async () => {
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings());
  await on(a, async () => {
    noteLocalChange('qmp_settings');
    assert.equal(getOutbox().length, 1);
    const res = await syncNow('t');
    assert.equal(res.ok, true);
    assert.equal(getOutbox().length, 0, 'drained');
    assert.equal(getEligibleItems().length, 0, 'the retry worker has nothing to do');
    assert.equal(getSyncState().pendingCount, 0);
  });
  // items queued after the cut-off survive
  await on(a, async () => {
    noteLocalChange('hist:2026-11');
    const removed = dequeueQueuedBefore(Date.now() - 10_000);
    assert.equal(removed, 0);
    assert.equal(getOutbox().length, 1);
  });
});

test('outbox: a failed push keeps the item with a growing backoff; a manual retry starts clean and succeeds', async () => {
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings());
  await on(a, async () => {
    await syncNow('initial');
    a.dev.edit('qmp_settings', settings({ theme: 'light' }));
    noteLocalChange('qmp_settings');
    cloud.failNextPushWith = new CloudError('Network down', 'network');
    const res = await syncNow('local-change');
    assert.equal(res.ok, false);
    const item = getOutbox()[0];
    assert.ok(item && item.retryCount >= 1, 'the failure is counted on the item');
    assert.ok(item.nextRetryAt > Date.now(), 'and it waits (exponential backoff) before the next automatic retry');
    assert.equal(getEligibleItems().length, 0);
    // "Force sync" / tapping the badge: no waiting out the backoff
    const ok = await syncNow('manual-retry');
    assert.equal(ok.ok, true);
    assert.equal(getOutbox().length, 0);
    assert.equal((cloud.data().qmp_settings as { theme: string }).theme, 'light');
  });
});

test('outbox: resetBackoff makes every waiting item eligible again', async () => {
  const a = new Phone('A');
  await on(a, async () => {
    noteLocalChange('qmp_settings');
    const [item] = getOutbox();
    // pretend every automatic retry was used up
    for (let i = 0; i < 12; i++) recordFailure(item.id, 'Network down');
    assert.equal(getEligibleItems().length, 0);
    assert.equal(getStuckItems().length, 1, 'stuck items are reported so the UI can say so');
    resetBackoff();
    assert.equal(getEligibleItems().length, 1);
    assert.equal(getStuckItems().length, 0);
  });
});

/* ───────────────────────── two devices, A to Z ───────────────────────── */

test('two devices: a quiz finished on the phone reaches the tablet (and back), including the full question details', async () => {
  const phone = new Phone('Phone'); const tablet = new Phone('Tablet');
  phone.dev.edit('qmp_settings', settings());
  await on(phone, () => syncNow('boot'));
  await on(tablet, () => syncNow('boot'));            // the tablet joins the account
  // the phone finishes a quiz (summary row + the full questions)
  const id = generateUUID();
  phone.dev.edit('hist:2026-11', { items: { [id]: { id, score: 70, timestamp: 1 } } });
  phone.dev.edit('qd:2026-11', { items: { [id]: { id, quizData: [{ question: 'Q?', options: ['a', 'b'], correctAnswer: 'a' }] } } });
  await on(phone, async () => { noteLocalChange('hist:2026-11'); await syncNow('local-change'); });
  // the tablet comes to the foreground and pulls
  await on(tablet, async () => {
    const res = await syncNow('foreground-resume');
    assert.equal(res.ok, true);
    const hist = tablet.dev.data['hist:2026-11'] as { items: Record<string, unknown> };
    assert.ok(hist.items[id], 'the quiz is on the tablet');
    const det = tablet.dev.data['qd:2026-11'] as { items: Record<string, { quizData: unknown[] }> };
    assert.equal(det.items[id].quizData.length, 1, 'with its questions, so it can be opened and reviewed');
    assert.equal(getOutbox().length, 0);
  });
  // a note made on the tablet comes back to the phone
  tablet.dev.edit('bookmarks', { folders: { f1: { id: 'f1', name: 'Anatomy' } } });
  await on(tablet, async () => { noteLocalChange('bookmarks'); await syncNow('local-change'); });
  await on(phone, async () => { await syncNow('poll'); assert.ok((phone.dev.data.bookmarks as any).folders.f1, 'bookmark reached the phone'); });
});

test('two devices: the phone creates a quiz offline, the tablet is online meanwhile; reconnecting pushes the phone queue and the tablet gets it', async () => {
  const phone = new Phone('Phone'); const tablet = new Phone('Tablet');
  phone.dev.edit('qmp_settings', settings());
  await on(phone, () => syncNow('boot')); await on(tablet, () => syncNow('boot'));
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, writable: true, configurable: true });
  const id = generateUUID();
  phone.dev.edit('hist:2026-11', { items: { [id]: { id, score: 55, timestamp: 2 } } });
  await on(phone, async () => { noteLocalChange('hist:2026-11'); assert.equal((await syncNow('offline')).error, 'Offline'); assert.equal(getOutbox().length, 1); });
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
  await on(tablet, async () => { await syncNow('poll'); assert.equal((tablet.dev.data['hist:2026-11'] as any)?.items?.[id], undefined, 'nothing yet: the phone has not reconnected'); });
  await on(phone, async () => { assert.equal((await syncNow('online-reconnect')).ok, true); assert.equal(getOutbox().length, 0); });
  await on(tablet, async () => { await syncNow('realtime:broadcast'); assert.ok((tablet.dev.data['hist:2026-11'] as any).items[id], 'the tablet received the queued quiz'); });
});

/* ───────────────────────── realtime ───────────────────────── */

function fakeRealtime() {
  const channels: any[] = []; const removed: string[] = [];
  const client = {
    channel: (name: string) => {
      const ch: any = { name, handlers: [] as any[], sent: [] as any[], statusCb: null as any,
        on: (type: string, filter: any, cb: any) => { ch.handlers.push({ type, filter, cb }); return ch; },
        subscribe: (cb: any) => { ch.statusCb = cb; cb?.('SUBSCRIBED'); return ch; },
        send: (msg: any) => { ch.sent.push(msg); return Promise.resolve('ok'); } };
      channels.push(ch); return ch;
    },
    removeChannel: (ch: any) => { removed.push(ch.name); return Promise.resolve('ok'); },
  };
  return { client, channels, removed };
}

async function withCloudEnv<T>(fn: () => Promise<T> | T): Promise<T> {
  const oldUrl = process.env.VITE_SUPABASE_URL, oldKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://fake-project.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-that-is-longer-than-20-chars';
  try { return await fn(); } finally {
    process.env.VITE_SUPABASE_URL = oldUrl; process.env.VITE_SUPABASE_ANON_KEY = oldKey;
    __setRealtimeClientForTests(null); unsubscribeFromRealtime();
  }
}

test('realtime: subscribes only to tables that exist (quiz_sync_docs) plus a broadcast channel, filtered to the signed-in user', () => withCloudEnv(() => {
  const rt = fakeRealtime(); __setRealtimeClientForTests(() => rt.client as any);
  subscribeToRealtime('user-123', 'dev-A', { onRemoteChange: () => {} });
  const dbBindings = rt.channels.flatMap(c => c.handlers).filter((h: any) => h.type === 'postgres_changes');
  assert.equal(dbBindings.length, 1, 'one table, no phantom tables that would fail the whole subscription');
  assert.equal(dbBindings[0].filter.table, 'quiz_sync_docs');
  assert.equal(dbBindings[0].filter.filter, 'user_id=eq.user-123');
  assert.ok(rt.channels.some(c => c.name === 'qm-sync:user-123' && c.handlers.some((h: any) => h.type === 'broadcast')));
  assert.ok(isRealtimeConnected() && getRealtimeStatus() === 'CONNECTED');
}));

test('realtime: a ping from another device triggers a pull, our own echo does not', () => withCloudEnv(() => {
  const rt = fakeRealtime(); __setRealtimeClientForTests(() => rt.client as any);
  const seen: string[] = [];
  subscribeToRealtime('user-1', 'dev-A', { onRemoteChange: (src) => seen.push(src) });
  const ping = rt.channels.find(c => c.name === 'qm-sync:user-1').handlers.find((h: any) => h.type === 'broadcast');
  ping.cb({ payload: { d: 'dev-A', v: 3 } });      // echo of our own push
  assert.deepEqual(seen, []);
  ping.cb({ payload: { d: 'dev-B', v: 4 } });      // the tablet pushed
  assert.deepEqual(seen, ['broadcast']);
  const db = rt.channels.find(c => c.name === 'qm-db:user-1').handlers[0];
  db.cb({ new: { user_id: 'user-1', version: 5 } });
  assert.deepEqual(seen, ['broadcast', 'database']);
}));

test('realtime: sign-out removes both channels; another account never receives the previous one', () => withCloudEnv(() => {
  const rt = fakeRealtime(); __setRealtimeClientForTests(() => rt.client as any);
  const seen: string[] = [];
  subscribeToRealtime('user-1', 'dev-A', { onRemoteChange: () => seen.push('u1') });
  const oldPing = rt.channels.find(c => c.name === 'qm-sync:user-1');
  unsubscribeFromRealtime();
  assert.deepEqual(rt.removed.sort(), ['qm-db:user-1', 'qm-sync:user-1']);
  assert.equal(getRealtimeStatus(), 'DISCONNECTED');
  assert.equal(sendSyncPing({ d: 'dev-A', v: 1 }), false, 'nothing is sent after sign-out');
  // switch to user 2: user 1 channels are gone, and a late callback of the old channel is ignored
  subscribeToRealtime('user-2', 'dev-A', { onRemoteChange: () => seen.push('u2') });
  oldPing.statusCb?.('CHANNEL_ERROR');
  assert.equal(getRealtimeStatus(), 'CONNECTED', 'a stale status callback from the removed channel changes nothing');
  assert.ok(rt.channels.filter(c => c.name.includes('user-2')).length === 2);
}));

test('realtime: a channel error is reported (the engine then polls faster); a ping is only sent while connected', () => withCloudEnv(() => {
  const rt = fakeRealtime(); __setRealtimeClientForTests(() => rt.client as any);
  const statuses: string[] = [];
  subscribeToRealtime('user-1', 'dev-A', { onRemoteChange: () => {}, onStatusChange: s => statuses.push(s) });
  const ping = rt.channels.find(c => c.name === 'qm-sync:user-1');
  assert.equal(sendSyncPing({ d: 'dev-A', v: 2 }), true);
  assert.equal(ping.sent[0].event, 'sync-ping'); assert.equal(ping.sent[0].payload.v, 2);
  ping.statusCb('CHANNEL_ERROR');
  assert.equal(isRealtimeConnected(), false);
  assert.equal(sendSyncPing({ d: 'dev-A', v: 3 }), false);
  assert.deepEqual(statuses, ['CONNECTING', 'CONNECTED', 'ERROR']);
}));

test('realtime: a successful push pings the other devices', () => withCloudEnv(async () => {
  const rt = fakeRealtime(); __setRealtimeClientForTests(() => rt.client as any);
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings());
  await on(a, async () => {
    subscribeToRealtime('user-1', 'phone-A', { onRemoteChange: () => {} });
    await syncNow('first');
    const ping = rt.channels.find(c => c.name === 'qm-sync:user-1');
    assert.ok(ping.sent.some((m: any) => m.event === 'sync-ping' && m.payload.d), 'ping sent after the push');
    const before = ping.sent.length;
    await syncNow('nothing-changed');
    assert.equal(ping.sent.length, before, 'no ping when nothing was pushed');
  });
}));

/* ───────────────────────── foreground / resume ───────────────────────── */

test('resume: focus + visibility + app-state events inside one window become a single sync; stopping the engine cancels a waiting one', async () => {
  const { startSyncEngine, stopSyncEngine, requestForegroundSync } = await import('../src/platform/cloud/syncEngine');
  const a = new Phone('A');
  a.dev.edit('qmp_settings', settings());
  await on(a, async () => {
    startSyncEngine();
    await new Promise(r => setTimeout(r, 80));          // the boot sync
    const base = cloud.pulls;
    for (const reason of ['foreground-resume', 'window-focus', 'capacitor-app-resume', 'realtime:broadcast', 'online-reconnect']) requestForegroundSync(reason, 30);
    await new Promise(r => setTimeout(r, 150));
    assert.equal(cloud.pulls - base, 1, 'five events, one pull');
    requestForegroundSync('window-focus', 60);
    stopSyncEngine();                                    // sign-out / app close
    const afterStop = cloud.pulls;
    await new Promise(r => setTimeout(r, 120));
    assert.equal(cloud.pulls, afterStop, 'a waiting resume sync is cancelled by stop');
  });
});
