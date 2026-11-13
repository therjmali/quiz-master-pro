import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  LOCAL_ACCOUNT_KEY, DEVICE_SESSION_KEY, MAX_ATTEMPTS, MIN_PASSWORD_LENGTH, LOCKOUT_MS,
  changePassword, clearSession, createAccount, deleteAccount, deviceAccountId, deviceAccountInfo,
  deviceAccountSupported, isValidEmail, lastEmail, normalizeEmail, passwordProblem, readSession,
  readStoredAccount, rememberEmail, renameAccount, startSession, verifyPassword, accountHealth,
} from '../src/platform/account/localAccount';

// WebCrypto + atob/btoa exist in the browser the app runs in. Node 22 already provides `crypto`
// (read-only global) but not atob/btoa in this runner, so only those two are shimmed.
const g = globalThis as Record<string, unknown>;
assert.equal(typeof webcrypto.subtle.deriveBits, 'function');
if (typeof g.atob !== 'function') g.atob = (b: string) => Buffer.from(b, 'base64').toString('binary');
if (typeof g.btoa !== 'function') g.btoa = (b: string) => Buffer.from(b, 'binary').toString('base64');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test('password rules: length floor, spaces-only rejected, valid password accepted', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.match(passwordProblem('short')!, /at least 8/);
  assert.match(passwordProblem('        ')!, /only spaces/);
  assert.equal(passwordProblem('correct horse'), null);
});

test('email rules are strict about shape, not about case', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('  Rana@Example.COM '), true);
  assert.equal(isValidEmail('nope'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(normalizeEmail('  Rana@Example.COM '), 'rana@example.com');
});

test('creating an account stores a hash and salt - never the password', async () => {
  const info = await createAccount({ name: 'Rana', email: 'Rana@Example.com', password: 'studyhard1' });
  assert.equal(info.email, 'rana@example.com');
  assert.equal(info.name, 'Rana');

  const stored = readStoredAccount();
  assert.ok(stored, 'account persisted');
  assert.equal(stored!.iterations, 210_000);
  const raw = localStorage.getItem(LOCAL_ACCOUNT_KEY)!;
  assert.ok(!raw.includes('studyhard1'), 'the password must never be stored in clear text');
  assert.ok(stored!.salt.length >= 20 && stored!.hash.length >= 20);
  assert.notEqual(stored!.salt, stored!.hash);
});

test('a name is optional: the e-mail prefix is used instead', async () => {
  const info = await createAccount({ name: '   ', email: 'rana@example.com', password: 'studyhard1' });
  assert.equal(info.name, 'rana');
});

test('only one account per device, and a second create is refused clearly', async () => {
  await createAccount({ name: 'A', email: 'a@example.com', password: 'studyhard1' });
  await assert.rejects(() => createAccount({ name: 'B', email: 'b@example.com', password: 'studyhard1' }), /already has an account/);
});

test('sign in accepts the right password and refuses a wrong one', async () => {
  await createAccount({ name: 'Rana', email: 'rana@example.com', password: 'studyhard1' });

  const ok = await verifyPassword('rana@example.com', 'studyhard1');
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.info.email, 'rana@example.com');

  const bad = await verifyPassword('rana@example.com', 'studyhard2');
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.reason, 'mismatch');
    assert.match(bad.message, /Wrong email or password/);
    assert.match(bad.message, /4 attempts left/);
  }
});

test('e-mail is matched case-insensitively but never reveals which field was wrong', async () => {
  await createAccount({ name: 'Rana', email: 'rana@example.com', password: 'studyhard1' });
  const ok = await verifyPassword('RANA@Example.com', 'studyhard1');
  assert.equal(ok.ok, true);

  const wrongEmail = await verifyPassword('other@example.com', 'studyhard1');
  const wrongPassword = await verifyPassword('rana@example.com', 'nope');
  assert.equal(wrongEmail.ok, false);
  assert.equal(wrongPassword.ok, false);
  // Same wording for both, so the form never reveals whether the e-mail exists.
  // (The attempt counter differs because the successful sign-in above reset it.)
  if (!wrongEmail.ok && !wrongPassword.ok) {
    const head = (m: string) => m.replace(/\d+ attempts? left/, 'N attempts left');
    assert.equal(head(wrongEmail.message), head(wrongPassword.message));
  }
});

test('five wrong passwords lock the account for a minute, and the right one clears it', async () => {
  await createAccount({ name: 'Rana', email: 'rana@example.com', password: 'studyhard1' });
  let last;
  for (let i = 0; i < MAX_ATTEMPTS; i++) last = await verifyPassword('rana@example.com', 'wrong-one');
  assert.ok(last && !last.ok);
  if (last && !last.ok) {
    assert.equal(last.reason, 'locked');
    assert.ok(last.retryAt && last.retryAt > Date.now());
  }

  const locked = await verifyPassword('rana@example.com', 'studyhard1');
  assert.equal(locked.ok, false, 'even the correct password waits out the cool-down');
  if (!locked.ok) {
    assert.equal(locked.reason, 'locked');
    assert.match(locked.message, /Try again in \d+s/);
  }

  // Fast-forward the cool-down instead of waiting a real minute.
  const stored = readStoredAccount()!;
  localStorage.setItem(LOCAL_ACCOUNT_KEY, JSON.stringify({ ...stored, lockedUntil: Date.now() - 1, failures: 0 }));
  const after = await verifyPassword('rana@example.com', 'studyhard1');
  assert.equal(after.ok, true);
  assert.equal(readStoredAccount()!.failures, 0);
});

