/**
 * Real-Chrome regression for v3.14 (touch emulation):
 *  1. Home carries the Overview (calendar, trend, every quiz); Progress keeps only the combined dashboards
 *  2. the status bar is All | ✅ | ❌ | ⏭️ | 🔖 with numbers, ONE straight line from 320 px to tablet, no clipping
 *  3. "All" lists every question; 🔖 lists the bookmarked ones (bookmark from Progress and from a quiz report)
 *  4. reading typography: rationale / question / options are big, bold enough and use the bundled reading font
 *  5. status bar hidden on every screen (native bridge faked), and the three Settings modes
 * Run: npm run build && npm run test:ui:v314     (QMP_DIST=<dir> runs it against another build)
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SHOTS = path.join(os.tmpdir(), 'qmp-ui-v314'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4314;
const server = await preview({ configFile: path.resolve('vite.config.ts'), build: { outDir: process.env.QMP_DIST || 'dist' }, preview: { port: PORT, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.PW_CHANNEL || 'chrome' }), args: ['--no-sandbox'] });
let failed = 0;
const errsAll = [];
const ok = (name, pass, info = '') => { if (!pass) failed++; console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  - ' + info : '')); };
const BASE = `http://127.0.0.1:${PORT}/`;
const NOW = Date.now(), DAY = 86_400_000;

/** quiz with a fixed outcome pattern: [correct, wrong, skipped] and a difficulty list */
function quiz(tag, ts, pattern, levels, shared = []) {
  const n = levels.length;
  const quizData = levels.map((lv, i) => ({ question: shared[i] || `${tag} question ${i + 1}?`, options: ['Alpha drug', 'Beta blocker', 'Gamma globulin', 'Delta agent'], correctAnswer: 'Beta blocker', difficulty: lv, rationale: '• Beta blockers reduce heart rate.' }));
  const userAnswers = pattern.split('').map(c => (c === 'c' ? 'Beta blocker' : c === 'w' ? 'Alpha drug' : null));
  const correct = userAnswers.filter((a, i) => a === 'Beta blocker').length, wrong = userAnswers.filter(a => a === 'Alpha drug').length, skipped = userAnswers.filter(a => a === null).length;
  return { quizTitle: tag, subject: 'FON', timestamp: ts, quizData, userAnswers, totalQuestions: n, percentage: Math.round((correct / n) * 100), score: correct, maxScore: n, netScore: correct, correct, wrong, skipped, gain: correct, penalty: 0, accuracy: 50, timeTaken: 300, passMark: 50 };
}
const E = 'easy', M = 'medium', H = 'hard';
const shared = ['Shared one?', 'Shared two?', 'Shared three?'];
const A = quiz('Alpha Set', NOW - 3 * DAY, 'ccccccwwws', [E, E, E, E, M, M, M, M, M, H]);               // 6 / 3 / 1
const B = quiz('Beta Set', NOW - 2 * DAY, 'cccccwws', [E, E, M, M, M, M, H, H], shared);               // 5 / 2 / 1  (3 questions repeat Alpha's? no: shared only in B and C)
const C = quiz('Gamma Set', NOW - 1 * DAY, 'cccccccwwwws', [E, E, E, M, M, M, M, M, M, M, M, M], shared); // 7 / 4 / 1
const ALL = [A, B, C];
const lite = r => ({ ...r, quizData: [], userAnswers: [] });
const sum = (rs, f) => rs.reduce((a, r) => a + r[f], 0);
const EXPECT = { all: sum(ALL, 'totalQuestions'), correct: sum(ALL, 'correct'), wrong: sum(ALL, 'wrong'), skipped: sum(ALL, 'skipped') };
// easy scope: count questions whose difficulty is easy, by status
const easyScope = (() => { const c = { all: 0, correct: 0, wrong: 0, skipped: 0 }; for (const r of ALL) r.quizData.forEach((q, i) => { if (q.difficulty !== E) return; c.all++; const a = r.userAnswers[i]; c[a === null ? 'skipped' : a === q.correctAnswer ? 'correct' : 'wrong']++; }); return c; })();

