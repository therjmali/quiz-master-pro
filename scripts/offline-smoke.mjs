#!/usr/bin/env node
/**
 * Real-browser offline test. Serves the production build (dist/) and proves that after one online
 * visit the app installs its service worker and then boots with the network switched OFF, including
 * on a deep link.
 *
 *   npm run build && npm run test:offline
 *
 * Environment
 *   VITE_BASE   base path the build was made with (default "/")
 *   PW_CHANNEL  Playwright browser channel (default "chrome")
 *   CHROME_PATH use a specific browser executable instead of a channel
 *   OUT_DIR     screenshot/output folder (default "test-results")
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const BASE = process.env.VITE_BASE || '/';
const PORT = 4173;
const OUT = process.env.OUT_DIR || 'test-results';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const URL_ROOT = `${ORIGIN}${BASE}`;
mkdirSync(OUT, { recursive: true });

const failures = [];
const step = (ok, name, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

const server = await preview({
  configFile: path.resolve('vite.config.ts'),
  preview: { port: PORT, strictPort: true, host: '127.0.0.1' },
});

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.PW_CHANNEL || 'chrome' }),
  });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'allow' });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).split('\n')[0]));
  const remote = new Set();
  page.on('request', r => { const u = new globalThis.URL(r.url()); if (u.origin !== ORIGIN && u.protocol.startsWith('http')) remote.add(u.origin); });

  const rootHasContent = p => p.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, null, { timeout: 25_000 }).then(() => true, () => false);

  // 1) first, online visit
  const first = await page.goto(URL_ROOT, { waitUntil: 'load' });
  step(first?.ok() === true, 'online: app is served', `HTTP ${first?.status()}`);
  step(await rootHasContent(page), 'online: React app rendered into #root');
  await page.screenshot({ path: path.join(OUT, '01-online.png') });

  // 2) service worker installs and precaches the build
  const swReady = await page.evaluate(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30_000))]).catch(() => null);
    return Boolean(reg && reg.active);
  });
  step(swReady, 'service worker installed and active');

  const cache = await page.evaluate(async () => {
    const keys = (await caches.keys()).filter(k => k.startsWith('qmp-'));
    const entries = keys.length ? (await (await caches.open(keys[0])).keys()).length : 0;
    return { keys, entries };
  });
  step(cache.keys.length === 1 && cache.entries >= 100, 'precache populated', `${cache.entries} entries in ${cache.keys.join(',')}`);

  // ensure this page is controlled before cutting the network
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload({ waitUntil: 'load' });
  step(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'page is controlled by the service worker');

  // 3) network OFF: reload the app
  await context.setOffline(true);
  const offline = await page.reload({ waitUntil: 'load' }).catch(() => null);
  step(offline !== null && offline.status() === 200, 'offline: reload succeeds', `HTTP ${offline?.status()}`);
  step(await rootHasContent(page), 'offline: React app renders without network');
  step((await page.title()).includes('Quiz Master Pro'), 'offline: document title intact', await page.title());
  const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').length; });
  step(fontsOk > 0, 'offline: bundled web fonts load', `${fontsOk} font faces loaded`);
  const manifestOk = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).ok);
  step(manifestOk, 'offline: web manifest still reachable');
  await page.screenshot({ path: path.join(OUT, '02-offline.png') });

  // 4) deep link while offline falls back to the cached app shell
  const deep = await page.goto(`${URL_ROOT}some/deep/link`, { waitUntil: 'load' }).catch(() => null);
  step(deep !== null && deep.status() === 200, 'offline: deep link served from cache', `HTTP ${deep?.status()}`);
  step(await rootHasContent(page), 'offline: deep link renders the app');
  await page.screenshot({ path: path.join(OUT, '03-offline-deeplink.png') });

  console.log(`INFO  remote origins contacted: ${[...remote].join(', ') || 'none'}`);
  console.log(`INFO  uncaught page errors: ${pageErrors.length}${pageErrors.length ? ` -> ${[...new Set(pageErrors)].slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  step(false, 'test run completed without exceptions', String(e).split('\n')[0]);
} finally {
  await browser?.close();
  await server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} offline check(s) failed`);
  process.exit(1);
}
console.log('\nAll offline checks passed');
