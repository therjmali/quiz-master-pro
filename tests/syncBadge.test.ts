import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncBadgeCopy } from '../src/platform/cloud/syncBadge';

test('header cloud badge: every state says what is true (no "Saved" while offline or waiting)', () => {
  assert.equal(syncBadgeCopy('synced').label, '🟢 Synced');
  assert.equal(syncBadgeCopy('syncing').label, '🔄 Syncing…');
  assert.equal(syncBadgeCopy('offline', 3).label, '🔴 Offline (3)');
  assert.equal(syncBadgeCopy('offline', 0).label, '🔴 Offline');
  assert.equal(syncBadgeCopy('error').label, '⚠️ Retry');
  assert.match(syncBadgeCopy('error').title, /tap to retry/i);
  assert.equal(syncBadgeCopy('pending', 2).label, '🟡 2 waiting');
  assert.match(syncBadgeCopy('pending', 1).title, /1 change waiting/);
  assert.match(syncBadgeCopy('pending', 2).title, /2 changes waiting/);
  assert.equal(syncBadgeCopy('attention').tone, 'warn');
  assert.equal(syncBadgeCopy('paused').tone, 'idle');
  for (const st of ['offline', 'pending', 'attention', 'paused', 'error', 'idle'] as const) {
    assert.ok(!/Synced/.test(syncBadgeCopy(st, 1).label), `${st} never claims to be synced`);
  }
});