async function open({ w = 412, h = 860, theme = 'light', ls = {}, idb = {}, bridge: withBridge = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); const errs = []; const bridge = [];
  page.on('pageerror', e => { if (!/plugin is not implemented on android/.test(String(e?.message ?? e))) errs.push(String(e)); });
  page.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 4\d\d|Failed to load resource|plugin is not implemented on android/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  await page.exposeFunction('__bridgeMsg', m => bridge.push(m));
  await page.addInitScript((s) => {
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('qmp_onboarding_done', 'true'); localStorage.setItem('__seeded', '1');
      localStorage.setItem('qm-cloud-device-v1', JSON.stringify({ id: 'dev_me', name: 'Phone', platform: 'android' }));
      if (s.theme === 'dark') localStorage.setItem('qmp_theme', 'dark');
      for (const [k, v] of Object.entries(s.ls)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      const req = indexedDB.open('qmp_store', 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('keyval')) req.result.createObjectStore('keyval'); };
      req.onsuccess = () => { const tx = req.result.transaction('keyval', 'readwrite'); for (const [k, v] of Object.entries(s.idb)) tx.objectStore('keyval').put(v, k); };
    }
    if (s.bridge) { // pretend to be the Android app: record the StatusBar calls
      window.androidBridge = { postMessage: () => {} };
      const names = ['hide', 'show', 'setStyle', 'setBackgroundColor', 'setOverlaysWebView', 'getInfo'];
      window.Capacitor = {
        PluginHeaders: [{ name: 'StatusBar', methods: names.map(n => ({ name: n, rtype: 'promise' })) }],
        nativePromise: (pluginId, methodName, options) => { window.__bridgeMsg({ pluginId, methodName, options }); return Promise.resolve({}); },
        nativeCallback: (pluginId, methodName, options) => { window.__bridgeMsg({ pluginId, methodName, options }); return 'cb'; },
      };
    }
  }, { theme, ls, idb, bridge: withBridge });
  await page.goto(BASE); await page.waitForTimeout(2200);
  return { ctx, page, errs, bridge };
}
const seed = () => ({ ls: { qmp_history: ALL.map(lite) }, idb: Object.fromEntries(ALL.map(r => ['qmp_detail_' + r.timestamp, r])) });
const nav = (page, name) => page.locator('nav').getByText(name, { exact: true }).first().click();
const pills = async (bar) => { const o = {}; for (const k of ['all', 'correct', 'wrong', 'skipped']) o[k] = Number(await bar.getByTestId(`status-pill-${k}`).getAttribute('data-count')); return o; };
const tiles = async (page) => { const items = await page.getByTestId('report-grid').locator('[role="listitem"]').allInnerTexts(); const get = (label) => { const t = items.find(x => x.trim().startsWith(label)); const m = t && t.match(/\n\s*(\d+)\s*$/); return m ? Number(m[1]) : null; }; return { all: get('Full'), correct: get('Correct'), wrong: get('Mistakes'), skipped: get('Skipped') }; };
const strip = async (page) => { const box = page.locator('p', { hasText: 'Question Breakdown' }).first().locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]'); const v = await box.locator('.grid > div').evaluateAll(els => els.map(e => parseInt(e.innerText.split('\n')[0], 10))); return { all: v[0], correct: v[1], wrong: v[2], skipped: v[3] }; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const clipped = (bar) => bar.locator('button').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1 || [...e.children].some(c => { const r = c.getBoundingClientRect(), p = e.getBoundingClientRect(); return r.left < p.left - 0.5 || r.right > p.right + 0.5; })).length);


const sb = (bridge) => bridge.filter(m => m.pluginId === 'StatusBar').map(m => m.methodName);
const readingStyle = (page, sel) => page.locator(sel).first().evaluate(e => { const c = getComputedStyle(e); return { size: parseFloat(c.fontSize), weight: Number(c.fontWeight), family: c.fontFamily }; });

