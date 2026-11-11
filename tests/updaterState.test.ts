import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDigest, isTrustedDownloadUrl, summarizeNotes, formatBytes, parseRelease, hasUpdate, __resetUpdateState,
  getUpdateState, onNativeUpdateEvent, runUpdateCheck, startNativeUpdate, dismissUpdateError,
} from '../src/platform/updater';
import { computeRank } from '../src/utils/rank';
import { squareCrop, validateAvatarFile, AvatarError } from '../src/utils/avatarImage';

beforeEach(() => { localStorage.clear(); __resetUpdateState({ current: '2.6.0' }); });

const HEX = 'a'.repeat(64);
const rel = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag, html_url: `https://github.com/therjmali/quiz-master-pro/releases/tag/${tag}`, body: '## What\'s new\n- one\n- two',
  assets: [{ name: `RJ-QUIZ-${tag}.apk`, browser_download_url: `https://github.com/therjmali/quiz-master-pro/releases/download/${tag}/RJ-QUIZ-${tag}.apk`, size: 6_000_000, digest: `sha256:${HEX.toUpperCase()}` }], ...extra,
});
const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

test('normalizeDigest accepts sha256: prefix or bare hex, lower-cases, rejects junk', () => {
  assert.equal(normalizeDigest(`sha256:${HEX.toUpperCase()}`), HEX);
  assert.equal(normalizeDigest(HEX), HEX);
  assert.equal(normalizeDigest('sha256:abc'), null);
  assert.equal(normalizeDigest(undefined), null);
  assert.equal(normalizeDigest('md5:' + 'a'.repeat(32)), null);
});

test('isTrustedDownloadUrl: only https github.com release downloads of this repo', () => {
  const base = 'https://github.com/therjmali/quiz-master-pro/releases/download/v2.7.0/x.apk';
  assert.equal(isTrustedDownloadUrl(base), true);
  assert.equal(isTrustedDownloadUrl(base.replace('https', 'http')), false);
  assert.equal(isTrustedDownloadUrl('https://github.com/evil/quiz-master-pro/releases/download/v1/x.apk'), false);
  assert.equal(isTrustedDownloadUrl('https://github.com.evil.example/therjmali/quiz-master-pro/releases/download/v1/x.apk'), false);
  assert.equal(isTrustedDownloadUrl('https://github.com/therjmali/quiz-master-pro/archive/main.zip'), false);
  assert.equal(isTrustedDownloadUrl('https://github.com/therjmali/quiz-master-pro-fork/releases/download/v1/x.apk'), false);
  assert.equal(isTrustedDownloadUrl(null), false);
  assert.equal(isTrustedDownloadUrl('not a url'), false);
});

test('parseRelease carries the SHA-256 and prefers the RJ-QUIZ release APK over debug/unsigned', () => {
  const r = parseRelease(rel('v2.7.0', { assets: [
    { name: 'app-debug.apk', browser_download_url: 'https://x/debug.apk' },
    { name: 'RJ-QUIZ-v2.7.0.apk', browser_download_url: 'https://github.com/therjmali/quiz-master-pro/releases/download/v2.7.0/RJ-QUIZ-v2.7.0.apk', size: 5, digest: `sha256:${HEX}` },
  ] }))!;
  assert.equal(r.sha256, HEX);
  assert.ok(r.apkUrl!.endsWith('RJ-QUIZ-v2.7.0.apk'));
  assert.equal(parseRelease(rel('v2.7.0', { assets: [{ name: 'a.apk', browser_download_url: 'https://x/a.apk', digest: 'nope' }] }))!.sha256, null);
});

test('summarizeNotes keeps what is new, caps length, survives null', () => {
  assert.equal(summarizeNotes(null), '');
  assert.equal(summarizeNotes("intro line\n## What's new\n- a\n\n- b"), '- a\n- b');
  assert.ok(summarizeNotes('x\n'.repeat(500)).length <= 1200);
});

test('formatBytes', () => {
  assert.equal(formatBytes(null), '');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(6_291_456), '6.0 MB');
});

test('runUpdateCheck: available -> hasUpdate; latest -> not; errors are quiet when silent', async () => {
  let s = await runUpdateCheck({ fetchImpl: ok(rel('v2.7.0')) });
  assert.equal(s.phase, 'available'); assert.equal(hasUpdate(s), true); assert.equal(s.info!.version, '2.7.0');
  __resetUpdateState({ current: '2.7.0' });
  s = await runUpdateCheck({ fetchImpl: ok(rel('v2.7.0')) });
  assert.equal(s.phase, 'uptodate'); assert.equal(hasUpdate(s), false);
  __resetUpdateState({ current: '2.6.0' });
  const boom = async () => { throw new Error('net'); };
  s = await runUpdateCheck({ fetchImpl: boom, silent: true });
  assert.equal(s.phase, 'idle'); assert.equal(s.error, null);
  s = await runUpdateCheck({ fetchImpl: boom });
  assert.equal(s.phase, 'error'); assert.ok(s.error);
  dismissUpdateError();
  assert.equal(getUpdateState().phase, 'idle');
});