test('signing in before any account exists explains what to do next', async () => {
  const res = await verifyPassword('rana@example.com', 'studyhard1');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.reason, 'no_account');
    assert.match(res.message, /Create one first/);
  }
});

test('changing the password needs the current one and invalidates the old one', async () => {
  await createAccount({ name: 'Rana', email: 'rana@example.com', password: 'studyhard1' });

  await assert.rejects(() => changePassword('wrong', 'studyhard2'), /Current password is wrong/);
  await assert.rejects(() => changePassword('studyhard1', 'short'), /at least 8/);

  await changePassword('studyhard1', 'studyhard2');
  assert.equal((await verifyPassword('rana@example.com', 'studyhard1')).ok, false);
  assert.equal((await verifyPassword('rana@example.com', 'studyhard2')).ok, true);
});

test('rename and delete: name changes, deletion keeps every other key', async () => {
  localStorage.setItem('qmp_history', '[{"id":"1"}]');
  await createAccount({ name: 'Rana', email: 'rana@example.com', password: 'studyhard1' });

  const renamed = renameAccount('  Rana Kumari  ');
  assert.equal(renamed?.name, 'Rana Kumari');
  assert.equal(renameAccount('   ')?.name, 'Rana Kumari', 'an empty name keeps the previous one');

  deleteAccount();
  assert.equal(deviceAccountInfo(), null);
  assert.equal(localStorage.getItem(LOCAL_ACCOUNT_KEY), null);
  assert.equal(localStorage.getItem('qmp_history'), '[{"id":"1"}]', 'quiz data is never touched');
});

test('"keep me signed in" chooses the storage, and signing out clears both', () => {
  const kept = startSession('rana@example.com', true);
  assert.equal(kept.remember, true);
  assert.ok(localStorage.getItem(DEVICE_SESSION_KEY));
  assert.equal(sessionStorage.getItem(DEVICE_SESSION_KEY), null);
  assert.equal(readSession()?.email, 'rana@example.com');

  startSession('rana@example.com', false);
  assert.ok(sessionStorage.getItem(DEVICE_SESSION_KEY), 'a temporary session lives in sessionStorage');
  assert.equal(localStorage.getItem(DEVICE_SESSION_KEY), null, 'and never leaks into the persistent one');

  clearSession();
  assert.equal(readSession(), null);
});

test('the remembered e-mail survives a sign-out so the form can prefill it', async () => {
  await createAccount({ name: 'Rana', email: 'rana@example.com', password: 'studyhard1' });
  rememberEmail(' RANA@example.com ');
  startSession('rana@example.com', true);
  clearSession();
  assert.equal(lastEmail(), 'rana@example.com');
});

test('corrupted storage is treated as "no account" instead of crashing', async () => {
  localStorage.setItem(LOCAL_ACCOUNT_KEY, '{not json');
  assert.equal(readStoredAccount(), null);
  assert.equal(deviceAccountInfo(), null);
  // A fresh account can still be created over the top of the broken value.
  const info = await createAccount({ name: 'Rana', email: 'rana@example.com', password: 'studyhard1' });
  assert.equal(info.email, 'rana@example.com');

  localStorage.setItem(LOCAL_ACCOUNT_KEY, JSON.stringify({ v: 1, email: 'x@y.com', salt: '', hash: '', iterations: 1 }));
  assert.equal(readStoredAccount(), null, 'an incomplete record is not an account');
});

test('the device account id is stable, opaque and email-only', () => {
  assert.equal(deviceAccountId('rana@example.com'), deviceAccountId(' RANA@Example.com '));
  assert.notEqual(deviceAccountId('rana@example.com'), deviceAccountId('other@example.com'));
  assert.match(deviceAccountId('rana@example.com'), /^device_[a-z0-9]+$/);
  assert.ok(!deviceAccountId('rana@example.com').includes('@'));
});

test('WebCrypto detection reports what the runtime can really do', () => {
  assert.equal(deviceAccountSupported(), true);
  assert.equal(typeof webcrypto.subtle.deriveBits, 'function');
});

test('a record written before 3.1.0 (no version field) still signs the user in', async () => {
  await createAccount({ name: 'Rana', email: 'rana@example.com', password: 'studyhard1' });
  const stored = readStoredAccount()!;
  const { v: _drop, ...legacy } = stored;
  localStorage.setItem(LOCAL_ACCOUNT_KEY, JSON.stringify(legacy));

  const res = await verifyPassword('rana@example.com', 'studyhard1');
  assert.equal(res.ok, true, 'an older account must not become unreachable');
});

test('account health names what is wrong, without exposing the password', async () => {
  assert.deepEqual(accountHealth().state, 'none');

  await createAccount({ name: 'Rana', email: 'rana@example.com', password: 'studyhard1' });
  const healthy = accountHealth();
  assert.equal(healthy.state, 'ok');
  assert.match(healthy.detail, /rana@example\.com/);
  assert.match(healthy.detail, /210000|210_000/);
  assert.ok(!healthy.detail.includes('studyhard1'));

  // A session left behind for an account that no longer exists.
  startSession('ghost@example.com', true);
  assert.equal(accountHealth().state, 'session-orphan');
  assert.match(accountHealth().detail, /ghost@example\.com/);

  localStorage.setItem(LOCAL_ACCOUNT_KEY, '{{{');
  assert.equal(accountHealth().state, 'unreadable');
});