/* ───────── 1. Home carries the Overview, Progress only the dashboards ───────── */
async function homeSuite(label, w, h) {
  const { ctx, page, errs } = await open({ w, h, ...seed() });
  const ov = page.getByTestId('home-overview');
  await ov.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(2000);
  ok(`[${label}] Home shows the Overview section`, await ov.isVisible() && /Overview/.test(await ov.getByRole('heading', { level: 2 }).innerText()));
  const body = await ov.innerText();
  ok(`[${label}] Home Overview lists every quiz (Alpha / Beta / Gamma)`, ['Alpha Set', 'Beta Set', 'Gamma Set'].every(t => body.includes(t)), body.slice(0, 120).replace(/\s+/g, ' '));
  ok(`[${label}] Home Overview has the study calendar and the AI strategy`, /study calendar/i.test(body) && /study strategy/i.test(body));
  await page.screenshot({ path: `${SHOTS}/home_${label}.png` });
  await ov.getByTestId('home-overview-progress').click(); await page.waitForTimeout(1800);
  const bar = page.getByTestId('progress-status-filter');
  ok(`[${label}] "Progress" button in the Overview opens Progress`, await bar.isVisible() && new URL(page.url()).pathname === '/profile', page.url());
  const prog = await page.locator('body').innerText();
  ok(`[${label}] Progress no longer carries the Overview (no calendar, strategy, quiz list, data tools)`, !/study calendar|study strategy|Delete all data|Export JSON/i.test(prog) && await page.getByTestId('home-overview').count() === 0);
  ok(`[${label}] no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ───────── 2. bar: one straight line at every width ───────── */
async function barWidthSuite() {
  for (const [w, h] of [[320, 640], [360, 740], [412, 860], [800, 380], [800, 1280], [1210, 756]]) {
    const { ctx, page } = await open({ w, h, ...seed() });
    await nav(page, 'Progress'); await page.waitForTimeout(2200);
    const bar = page.getByTestId('progress-status-filter'); await bar.waitFor({ timeout: 15000 });
    const ys = await bar.locator('button').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().y)));
    const clip = await bar.locator('button').evaluateAll(els => els.filter(e => { const p = e.getBoundingClientRect(); return e.scrollWidth > e.clientWidth + 1 || [...e.children].some(c => { const r = c.getBoundingClientRect(); return r.left < p.left - 0.5 || r.right > p.right + 0.5; }); }).length);
    const inside = await bar.evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= -0.5 && r.right <= window.innerWidth + 0.5; });
    ok(`[${w}x${h}] bar is one straight line, nothing clipped, inside the screen`, new Set(ys).size === 1 && clip === 0 && inside && !(await overflowX(page)), JSON.stringify({ rows: new Set(ys).size, clip, inside }));
    if (w === 320 || w === 1210) await page.screenshot({ path: `${SHOTS}/bar_${w}.png` });
    await ctx.close();
  }
}

/* ───────── 3. All / 🔖 lists and bookmarking ───────── */
async function listSuite() {
  const { ctx, page, errs } = await open({ w: 412, h: 860, ...seed() });
  await nav(page, 'Progress'); await page.waitForTimeout(2200);
  const bar = page.getByTestId('progress-status-filter'); await bar.waitFor({ timeout: 15000 });
  await bar.getByTestId('status-pill-all').click(); await page.waitForTimeout(900);
  const cards = () => page.locator('[data-review-status]').count();
  ok('All lists every question of every quiz (30), heading says so', await cards() === EXPECT.all && /All Questions/i.test(await page.locator('body').innerText()), String(await cards()));
  const q1 = await page.locator('[data-review-status]').first().innerText();
  // bookmark the first card
  await page.locator('[data-review-status]').first().getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForTimeout(800);
  ok('bookmarking from Progress: 🔖 count goes 0 -> 1, other counts unchanged', Number(await bar.getByTestId('status-pill-bookmarked').getAttribute('data-count')) === 1 && same(await pills(bar), EXPECT));
  await bar.getByTestId('status-pill-bookmarked').click(); await page.waitForTimeout(900);
  const bm = await page.locator('[data-review-status]').allInnerTexts();
  ok('🔖 lists exactly the bookmarked question', bm.length === 1 && bm[0].split('\n').join(' ').includes(q1.split('\n').filter(l => /question \d+\?|Shared/.test(l))[0] || ''), `${bm.length} card(s)`);
  ok('🔖 heading', /Bookmarked/i.test(await page.locator('body').innerText()));
  await page.locator('[data-review-status]').first().getByRole('button', { name: 'Saved', exact: true }).click(); await page.waitForTimeout(800);
  ok('removing the bookmark: 🔖 back to 0 and the list shows the empty hint', Number(await bar.getByTestId('status-pill-bookmarked').getAttribute('data-count')) === 0 && /No bookmarks yet/.test(await page.locator('body').innerText()));
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();

  // per-quiz report: same bar, bookmark count
  const c2 = await open({ w: 412, h: 860, ...seed() });
  await c2.page.waitForTimeout(1500);
  await c2.page.getByTestId('home-overview').getByText('Beta Set', { exact: true }).first().click({ timeout: 15000 });
  const rb = c2.page.getByTestId('review-filters'); await rb.waitFor({ timeout: 20000 }); await c2.page.waitForTimeout(1200);
  const txt = (await rb.innerText()).replace(/\s+/g, ' ');
  ok('quiz report: same bar "All 8 ✅ 5 ❌ 2 ⏭️ 1 🔖 0"', txt === 'All 8 ✅ 5 ❌ 2 ⏭️ 1 🔖 0', txt);
  await c2.page.locator('[data-review-status]').first().getByRole('button', { name: 'Save', exact: true }).click(); await c2.page.waitForTimeout(800);
  ok('quiz report: bookmarking updates 🔖 to 1, the other numbers stay', Number(await rb.getByTestId('status-pill-bookmarked').getAttribute('data-count')) === 1 && Number(await rb.getByTestId('status-pill-all').getAttribute('data-count')) === 8);
  await rb.getByTestId('status-pill-bookmarked').click(); await c2.page.waitForTimeout(700);
  ok('quiz report: 🔖 shows 1 question, All brings back 8', await c2.page.locator('[data-review-status]').count() === 1 && (await rb.getByTestId('status-pill-all').click(), await c2.page.waitForTimeout(700), await c2.page.locator('[data-review-status]').count() === 8));
  await c2.ctx.close();
}

/* ───────── 4. reading typography ───────── */
async function typographySuite() {
  for (const [label, w, h, theme] of [['phone', 412, 860, 'light'], ['tablet', 1210, 756, 'light'], ['phone-dark', 390, 844, 'dark']]) {
    const { ctx, page } = await open({ w, h, theme, ...seed() });
    await nav(page, 'Progress'); await page.waitForTimeout(2200);
    await page.getByTestId('progress-status-filter').getByTestId('status-pill-correct').click(); await page.waitForTimeout(1200);
    const card = page.locator('[data-review-status]').first();
    if (!(await card.getByTestId('rationale-box').isVisible().catch(() => false))) { await card.getByRole('button', { name: 'Rationale', exact: true }).click(); await page.waitForTimeout(600); }
    const rat = await readingStyle(page, '.qmp-rationale'), qn = await readingStyle(page, '[data-review-status] h3'), op = await readingStyle(page, '[data-option-state]');
    const loaded = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('500 16px "Atkinson Hyperlegible Next"'); });
    ok(`[${label}] rationale text is large and bold enough (>= 16px, weight >= 500)`, rat.size >= 15.9 && rat.weight >= 500, JSON.stringify(rat));
    ok(`[${label}] question >= 17px, options >= 15px`, qn.size >= 17 && op.size >= 15, `q ${qn.size} / opt ${op.size}`);
    ok(`[${label}] reading font is the bundled Atkinson Hyperlegible Next and it is loaded`, /Atkinson Hyperlegible Next/.test(rat.family) && loaded, rat.family.slice(0, 60));
    // real sRGB colours: the browser may report oklch()/color() strings, so let a canvas convert them; composite the card's translucent backgrounds over the page
    const ratio = await page.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
      const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };
      const e = document.querySelector('.qmp-rationale'); const chain = []; for (let n = e; n; n = n.parentElement) chain.unshift(getComputedStyle(n).backgroundColor);
      let bg = { r: 255, g: 255, b: 255 }; for (const c of chain) { const x = rgba(c); if (x.a > 0) bg = { r: x.r * x.a + bg.r * (1 - x.a), g: x.g * x.a + bg.g * (1 - x.a), b: x.b * x.a + bg.b * (1 - x.a) }; }
      const f = rgba(getComputedStyle(e).color); const fg = { r: f.r * f.a + bg.r * (1 - f.a), g: f.g * f.a + bg.g * (1 - f.a), b: f.b * f.a + bg.b * (1 - f.a) };
      const L = ({ r, g, b }) => { const t = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]; };
      return (Math.max(L(fg), L(bg)) + 0.05) / (Math.min(L(fg), L(bg)) + 0.05);
    });
    ok(`[${label}] rationale contrast against its card >= 7:1 (AAA)`, ratio >= 7, `${ratio.toFixed(1)}:1`);
    await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/read_${label}.png` });
    await ctx.close();
  }
}

