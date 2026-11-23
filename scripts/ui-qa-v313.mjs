/**
 * Real-Chrome regression for v3.13 (touch emulation): one source of truth for status counts and filters.
 *  (v3.14/v3.15: the bar is All | ✅ | ❌ | ⏭️ | 🔖 on one straight line and multi-select; each "round trip" step starts from All so it checks one pill at a time)
 *  1. Progress: pills, Question Breakdown strip and the Reports & downloads tiles all show the SAME numbers
 *     (history rows are light summaries, the questions live in IndexedDB - the exact case that used to disagree)
 *  2. tapping Mistakes / Correct / Skipped / Overview never changes a count and never loses a question
 *  3. the difficulty scope moves pills, strip and tiles together
 *  4. the one-tap Mistakes PDF holds exactly the number its tile shows (built from the master list)
 *  5. per-quiz report uses the same StatusFilterBar and the same numbers as its download tiles
 *  6. the bar never clips or overflows on phone / tablet / landscape, light and dark
 * Run: npm run build && npm run test:ui:v313     (QMP_DIST=<dir> runs it against another build)
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SHOTS = path.join(os.tmpdir(), 'qmp-ui-v313'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4313;
const server = await preview({ configFile: path.resolve('vite.config.ts'), build: { outDir: process.env.QMP_DIST || 'dist' }, preview: { port: PORT, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.PW_CHANNEL || 'chrome' }), args: ['--no-sandbox'] });
let failed = 0;
const ok = (name, pass, info = '') => { if (!pass) failed++; console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  - ' + info : '')); };
const URL = `http://127.0.0.1:${PORT}/`;
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

async function open({ w = 412, h = 860, theme = 'light', ls = {}, idb = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 4\d\d|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
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
  }, { theme, ls, idb });
  await page.goto(URL); await page.waitForTimeout(2200);
  return { ctx, page, errs };
}
const seed = () => ({ ls: { qmp_history: ALL.map(lite) }, idb: Object.fromEntries(ALL.map(r => ['qmp_detail_' + r.timestamp, r])) });
const nav = (page, name) => page.locator('nav').getByText(name, { exact: true }).first().click();
const pills = async (bar) => { const o = {}; for (const k of ['all', 'correct', 'wrong', 'skipped']) o[k] = Number(await bar.getByTestId(`status-pill-${k}`).getAttribute('data-count')); return o; };
const tiles = async (page) => { const items = await page.getByTestId('report-grid').locator('[role="listitem"]').allInnerTexts(); const get = (label) => { const t = items.find(x => x.trim().startsWith(label)); const m = t && t.match(/\n\s*(\d+)\s*$/); return m ? Number(m[1]) : null; }; return { all: get('Full'), correct: get('Correct'), wrong: get('Mistakes'), skipped: get('Skipped') }; };
const strip = async (page) => { const box = page.locator('p', { hasText: 'Question Breakdown' }).first().locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]'); const v = await box.locator('.grid > div').evaluateAll(els => els.map(e => parseInt(e.innerText.split('\n')[0], 10))); return { all: v[0], correct: v[1], wrong: v[2], skipped: v[3] }; };
const pick = async (bar, k) => { if (k !== 'all') { await bar.getByTestId('status-pill-all').click(); } await bar.getByTestId(`status-pill-${k}`).click(); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const clipped = (bar) => bar.locator('button').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1 || [...e.children].some(c => { const r = c.getBoundingClientRect(), p = e.getBoundingClientRect(); return r.left < p.left - 0.5 || r.right > p.right + 0.5; })).length);

/* ───────── 1-4. Progress dashboard ───────── */
async function progressSuite(label, w, h, theme) {
  const { ctx, page, errs } = await open({ w, h, theme, ...seed() });
  await nav(page, 'Progress'); await page.waitForTimeout(2200);
  const bar = page.getByTestId('progress-status-filter');
  await bar.waitFor({ timeout: 15000 });
  const p0 = await pills(bar), t0 = await tiles(page), s0 = await strip(page);
  ok(`[${label}] pills show the whole dataset ${JSON.stringify(EXPECT)}`, same(p0, EXPECT), JSON.stringify(p0));
  ok(`[${label}] report tiles = pills`, same(t0, p0), JSON.stringify(t0));
  ok(`[${label}] question breakdown strip = pills`, same(s0, p0), JSON.stringify(s0));
  const txt = (await bar.innerText()).replace(/\s+/g, ' ');
  ok(`[${label}] five pills: "All" + emoji only, each with its number`, await bar.locator('button').count() === 5 && /^All 30 ✅ 18 ❌ 9 ⏭️ 3 🔖 0$/.test(txt), txt);
  const rows = await bar.locator('button').evaluateAll(els => new Set(els.map(e => Math.round(e.getBoundingClientRect().y))).size);
  ok(`[${label}] bar layout: one straight line`, rows === 1, `${rows} row(s)`);
  ok(`[${label}] no clipped text in the pills, no sideways overflow`, (await clipped(bar)) === 0 && !(await overflowX(page)));
  const contrast = await bar.locator('[aria-pressed="true"]').evaluateAll(els => els.map(e => { const c = getComputedStyle(e).color.match(/\d+/g).map(Number), b = getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number); const L = a => { const f = a.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }; const [x, y] = [L(c), L(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }));
  ok(`[${label}] pill text contrast >= 4.5:1 on its background (selected pill)`, contrast.every(r => r >= 4.5), contrast.map(r => r.toFixed(1)).join(' '));
  await page.screenshot({ path: `${SHOTS}/progress_${label}.png` });

  // filters never change a number and never lose a question
  const cards = () => page.locator('[data-review-status]').count();
  const seq = [['wrong', EXPECT.wrong], ['correct', EXPECT.correct], ['skipped', EXPECT.skipped], ['wrong', EXPECT.wrong], ['all', EXPECT.all], ['correct', EXPECT.correct], ['all', EXPECT.all]];
  let stable = true, listsOk = true, why = '';
  for (const [k, n] of seq) {
    await pick(bar, k); await page.waitForTimeout(700);
    const p = await pills(bar), t = await tiles(page), s = await strip(page);
    if (!same(p, EXPECT) || !same(t, EXPECT) || !same(s, EXPECT)) { stable = false; why += ` ${k}:${JSON.stringify([p, t, s])}`; }
    const sel = await bar.locator('[aria-pressed="true"]').first().getAttribute('data-status');
    const cr = await bar.locator('[aria-pressed="true"]').first().evaluate(e => { const L = s => { const a = s.match(/\d+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }; const [x, y] = [L(getComputedStyle(e).color), L(getComputedStyle(e).backgroundColor)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); });
    if (cr < 4.5) { listsOk = false; why += ` ${k} selected contrast ${cr.toFixed(1)}`; }
    if (sel !== k) { listsOk = false; why += ` selected ${sel} != ${k}`; }
    if (n !== null) { const c = await cards(); if (c !== n) { listsOk = false; why += ` ${k}: ${c} cards, want ${n}`; } }
  }
  ok(`[${label}] All / ✅ / ❌ / ⏭️ round trip: counts static in pills, tiles and strip`, stable, why);
  ok(`[${label}] every filter lists exactly its number of questions (repeated questions included); All lists every question`, listsOk, why);

  // difficulty scope moves pills, strip and tiles together
  await page.getByTestId('report-filters').getByRole('button', { name: '🟢 Easy' }).click(); await page.waitForTimeout(900);
  const pe = await pills(bar), te = await tiles(page), se = await strip(page);
  ok(`[${label}] difficulty Easy: pills = tiles = strip = ${JSON.stringify(easyScope)}`, same(pe, easyScope) && same(te, easyScope) && same(se, easyScope), JSON.stringify([pe, te, se]));
  await page.getByTestId('report-filters').getByRole('button', { name: 'All levels' }).click(); await page.waitForTimeout(700);
  ok(`[${label}] back to All levels: numbers restored`, same(await pills(bar), EXPECT) && same(await tiles(page), EXPECT));

  // one-tap PDF = master list, same number as its tile
  if (label === 'phone') {
    for (const [tile, n] of [['Mistakes', EXPECT.wrong], ['Full', EXPECT.all]]) {
      await bar.getByTestId('status-pill-correct').click(); // an active filter must not matter for the export
      await page.waitForTimeout(400);
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), page.getByRole('button', { name: new RegExp(`Download ${tile === 'Full' ? 'Full Report' : tile} as PDF`) }).click()]);
      const f = path.join(SHOTS, `${tile}.pdf`); await dl.saveAs(f);
      let txt = ''; try { txt = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } catch (e) { txt = ''; }
      const qn = new Set([...txt.matchAll(/\bQ(\d+)\./g)].map(m => Number(m[1])));
      ok(`[${label}] ${tile} PDF holds ${n} questions (Q1..Q${n}) while the "Correct" filter is active`, qn.size === n && qn.has(n) && !qn.has(n + 1), `found ${qn.size} numbered questions`);
    }
  }
  ok(`[${label}] no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ───────── 5. per-quiz report ───────── */
async function quizSuite(label, w, h) {
  const { ctx, page, errs } = await open({ w, h, ...seed() });
  await page.waitForTimeout(1500); // Home: the Overview section lists every quiz
  await page.getByTestId('home-overview').getByText('Alpha Set', { exact: true }).first().click({ timeout: 15000 });
  const bar = page.getByTestId('review-filters'); await bar.waitFor({ timeout: 20000 }); await page.waitForTimeout(1500);
  const want = { all: A.totalQuestions, correct: A.correct, wrong: A.wrong, skipped: A.skipped };
  const p0 = await pills(bar), t0 = await tiles(page);
  ok(`[${label}] quiz report: StatusFilterBar shows ${JSON.stringify(want)}`, same(p0, want), JSON.stringify(p0));
  ok(`[${label}] quiz report: download tiles = pills`, same(t0, want), JSON.stringify(t0));
  const cards = () => page.locator('[data-review-status]').count();
  let good = true, why = '';
  for (const [k, n] of [['wrong', want.wrong], ['skipped', want.skipped], ['correct', want.correct], ['all', want.all]]) {
    await pick(bar, k); await page.waitForTimeout(600);
    const c = await cards(); if (c !== n) { good = false; why += ` ${k}:${c}!=${n}`; }
    if (!same(await pills(bar), want) || !same(await tiles(page), want)) { good = false; why += ` ${k}: counts moved`; }
  }
  ok(`[${label}] quiz report: filters list the right questions, counts never move, Overview brings every question back`, good, why);
  ok(`[${label}] quiz report: no clipping, no overflow`, (await clipped(bar)) === 0 && !(await overflowX(page)));
  await bar.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/quiz_${label}.png` });
  ok(`[${label}] no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ───────── legacy case: one quiz has no question details on this device ───────── */
async function missingSuite() {
  const idb = Object.fromEntries([A, B].map(r => ['qmp_detail_' + r.timestamp, r]));
  const { ctx, page } = await open({ ls: { qmp_history: ALL.map(lite) }, idb });
  await nav(page, 'Progress'); await page.waitForTimeout(2200);
  const bar = page.getByTestId('progress-status-filter'); await bar.waitFor({ timeout: 15000 });
  const p = await pills(bar), t = await tiles(page);
  ok('[missing details] totals keep the saved scores of the quiz without questions (nothing shrinks)', same(p, EXPECT) && same(t, EXPECT), JSON.stringify(p));
  ok('[missing details] a note says which quizzes have no question details', await page.getByTestId('details-unavailable-note').isVisible());
  await bar.getByTestId('status-pill-wrong').click(); await page.waitForTimeout(600);
  const c = await page.locator('[data-review-status]').count();
  ok('[missing details] the list shows the questions that exist on this device', c === A.wrong + B.wrong, `${c} cards`);
  await ctx.close();
}

await progressSuite('phone', 412, 860, 'light');
await progressSuite('phone-small', 360, 740, 'light');
await progressSuite('tablet-portrait', 800, 1280, 'light');
await progressSuite('tablet-landscape', 1210, 756, 'light');
await progressSuite('phone-landscape', 800, 380, 'light');
await progressSuite('phone-dark', 390, 844, 'dark');
await quizSuite('phone', 412, 860);
await quizSuite('tablet', 1210, 756);
await missingSuite();

await browser.close(); await server.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed'); process.exit(failed ? 1 : 0);
