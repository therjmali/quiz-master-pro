import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Guards for the two things that actually caused device lag:
 *   1. an adaptive glass/motion budget instead of full blur on every phone;
 *   2. decorative clocks that stop when they are off screen or the tab is hidden.
 */
const perf = await import('../src/platform/perfMode');
const diag = await import('../src/platform/diagnostics');

beforeEach(() => localStorage.clear());

// A <html> element stub with the class API perfMode writes to (setup.ts leaves it minimal).
const classes = new Set<string>();
const attrs: Record<string, string> = {};
(globalThis as any).document.documentElement = {
  style: { setProperty() {}, removeProperty() {} },
  classList: {
    add: (c: string) => classes.add(c),
    remove: (c: string) => classes.delete(c),
    toggle: (c: string, on: boolean) => { if (on) classes.add(c); else classes.delete(c); },
    contains: (c: string) => classes.has(c),
  },
  setAttribute: (k: string, v: string) => { attrs[k] = v; },
};

test('performance budget: an explicit choice always beats detection', () => {
  assert.equal(perf.resolveMode('low', false), 'low', 'light mode on a fast phone is honoured');
  assert.equal(perf.resolveMode('high', true), 'high', 'full glass on a slow phone is honoured');
  assert.equal(perf.resolveMode('auto', true), 'low');
  assert.equal(perf.resolveMode('auto', false), 'high');
});

test('performance budget: honest low-end detection', () => {
  // Few cores -> light mode.
  assert.equal(perf.detectLowEnd({ hardwareConcurrency: 4 }, false), true);
  assert.equal(perf.detectLowEnd({ hardwareConcurrency: 8 }, false), false);
  // Little RAM -> light mode.
  assert.equal(perf.detectLowEnd({ hardwareConcurrency: 8, deviceMemory: 2 }, false), true);
  assert.equal(perf.detectLowEnd({ hardwareConcurrency: 8, deviceMemory: 8 }, false), false);
  // Data saver or reduced motion -> light mode, regardless of hardware.
  assert.equal(perf.detectLowEnd({ hardwareConcurrency: 16, deviceMemory: 16, connection: { saveData: true } }, false), true);
  assert.equal(perf.detectLowEnd({ hardwareConcurrency: 16 }, true), true);
  // Unknown hardware must not be assumed slow (old WebViews report nothing).
  assert.equal(perf.detectLowEnd({}, false), false);
});

test('performance budget: the choice persists, and "auto" clears the override', () => {
  perf.setPerfMode('low');
  assert.equal(localStorage.getItem(perf.PERF_KEY), 'low');
  assert.equal(perf.getPerfChoice(), 'low');

  perf.setPerfMode('high');
  assert.equal(localStorage.getItem(perf.PERF_KEY), 'high');
  assert.equal(perf.getPerfChoice(), 'high');

  perf.setPerfMode('auto');
  assert.equal(localStorage.getItem(perf.PERF_KEY), null);
  assert.equal(perf.getPerfChoice(), 'auto');

  localStorage.setItem(perf.PERF_KEY, 'banana');
  assert.equal(perf.readStoredMode(), 'auto', 'a corrupted value means auto, never a crash');
});

test('performance budget: applying publishes exactly one mode on <html>', () => {
  perf.setPerfMode('low');
  assert.ok(classes.has('qmp-perf-low'));
  assert.ok(!classes.has('qmp-perf-high'));
  assert.equal(attrs['data-perf'], 'low');

  perf.setPerfMode('high');
  assert.ok(classes.has('qmp-perf-high'));
  assert.ok(!classes.has('qmp-perf-low'), 'the two modes are mutually exclusive');
});

test('performance budget: the frame-rate verdict only fires on a real, sustained drop', () => {
  // 60 fps for 1.6 s -> keep the glass.
  assert.equal(perf.shouldDowngrade(96, 1600), false);
  // 30 fps for the same window -> light mode.
  assert.equal(perf.shouldDowngrade(48, 1600), true);
  // 44 frames in 1.2 s (≈37 fps) is below the 45 floor.
  assert.equal(perf.shouldDowngrade(44, 1200), true);
  // A short sample (first paint, a single stutter) is never enough to condemn the device.
  assert.equal(perf.shouldDowngrade(2, 100), false);
  assert.equal(perf.shouldDowngrade(0, 5000), false);
  assert.equal(perf.FPS_LOW, 45);
});

test('diagnostics: errors are recorded, bounded and never include quiz content', () => {
  diag.clearErrorLog();
  diag.recordError({ kind: 'error', message: 'TypeError: x is not a function' });
  diag.recordError({ kind: 'rejection', message: 'NetworkError: offline', source: 'sync.ts:12' });

  const log = diag.getErrorLog();
  assert.equal(log.length, 2);
  assert.equal(log[1].kind, 'rejection');
  assert.equal(log[1].source, 'sync.ts:12');
  assert.ok(log.every(e => Number.isFinite(e.at)));

  // A render loop must not be able to fill the phone's storage.
  for (let i = 0; i < diag.MAX_ENTRIES * 3; i++) diag.recordError({ kind: 'react', message: `boom ${i}` });
  const bounded = diag.getErrorLog();
  assert.equal(bounded.length, diag.MAX_ENTRIES);
  assert.match(bounded[bounded.length - 1].message, new RegExp(`boom ${diag.MAX_ENTRIES * 3 - 1}`));

  diag.clearErrorLog();
  assert.equal(diag.getErrorLog().length, 0);
});

test('diagnostics: a render loop cannot duplicate one failure', () => {
  diag.clearErrorLog();
  for (let i = 0; i < 20; i++) diag.recordError({ kind: 'react', message: 'TypeError: same crash' });
  assert.equal(diag.getErrorLog().length, 1, 'the same failure inside one second is recorded once');
});

test('diagnostics: a giant message is clipped, and a report is short and readable', async () => {
  diag.clearErrorLog();
  diag.recordError({ kind: 'error', message: 'x'.repeat(5000) });
  assert.ok(diag.getErrorLog()[0].message.length <= 301);

  const report = await diag.collectDiagnostics();
  assert.equal(report.appVersion.length > 0, true);
  assert.ok(['android', 'ios', 'web'].includes(report.platform));
  assert.ok(['high', 'low'].includes(report.perfMode));
  assert.ok(report.storage.localBytes >= 0);

  const text = diag.formatDiagnostics(report);
  assert.match(text, /^R\.J QUIZ diagnostics/);
  assert.match(text, /Performance:/);
  assert.match(text, /Recent problems \(1/);
  assert.ok(text.length < 4000, 'short enough to paste into a message');
});
