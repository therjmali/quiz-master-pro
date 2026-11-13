import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const g = globalThis as Record<string, unknown>;
assert.equal(typeof webcrypto.subtle.deriveBits, 'function');
if (typeof g.atob !== 'function') g.atob = (b: string) => Buffer.from(b, 'base64').toString('binary');
if (typeof g.btoa !== 'function') g.btoa = (b: string) => Buffer.from(b, 'binary').toString('base64');

/**
 * The auth store with no Supabase project - the configuration the Android APK actually ships with.
 * These tests exist because the previous behaviour in exactly this build was a form that could never
 * succeed: `isCloudConfigured()` was false, so signing in threw and nothing was created on the device.
 */
const auth = await import('../src/platform/cloud/authStore');
const local = await import('../src/platform/account/localAccount');
const account = await import('../src/platform/cloud/accountView');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  auth.clearAuthMessages();
  auth.__resetAuthForTests();
});

test('an unconfigured build offers a device account, not a dead cloud form', () => {
  const state = auth.getAuthState();
  assert.equal(state.configured, false);
  assert.equal(state.mode, 'device');
  assert.equal(state.status, 'signed-out');
});

test('create account on the device signs the user in and becomes the app account', async () => {
  const created = await auth.signUp('Rana', 'rana@example.com', 'studyhard1', true);
  assert.equal(created, true);

  const state = auth.getAuthState();
  assert.equal(state.status, 'signed-in');
  assert.equal(state.mode, 'device');
  assert.equal(state.user?.email, 'rana@example.com');
  assert.equal(state.user?.name, 'Rana');
  assert.match(state.user!.id, /^device_/);

  // Every screen reads the account through this view.
  const view = account.viewFromAuth(state);
  assert.equal(view.signedIn, true);
  assert.equal(view.source, 'device');
  assert.equal(view.name, 'Rana');
});

test('sign out then sign back in with the same password', async () => {
  await auth.signUp('Rana', 'rana@example.com', 'studyhard1');
  await auth.signOut('local');
  assert.equal(auth.getAuthState().status, 'signed-out');
  assert.equal(auth.getAuthState().deviceEmail, 'rana@example.com', 'the account stays on the device');

  assert.equal(await auth.signIn('rana@example.com', 'studyhard1'), true);
  assert.equal(auth.getAuthState().status, 'signed-in');

  await auth.signOut('local');
  assert.equal(await auth.signIn('rana@example.com', 'wrong-password'), false);
  assert.match(auth.getAuthState().error ?? '', /Wrong email or password/);
});

test('a failed sign-in always leaves a precise, human reason - never silence', async () => {
  const noAccount = await auth.signIn('nobody@example.com', 'studyhard1');
  assert.equal(noAccount, false);
  assert.match(auth.getAuthState().error ?? '', /No account exists on this device/);
  assert.match(auth.getAuthState().notice ?? '', /Create the account below/);

  await auth.signUp('Rana', 'rana@example.com', 'studyhard1');
  await auth.signOut('local');
  assert.equal(await auth.signIn('rana@example.com', 'nope-nope-nope'), false);
  assert.match(auth.getAuthState().error ?? '', /Wrong email or password/);

  assert.equal(await auth.signIn('not-an-email', 'studyhard1'), false);
  assert.match(auth.getAuthState().error ?? '', /valid email/);

  assert.equal(await auth.signIn('rana@example.com', ''), false);
  assert.match(auth.getAuthState().error ?? '', /Enter your password/);
});

test('validation runs before any hashing: weak passwords and bad emails are refused', async () => {
  assert.equal(await auth.signUp('Rana', 'nope', 'studyhard1'), false);
  assert.match(auth.getAuthState().error ?? '', /valid email/);

  assert.equal(await auth.signUp('Rana', 'rana@example.com', 'short'), false);
  assert.match(auth.getAuthState().error ?? '', /at least 8/);

  assert.equal(local.deviceAccountInfo(), null, 'nothing was created');
});

test('"forgot password" tells the truth instead of pretending to send mail', async () => {
  assert.equal(await auth.requestPasswordReset('rana@example.com'), false);
  assert.match(auth.getAuthState().error ?? '', /No account exists on this device/);

  await auth.signUp('Rana', 'rana@example.com', 'studyhard1');
  await auth.requestPasswordReset('rana@example.com');
  assert.match(auth.getAuthState().error ?? '', /no reset e-mail/);
});

test('change password verifies the current one, and the name can be edited', async () => {
  await auth.signUp('Rana', 'rana@example.com', 'studyhard1');

  assert.equal(await auth.changePassword('studyhard2', 'not-the-old-one'), false);
  assert.match(auth.getAuthState().error ?? '', /Current password is wrong/);

  assert.equal(await auth.changePassword('studyhard2', 'studyhard1'), true);
  await auth.signOut('local');
  assert.equal(await auth.signIn('rana@example.com', 'studyhard2'), true);

  assert.equal(await auth.updateDisplayName('  Rana Kumari '), true);
  assert.equal(auth.getAuthState().user?.name, 'Rana Kumari');
});

test('deleting the account keeps the quiz data on the device', async () => {
  localStorage.setItem('qmp_history', '[{"timestamp":1}]');
  await auth.signUp('Rana', 'rana@example.com', 'studyhard1');

  assert.equal(await auth.deleteAccount(), true);
  assert.equal(auth.getAuthState().status, 'signed-out');
  assert.equal(auth.getAuthState().deviceEmail, null);
  assert.equal(local.deviceAccountInfo(), null);
  assert.equal(localStorage.getItem('qmp_history'), '[{"timestamp":1}]');
});

test('a signed-in session survives an app restart (the APK is closed and reopened)', async () => {
  await auth.signUp('Rana', 'rana@example.com', 'studyhard1', true);
  auth.__resetAuthForTests();

  // What boot does: restore the session that was written to storage.
  const session = local.readSession();
  assert.equal(session?.email, 'rana@example.com');
  const info = local.deviceAccountInfo();
  assert.equal(info?.name, 'Rana');
});

test('a stale session (account deleted elsewhere) is not honoured on boot', () => {
  local.startSession('ghost@example.com', true);
  assert.equal(local.deviceAccountInfo(), null, 'no account exists');
  const view = account.viewFromAuth(auth.getAuthState());
  assert.equal(view.signedIn, false);
});

test('friendlyAuthError explains a missing cloud instead of blaming the user', async () => {
  const config = await import('../src/platform/cloud/config');
  const message = auth.friendlyAuthError(new config.CloudConfigError('Cloud sync is not set up in this build.'));
  assert.match(message, /kept on this device/);
  assert.equal(auth.friendlyAuthError(new Error('Invalid login credentials')), 'Wrong email or password.');
});
