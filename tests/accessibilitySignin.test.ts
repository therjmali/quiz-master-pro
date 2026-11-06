import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchSettings, SECTION_ORDER, SECTION_META } from '../src/components/profile/settings/settingsSearch';
import { accountName } from '../src/platform/cloud/accountName';
import { OPEN_SIGNIN_EVENT, SIGNIN_CARD_HIDE_MS, openSignIn, shouldShowSignInCard, type SignInRequest } from '../src/platform/cloud/signInWindow';

// zoom.ts paints on import, so the DOM stub must exist first.
const painted: Record<string, string> = {};
const classes = new Set<string>();
(globalThis as any).document.documentElement = {
  style: { setProperty: (k: string, v: string) => { painted[k] = v; }, removeProperty: (k: string) => { delete painted[k]; } },
  classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
};
const zoom = await import('../src/platform/zoom');

beforeEach(() => { localStorage.clear(); zoom.applyZoom(); });

test('zoom: clamps to 70-150 in 5% steps and survives junk', () => {
  assert.equal(zoom.clampZoom(10), 70);
  assert.equal(zoom.clampZoom(999), 150);
  assert.equal(zoom.clampZoom(112), 110);
  assert.equal(zoom.clampZoom(113), 115);
  assert.equal(zoom.clampZoom(NaN), 100);
  assert.equal(zoom.clampZoom(Infinity), 100);
});

test('zoom: in/out stop at the limits', () => {
  zoom.setZoom(150); assert.equal(zoom.zoomIn(), 150);
  zoom.setZoom(70); assert.equal(zoom.zoomOut(), 70);
  zoom.setZoom(100); assert.equal(zoom.zoomIn(), 105); assert.equal(zoom.zoomOut(), 100);
});

test('zoom: persists, repaints and resets', () => {
  zoom.setZoom(130);
  assert.equal(localStorage.getItem(zoom.ZOOM_KEY), '130');
  assert.equal(painted['zoom'], '1.3');
  assert.ok(classes.has('qmp-zoomed'));
  zoom.applyZoom(); // simulates an app restart
  assert.equal(zoom.getZoom(), 130);
  zoom.resetZoom();
  assert.equal(zoom.getZoom(), 100);
  assert.equal(painted['zoom'], undefined);
  assert.ok(!classes.has('qmp-zoomed'));
});

test('zoom: corrupted stored value falls back to 100', () => {
  localStorage.setItem(zoom.ZOOM_KEY, 'banana'); zoom.applyZoom(); assert.equal(zoom.getZoom(), 100);
  localStorage.setItem(zoom.ZOOM_KEY, '-40'); zoom.applyZoom(); assert.equal(zoom.getZoom(), 100);
  localStorage.setItem(zoom.ZOOM_KEY, '9000'); zoom.applyZoom(); assert.equal(zoom.getZoom(), 150);
});

test('zoom: every preset is a valid step inside the range', () => {
  for (const p of zoom.ZOOM_PRESETS) assert.equal(zoom.clampZoom(p.value), p.value);
});

test('zoom shortcuts: only Ctrl/Cmd combos, never Alt or already-handled keys', () => {
  const k = (key: string, o: Record<string, boolean> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, ...o });
  assert.equal(zoom.zoomActionForKey(k('=', { ctrlKey: true })), 'in');
  assert.equal(zoom.zoomActionForKey(k('+', { metaKey: true })), 'in');
  assert.equal(zoom.zoomActionForKey(k('-', { ctrlKey: true })), 'out');
  assert.equal(zoom.zoomActionForKey(k('0', { ctrlKey: true })), 'reset');
  assert.equal(zoom.zoomActionForKey(k('=')), null);
  assert.equal(zoom.zoomActionForKey(k('=', { ctrlKey: true, altKey: true })), null);
  assert.equal(zoom.zoomActionForKey(k('=', { ctrlKey: true, defaultPrevented: true })), null);
  assert.equal(zoom.zoomActionForKey(k('a', { ctrlKey: true })), null);
});

test('settings: Accessibility section exists, is ordered, and zoom is searchable', () => {
  assert.ok(SECTION_ORDER.includes('accessibility'));
  assert.equal(SECTION_META.accessibility.title, 'Accessibility');
  assert.equal(new Set(SECTION_ORDER).size, SECTION_ORDER.length);
  for (const q of ['zoom', 'zoom in', 'magnify', 'accessibility']) {
    assert.ok(searchSettings(q).some(h => h.entry.id === 'zoom' && h.entry.section === 'accessibility'), `"${q}" should find zoom`);
  }
  assert.ok(!searchSettings('zoom').some(h => h.entry.id === 'fontSize'), 'zoom must not point at the text-size row');
});

test('sign-in window: openSignIn fires the event with the requested mode', () => {
  const seen: (SignInRequest | undefined)[] = [];
  const on = (e: Event) => seen.push((e as CustomEvent<SignInRequest>).detail);
  window.addEventListener(OPEN_SIGNIN_EVENT, on);
  openSignIn(); openSignIn('signup');
  window.removeEventListener(OPEN_SIGNIN_EVENT, on);
  assert.deepEqual(seen, [{ mode: 'signin' }, { mode: 'signup' }]);
});

test('dashboard sign-in card: hidden for a week after dismiss, then back', () => {
  const now = 1_800_000_000_000;
  assert.equal(shouldShowSignInCard(0, now), true);
  assert.equal(shouldShowSignInCard(NaN, now), true);
  assert.equal(shouldShowSignInCard(now - 1000, now), false);
  assert.equal(shouldShowSignInCard(now - SIGNIN_CARD_HIDE_MS + 1, now), false);
  assert.equal(shouldShowSignInCard(now - SIGNIN_CARD_HIDE_MS, now), true);
});

test('account name: saved name, else e-mail prefix, else empty', () => {
  assert.equal(accountName('  Rana ', 'x@y.com'), 'Rana');
  assert.equal(accountName('', 'rana@y.com'), 'rana');
  assert.equal(accountName(undefined, undefined), '');
});