/* ───────── 5. status bar hidden everywhere + the three modes ───────── */
async function statusBarSuite() {
  const { ctx, page, bridge, errs } = await open({ w: 412, h: 860, bridge: true, ...seed() });
  await page.waitForTimeout(800);
  ok('default: StatusBar.hide() on start (Home), never show()', sb(bridge).includes('hide') && !sb(bridge).includes('show'), sb(bridge).join(','));
  for (const tab of ['Library', 'Stats', 'Progress', 'Home']) { await nav(page, tab); await page.waitForTimeout(700); }
  ok('default: still never shown while moving through Library / Stats / Progress / Home', !sb(bridge).includes('show'), sb(bridge).join(','));
  // Settings -> Hide status bar
  await page.getByTestId('avatar-settings').click(); await page.getByRole('heading', { name: 'Settings', level: 2 }).waitFor({ timeout: 10000 }); await page.waitForTimeout(600);
  await page.getByPlaceholder(/search/i).first().fill('status bar'); await page.waitForTimeout(700);
  const grp = page.getByRole('radiogroup', { name: 'Hide status bar' });
  if (!(await grp.isVisible().catch(() => false))) { await page.getByText('Hide status bar', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(700); }
  ok('Settings has "Hide status bar" with Everywhere / Quiz only / Never', await grp.isVisible() && (await grp.getByRole('radio').allInnerTexts()).join('|') === 'Everywhere|Quiz only|Never');
  ok('Everywhere is selected by default', await grp.getByRole('radio', { name: 'Everywhere' }).getAttribute('aria-checked') === 'true');
  const before = sb(bridge).length;
  await grp.getByRole('radio', { name: 'Never' }).click(); await page.waitForTimeout(800);
  ok('Never: bar comes back (StatusBar.show)', sb(bridge).slice(before).includes('show') && await page.evaluate(() => localStorage.getItem('qmp_status_bar_mode_v2')) === 'off', sb(bridge).slice(before).join(','));
  const b2 = sb(bridge).length;
  await grp.getByRole('radio', { name: 'Everywhere' }).click(); await page.waitForTimeout(800);
  ok('Everywhere again: hidden again (StatusBar.hide)', sb(bridge).slice(b2).includes('hide'), sb(bridge).slice(b2).join(','));
  const b3 = sb(bridge).length;
  await grp.getByRole('radio', { name: 'Quiz only' }).click(); await page.waitForTimeout(800);
  ok('Quiz only: bar shown outside quizzes', sb(bridge).slice(b3).includes('show') && await page.evaluate(() => localStorage.getItem('qmp_status_bar_mode_v2')) === 'quiz', sb(bridge).slice(b3).join(','));
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

await homeSuite('phone', 412, 860);
await homeSuite('tablet', 1210, 756);
await barWidthSuite();
await listSuite();
await typographySuite();
await statusBarSuite();

await browser.close(); await server.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed'); process.exit(failed ? 1 : 0);
