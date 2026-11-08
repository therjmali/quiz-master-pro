import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, parseRelease, checkForUpdate, shouldAutoCheck, dismissUpdate, isDismissed } from '../src/platform/updater';

beforeEach(() => localStorage.clear());

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag, html_url: 'https://github.com/therjmali/quiz-master-pro/releases/tag/' + tag, body: 'notes',
  assets: [{ name: `RJ-QUIZ-${tag}.apk`, browser_download_url: `https://github.com/x/${tag}.apk`, size: 6_000_000 }], ...extra,
});
const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

test('compareVersions: numeric, not lexicographic', () => {
  assert.equal(compareVersions('2.10.0', '2.9.9'), 1);
  assert.equal(compareVersions('v2.4.0', '2.4.0'), 0);
  assert.equal(compareVersions('2.3.1', '2.4.0'), -1);
  assert.equal(compareVersions('2.4', '2.4.0'), 0);
  assert.equal(compareVersions('3.0.0-beta.1', '2.9.9'), 1);
});

test('parseRelease: needs a version tag; ignores drafts, prereleases and non-APK assets', () => {
  assert.equal(parseRelease(null), null);
  assert.equal(parseRelease(release('nightly')), null);
  assert.equal(parseRelease(release('v2.5.0', { draft: true })), null);
  assert.equal(parseRelease(release('v2.5.0', { prerelease: true })), null);
  const r = parseRelease(release('v2.5.0'))!;
  assert.equal(r.version, '2.5.0');
  assert.equal(r.apkUrl, 'https://github.com/x/v2.5.0.apk');
  assert.equal(parseRelease({ tag_name: 'v2.5.0', assets: [{ name: 'notes.txt', browser_download_url: 'https://x/y.txt' }] })!.apkUrl, null);
  assert.equal(parseRelease(release('v2.5.0', { html_url: 'http://evil.example/x' }))!.pageUrl.startsWith('https://github.com/'), true);
});

test('checkForUpdate: update / latest / offline / errors', async () => {
  assert.equal((await checkForUpdate({ fetchImpl: ok(release('v2.5.0')), current: '2.4.0', online: true })).status, 'update');
  assert.equal((await checkForUpdate({ fetchImpl: ok(release('v2.4.0')), current: '2.4.0', online: true })).status, 'latest');
  assert.equal((await checkForUpdate({ fetchImpl: ok(release('v2.3.0')), current: '2.4.0', online: true })).status, 'latest');
  assert.equal((await checkForUpdate({ current: '2.4.0', online: false })).status, 'offline');
  const limited = await checkForUpdate({ fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }), current: '2.4.0', online: true });
  assert.equal(limited.status, 'error');
  const boom = await checkForUpdate({ fetchImpl: async () => { throw new Error('net'); }, current: '2.4.0', online: true });
  assert.equal(boom.status, 'error');
  const junk = await checkForUpdate({ fetchImpl: ok({ nope: 1 }), current: '2.4.0', online: true });
  assert.equal(junk.status, 'error');
});

test('auto-check is throttled to once per 12 h and dismissal is per version', async () => {
  assert.equal(shouldAutoCheck(), true);
  await checkForUpdate({ fetchImpl: ok(release('v2.5.0')), current: '2.4.0', online: true });
  assert.equal(shouldAutoCheck(), false);
  assert.equal(shouldAutoCheck(Date.now() + 13 * 3600_000), true);
  dismissUpdate('2.5.0');
  assert.equal(isDismissed('2.5.0'), true);
  assert.equal(isDismissed('2.6.0'), false);
});