test('native events drive the state machine; progress is clamped', () => {
  __resetUpdateState({ current: '2.6.0', phase: 'downloading', totalBytes: 100 });
  onNativeUpdateEvent({ state: 'downloading', done: 40, total: 100 });
  assert.equal(getUpdateState().progress, 0.4);
  onNativeUpdateEvent({ state: 'downloading', done: 500, total: 100 });
  assert.equal(getUpdateState().progress, 1);
  onNativeUpdateEvent({ state: 'verifying' }); assert.equal(getUpdateState().phase, 'verifying');
  onNativeUpdateEvent({ state: 'ready' }); assert.equal(getUpdateState().phase, 'ready');
  onNativeUpdateEvent({ state: 'needs_permission' }); assert.equal(getUpdateState().phase, 'needs-permission');
  onNativeUpdateEvent({ state: 'error', error: 'Checksum mismatch' });
  assert.equal(getUpdateState().phase, 'error'); assert.equal(getUpdateState().error, 'Checksum mismatch');
});

test('startNativeUpdate refuses clearly without a bridge or with an untrusted link', () => {
  __resetUpdateState({ current: '2.6.0', phase: 'available', info: { version: '2.7.0', notes: '', apkUrl: 'https://github.com/therjmali/quiz-master-pro/releases/download/v2.7.0/a.apk', pageUrl: 'x', publishedAt: null, sizeBytes: 1, sha256: null } });
  startNativeUpdate(); // no QmNative bridge under Node
  assert.equal(getUpdateState().phase, 'error');
  assert.match(getUpdateState().error!, /cannot be updated inside the app/);
  const calls: string[][] = [];
  (globalThis as any).QmNative = { downloadUpdate: (u: string, h: string) => calls.push([u, h]) };
  __resetUpdateState({ current: '2.6.0', phase: 'available', info: { version: '2.7.0', notes: '', apkUrl: 'https://evil.example/a.apk', pageUrl: 'x', publishedAt: null, sizeBytes: 1, sha256: HEX } });
  startNativeUpdate();
  assert.equal(calls.length, 0); assert.match(getUpdateState().error!, /not from the official/);
  __resetUpdateState({ current: '2.6.0', phase: 'available', info: { version: '2.7.0', notes: '', apkUrl: 'https://github.com/therjmali/quiz-master-pro/releases/download/v2.7.0/a.apk', pageUrl: 'x', publishedAt: null, sizeBytes: 9, sha256: HEX } });
  startNativeUpdate();
  assert.deepEqual(calls, [['https://github.com/therjmali/quiz-master-pro/releases/download/v2.7.0/a.apk', HEX]]);
  assert.equal(getUpdateState().phase, 'downloading');
  delete (globalThis as any).QmNative;
});

test('computeRank: thresholds, progress and top rank', () => {
  assert.equal(computeRank(0, 0).key, 'beginner');
  assert.equal(computeRank(5, 60).key, 'intermediate');
  assert.equal(computeRank(5, 59).key, 'beginner');
  assert.equal(computeRank(10, 80).key, 'master');
  assert.equal(computeRank(50, 79).key, 'intermediate');
  const mid = computeRank(2, 30); // 2 of 5 quizzes (40%) and 30 of 60% accuracy (50%) -> mean 45%
  assert.equal(mid.next!.key, 'intermediate'); assert.equal(Math.round(mid.progress * 100), 45);
  assert.equal(mid.quizzesLeft, 3); assert.equal(mid.accuracyLeft, 30);
  const top = computeRank(99, 99); assert.equal(top.next, null); assert.equal(top.progress, 1);
  assert.equal(computeRank(NaN, NaN).key, 'beginner');
});

test('avatar: square crop is centred; bad files are rejected with friendly errors', () => {
  assert.deepEqual(squareCrop(400, 200), { sx: 100, sy: 0, side: 200 });
  assert.deepEqual(squareCrop(200, 400), { sx: 0, sy: 100, side: 200 });
  assert.deepEqual(squareCrop(0, 0), { sx: 0, sy: 0, side: 1 });
  assert.throws(() => validateAvatarFile({ type: 'application/pdf', size: 10 }), AvatarError);
  assert.throws(() => validateAvatarFile({ type: 'image/png', size: 50 * 1024 * 1024 }), AvatarError);
  assert.doesNotThrow(() => validateAvatarFile({ type: 'image/jpeg', size: 1000 }));
});

test('forgetStoredSession removes the saved sign-in from both storages (sign-out works offline)', async () => {
  const { forgetStoredSession } = await import('../src/platform/cloud/authStore');
  const { AUTH_STORAGE_KEY } = await import('../src/platform/cloud/supabase');
  localStorage.setItem(AUTH_STORAGE_KEY, '{"a":1}'); sessionStorage.setItem(AUTH_STORAGE_KEY, '{"a":1}'); localStorage.setItem(`${AUTH_STORAGE_KEY}-user`, '{}'); localStorage.setItem('keep-me', '1');
  forgetStoredSession();
  assert.equal(localStorage.getItem(AUTH_STORAGE_KEY), null); assert.equal(sessionStorage.getItem(AUTH_STORAGE_KEY), null);
  assert.equal(localStorage.getItem(`${AUTH_STORAGE_KEY}-user`), null); assert.equal(localStorage.getItem('keep-me'), '1');
});
