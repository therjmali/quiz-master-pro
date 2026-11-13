import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetOverlayStack, LAYER_Z, closeTopOverlay, overlayCount, popOverlay, pushOverlay,
  requestClose, topOverlayId, lockPageScroll, unlockPageScroll,
} from '../src/lib/overlayStack';
import { __clearBackHandlers, handleBack, registerBackHandler } from '../src/platform/backButton';
import { __resetScreenLock, isScreenLocked, popScreenLock, pushScreenLock } from '../src/lib/screenLock';

const reset = () => { __resetOverlayStack(); __clearBackHandlers(); __resetScreenLock(); };

test('overlays stack in order and only the top one closes', () => {
  reset();
  let closed: string[] = [];
  const sheet = pushOverlay(() => closed.push('sheet'), 'sheet');
  const dialog = pushOverlay(() => closed.push('dialog'), 'dialog');

  assert.equal(overlayCount(), 2);
  assert.equal(topOverlayId(), dialog.id, 'the dialog is on top');

  // A stray Escape inside the sheet must not close it while the dialog is above it.
  assert.equal(requestClose(sheet.id), false);
  assert.equal(closed.length, 0);

  assert.equal(requestClose(dialog.id), true);
  assert.deepEqual(closed, ['dialog']);

  popOverlay(dialog.id);
  assert.equal(overlayCount(), 1);
  assert.equal(closeTopOverlay(), true);
  assert.deepEqual(closed, ['dialog', 'sheet']);
});

test('a popup opened inside a full-screen panel always lands above it', () => {
  reset();
  const panel = pushOverlay(() => {}, 'panel');            // report preview / Sync Center
  const sheet = pushOverlay(() => {}, 'sheet', panel.z);   // sheet opened from inside it
  const dialog = pushOverlay(() => {}, 'dialog', sheet.z); // confirmation from the sheet
  assert.ok(sheet.z > panel.z, `sheet ${sheet.z} must beat panel ${panel.z}`);
  assert.ok(dialog.z > sheet.z, `dialog ${dialog.z} must beat sheet ${sheet.z}`);
  assert.equal(dialog.z, sheet.z + 10);
});

test('an overlay is always above the bottom navigation', () => {
  reset();
  const navZ = 100; // --qmp-z-nav
  for (const layer of Object.keys(LAYER_Z)) {
    const { z } = pushOverlay(() => {}, layer);
    assert.ok(z > navZ, `${layer} (${z}) must be above the bottom nav (${navZ})`);
  }
});

test('a non-dismissable overlay ignores Escape and back', () => {
  reset();
  pushOverlay(undefined, 'blocking');
  assert.equal(closeTopOverlay(), false);
  assert.equal(requestClose(topOverlayId()!), false);
  assert.equal(handleBack(), false);
});

test('the hardware back button closes the top overlay before anything else', () => {
  reset();
  const ran: string[] = [];
  registerBackHandler(() => { ran.push('screen'); return true; });
  pushOverlay(() => ran.push('overlay'), 'sheet');
  assert.equal(handleBack(), true);
  assert.deepEqual(ran, ['overlay'], 'the popup gets the press first');
  assert.equal(handleBack(), true);
  assert.deepEqual(ran, ['overlay', 'overlay'], 'a real close unmounts it; the fake one stays registered');
  popOverlay(topOverlayId()!);
  assert.equal(handleBack(), true);
  assert.deepEqual(ran, ['overlay', 'overlay', 'screen'], 'then the screen handler');
});

test('handlers are newest-first and a throwing handler never blocks the chain', () => {
  reset();
  const ran: string[] = [];
  registerBackHandler(() => { ran.push('old'); return true; });
  registerBackHandler(() => { throw new Error('boom'); });
  const off = registerBackHandler(() => { ran.push('new'); return true; });
  assert.equal(handleBack(), true);
  assert.deepEqual(ran, ['new'], 'newest handler wins');
  off();                                   // unsubscribe
  assert.equal(handleBack(), true);
  assert.deepEqual(ran, ['new', 'old'], 'the older handler takes over afterwards');
});

test('popOverlay is idempotent (double-close never corrupts the stack)', () => {
  reset();
  const a = pushOverlay(() => {}, 'sheet');
  const b = pushOverlay(() => {}, 'sheet');
  popOverlay(b.id);
  popOverlay(b.id);
  assert.equal(overlayCount(), 1);
  assert.equal(topOverlayId(), a.id);
});

test('page scroll lock is reference counted and restores the previous values', () => {
  reset();
  const doc = globalThis.document as unknown as {
    documentElement: { style: Record<string, unknown>; classList: { add(): void; remove(): void } };
    body?: { style: Record<string, unknown> };
  };
  doc.documentElement.style = { overflow: 'auto' };
  doc.documentElement.classList = { add() {}, remove() {} };
  doc.body = { style: { overflow: 'scroll', paddingRight: '4px' } };

  lockPageScroll();
  assert.equal(doc.documentElement.style.overflow, 'hidden');
  lockPageScroll();               // second overlay
  unlockPageScroll();             // closing one must NOT unlock the page
  assert.equal(doc.documentElement.style.overflow, 'hidden', 'still locked while another popup is open');
  unlockPageScroll();
  assert.equal(doc.documentElement.style.overflow, 'auto', 'original value restored');
  assert.equal(doc.body.style.overflow, 'scroll');
  assert.equal(doc.body.style.paddingRight, '4px');
  unlockPageScroll();             // extra unlock is harmless
  assert.equal(doc.documentElement.style.overflow, 'auto');
});

test('screen lock pauses gestures while a full-screen surface is in front', () => {
  reset();
  assert.equal(isScreenLocked(), false);
  pushScreenLock();
  pushScreenLock();
  popScreenLock();
  assert.equal(isScreenLocked(), true);
  popScreenLock();
  assert.equal(isScreenLocked(), false);
  popScreenLock();                // never goes negative
  assert.equal(isScreenLocked(), false);
});
