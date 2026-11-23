import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SHOTS = path.join(os.tmpdir(), 'qmp-ui-v315'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4315;
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
A.subject = 'OBG'; B.subject = 'FON'; C.subject = 'OBG';
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



const mkQuiz = (tag, n = 5) => Array.from({ length: n }, (_, i) => ({ question: `${tag} question ${i + 1}?`, options: ['Alpha drug', 'Beta blocker', 'Gamma globulin', 'Delta agent'], correctAnswer: 'Beta blocker', difficulty: 'medium', rationale: '• Beta blockers reduce heart rate.' }));
const resultOfUnused = (tag, ts, extra = {}) => {
  const quizData = mkQuiz(tag, 5);
  return { quizTitle: tag, subject: 'FON', timestamp: ts, quizData, userAnswers: ['Beta blocker', 'Alpha drug', null, 'Beta blocker', 'Alpha drug'], totalQuestions: 5, percentage: 40, score: 2, maxScore: 5, netScore: 2, correct: 2, wrong: 2, skipped: 1, gain: 2, penalty: 0, accuracy: 50, timeTaken: 413, passMark: 50, ...extra };
};
// same hash as src/utils/drafts.ts draftIdFor
const draftIdFor = (qd) => { const str = qd.map(q => String(q.question ?? '').trim().toLowerCase()).sort().join('\u241f'); let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length; for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return `d${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}q${qd.length}`; };
const draftOf = (tag, answered, savedAt, extra = {}) => {
  const quizData = mkQuiz(tag, 5);
  const d = { id: draftIdFor(quizData), title: tag, subject: 'FON', total: 5, answered, index: answered, savedAt, deviceId: 'dev_me', deviceName: 'Phone',
    session: { quizData, settings: { quizTitle: tag, subject: 'FON', timerMode: 'off', timerValue: 30, timerUnit: 'sec', negativeMarking: false, marksPerQuestion: 1, negativeMarks: 0 }, currentIndex: answered, userAnswers: quizData.map((_, i) => (i < answered ? 'Beta blocker' : null)), flaggedQuestions: quizData.map(() => false), accumulatedTime: 413, timeLeftPerQ: [], forcedNext: [], totalTimeLeft: 0, savedAt }, ...extra };
  return d;
};



const lite2 = (r) => ({ ...r, quizData: [], userAnswers: [] });
const seed2 = () => ({ ls: { qmp_history: [...ALL].reverse().map(lite2) }  /* the app keeps the newest first */, idb: Object.fromEntries(ALL.map(r => ['qmp_detail_' + r.timestamp, r])) });
const press = async (bar) => (await bar.locator('[aria-pressed="true"]').evaluateAll(els => els.map(e => e.getAttribute('data-status')))).join(',');
const cardsOf = (page) => page.locator('[data-review-status]').count();

/* ───────── 1. quiz screen: the bookmark button turns into 🔖 ───────── */
async function bookmarkIconSuite() {
  for (const [label, w, h] of [['phone', 412, 860], ['tablet', 1210, 756]]) {
    const d = draftOf('Bookmark Quiz', 2, NOW - 5000);
    const { ctx, page, errs } = await open({ w, h, ls: { qmp_drafts_v1: { v: 1, items: { [d.id]: JSON.stringify(d) } }, qmp_input: 'Q1. pasted text', qmp_create_quiz_id: d.id } });
    const rail = page.getByTestId('drafts-rail'); await rail.waitFor({ timeout: 15000 });
    await rail.locator('article').first().getByRole('button', { name: /Resume/ }).click();
    await page.getByRole('button', { name: 'Exit quiz' }).waitFor({ timeout: 15000 }); await page.waitForTimeout(1000);
    const btn = page.getByRole('button', { name: /^(Remove )?Bookmark$/ });
    ok(`[${label}] quiz screen: not bookmarked at first (outline icon, no 🔖)`, (await btn.getAttribute('aria-pressed')) === 'false' && !(await btn.innerText()).includes('🔖'));
    await btn.click(); await page.waitForTimeout(700);
    ok(`[${label}] quiz screen: after "Bookmarked!" the button turns into 🔖 at once`, (await btn.getAttribute('aria-pressed')) === 'true' && (await btn.innerText()).includes('🔖') && (await btn.getAttribute('aria-label')) === 'Remove Bookmark' && (await btn.getAttribute('data-bookmarked')) === 'true');
    await page.screenshot({ path: `${SHOTS}/quiz_bookmarked_${label}.png` });
    // next question and back: the mark belongs to its own question
    await page.getByRole('button', { name: /next/i }).first().click({ force: true }).catch(() => {}); await page.waitForTimeout(500);
    const onNext = await btn.getAttribute('aria-pressed');
    await page.getByRole('button', { name: /prev/i }).first().click({ force: true }).catch(() => {}); await page.waitForTimeout(500);
    ok(`[${label}] quiz screen: the 🔖 follows its own question (off on the next one, still on here)`, onNext === 'false' && (await btn.getAttribute('aria-pressed')) === 'true', `next=${onNext}`);
    await btn.click(); await page.waitForTimeout(600);
    ok(`[${label}] quiz screen: tapping again removes it and the icon goes back to outline`, (await btn.getAttribute('aria-pressed')) === 'false' && !(await btn.innerText()).includes('🔖'));
    ok(`[${label}] no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

/* ───────── 2. quiz dashboard: one merged stats panel, multi-select filters, premium hero ───────── */
async function dashboardSuite(label, w, h) {
  const { ctx, page, errs } = await open({ w, h, ...seed2() });
  await page.waitForTimeout(1500);
  await page.getByTestId('home-overview').getByText('Gamma Set', { exact: true }).first().click({ timeout: 15000 });
  const bar = page.getByTestId('review-filters'); await bar.waitFor({ timeout: 20000 }); await page.waitForTimeout(1500);
  const want = { all: C.totalQuestions, correct: C.correct, wrong: C.wrong, skipped: C.skipped }; // 12 / 7 / 4 / 1

  // merged panel
  const panels = await page.getByTestId('result-stats').count();
  const txt = (await page.locator('body').innerText()).toLowerCase();
  const nBreak = (txt.match(/📋\s*question breakdown/g) || []).length; // the panel heading (the timing panel's "per-question breakdown" is a different thing)
  ok(`[${label}] one stats panel (the duplicate breakdown + tap-card grid is gone)`, panels === 1 && nBreak === 1 && !txt.includes('tap card to filter'), `${panels} panel(s), "question breakdown" x${nBreak}, tap-card hint ${txt.includes('tap card to filter')}`);
  const tile = async k => Number((await page.getByTestId(`stat-tile-${k}`).innerText()).split('\n')[0]);
  ok(`[${label}] panel numbers = ${JSON.stringify(want)} = the filter bar`, same({ all: await tile('all'), correct: await tile('correct'), wrong: await tile('wrong'), skipped: await tile('skipped') }, want) && same(await pills(bar), want), JSON.stringify(await pills(bar)));
  ok(`[${label}] time, accuracy and pace are in the same panel`, (await page.getByTestId('stat-time').innerText()).includes('5m') && /%/.test(await page.getByTestId('stat-accuracy').innerText()) && /s/.test(await page.getByTestId('stat-pace').innerText()));

  const clippedInPanel = await page.getByTestId('result-stats').evaluate(root => [...root.querySelectorAll('span, h3, p, button')].filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').length);
  ok(`[${label}] stats panel: no truncated text`, clippedInPanel === 0, `${clippedInPanel} truncated`);

  // multi-select from the tiles
  await page.getByTestId('stat-tile-correct').click(); await page.waitForTimeout(500);
  await page.getByTestId('stat-tile-wrong').click(); await page.waitForTimeout(900);
  ok(`[${label}] ✅ + ❌ together: both tiles and both pills are on, All is off`, (await press(bar)) === 'correct,wrong' && (await page.getByTestId('stat-tile-correct').getAttribute('aria-pressed')) === 'true' && (await page.getByTestId('stat-tile-wrong').getAttribute('aria-pressed')) === 'true' && (await page.getByTestId('stat-tile-all').getAttribute('aria-pressed')) === 'false');
  ok(`[${label}] ✅ + ❌ lists ${want.correct + want.wrong} questions and says so`, await cardsOf(page) === want.correct + want.wrong && new RegExp(`Showing\\s*${want.correct + want.wrong}\\s*of\\s*${want.all}`).test((await page.getByTestId('review-filter-summary').innerText()).replace(/\s+/g, ' ')));
  ok(`[${label}] the numbers did not move`, same(await pills(bar), want) && (await tile('correct')) === want.correct && (await tile('wrong')) === want.wrong);
  await bar.getByTestId('status-pill-skipped').click(); await page.waitForTimeout(700);
  ok(`[${label}] ✅ ❌ ⏭️ all three on = every question`, (await press(bar)) === 'correct,wrong,skipped' && await cardsOf(page) === want.all);
  await bar.getByTestId('status-pill-correct').click(); await bar.getByTestId('status-pill-skipped').click(); await page.waitForTimeout(700);
  ok(`[${label}] turning pills off narrows the list again (only ❌ left: ${want.wrong})`, (await press(bar)) === 'wrong' && await cardsOf(page) === want.wrong);
  // 🔖 narrows: bookmarked mistakes
  await page.locator('[data-review-status]').first().getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForTimeout(700);
  ok(`[${label}] bookmarking a card turns the 🔖 count to 1`, Number(await bar.getByTestId('status-pill-bookmarked').getAttribute('data-count')) === 1);
  await bar.getByTestId('status-pill-bookmarked').click(); await page.waitForTimeout(700);
  ok(`[${label}] ❌ + 🔖 = bookmarked mistakes (1)`, (await press(bar)) === 'wrong,bookmarked' && await cardsOf(page) === 1);
  await bar.getByTestId('status-pill-wrong').click(); await page.waitForTimeout(700);
  ok(`[${label}] 🔖 alone = every bookmarked question (1)`, (await press(bar)) === 'bookmarked' && await cardsOf(page) === 1);
  await page.getByTestId('review-filter-summary').getByRole('button', { name: 'Show all' }).click(); await page.waitForTimeout(700);
  ok(`[${label}] "Show all" / All brings every question back (${want.all}) and turns the rest off`, (await press(bar)) === 'all' && await cardsOf(page) === want.all && await page.getByTestId('review-filter-summary').count() === 0);
  await bar.getByTestId('status-pill-skipped').click(); await bar.getByTestId('status-pill-skipped').click(); await page.waitForTimeout(500);
  ok(`[${label}] switching the last pill off returns to All`, (await press(bar)) === 'all');

  // premium hero
  const hero = page.getByTestId('result-hero');
  const hs = await page.getByTestId('result-headline').evaluate(e => { const c = getComputedStyle(e); return { size: parseFloat(c.fontSize), fam: c.fontFamily, clip: c.backgroundClip || c.webkitBackgroundClip }; });
  ok(`[${label}] premium hero: refined headline (no heavy display font, >= 32px, gradient text), date line, pass badge`, !/Syne/i.test(hs.fam) && hs.size >= 31.5 && /text/.test(hs.clip) && (await page.getByTestId('result-date').isVisible()) && /PASSED|FAILED/.test(await hero.innerText()), JSON.stringify(hs).slice(0, 140));
  const hb = await hero.boundingBox();
  ok(`[${label}] hero fits the screen, nothing overflows sideways`, hb.width <= w + 1 && !(await overflowX(page)), `${Math.round(hb.width)}px in ${w}`);
  await page.getByTestId('result-hero').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/dashboard_${label}.png` });
  await page.getByTestId('result-stats').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/stats_${label}.png` });
  ok(`[${label}] no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ───────── 3. top strip + "Jump to a quiz" popup ───────── */
async function switcherSuite(label, w, h) {
  const { ctx, page, errs } = await open({ w, h, ...seed2() });
  await page.waitForTimeout(1500);
  await page.getByTestId('home-overview').getByText('Gamma Set', { exact: true }).first().click({ timeout: 15000 }); // newest quiz
  const nav_ = page.getByTestId('result-nav'); await nav_.waitFor({ timeout: 20000 }); await page.waitForTimeout(1200);
  ok(`[${label}] strip: shows the quiz title and "1 of 3"`, (await page.getByTestId('result-nav-title').innerText()) === 'Gamma Set' && (await page.getByTestId('result-nav-position').innerText()) === '1 of 3');
  ok(`[${label}] strip: Prev is off on the first quiz, Next is on`, await page.getByTestId('result-nav-prev').isDisabled() && !(await page.getByTestId('result-nav-next').isDisabled()));
  const nb = await nav_.boundingBox();
  ok(`[${label}] strip: fits the screen`, nb.x >= 0 && nb.x + nb.width <= w + 1 && !(await overflowX(page)));
  await page.getByTestId('result-nav-next').click(); await page.waitForTimeout(1800);
  ok(`[${label}] Next opens the next quiz (Beta Set, 2 of 3)`, (await page.getByTestId('result-nav-title').innerText()) === 'Beta Set' && (await page.getByTestId('result-nav-position').innerText()) === '2 of 3');
  await page.getByTestId('result-nav-prev').click(); await page.waitForTimeout(1800);

  await page.getByTestId('result-switcher-open').click(); await page.waitForTimeout(600);
  const dlg = page.getByRole('dialog', { name: 'Jump to a quiz' });
  ok(`[${label}] popup opens: dialog, 3 quizzes, the current one is marked`, await dlg.isVisible() && await dlg.getByTestId('switcher-row').count() === 3 && (await dlg.locator('[data-current="true"]').innerText()).includes('Gamma Set') && /3 of 3/.test(await dlg.getByTestId('switcher-count').innerText()));
  const pb = await dlg.boundingBox();
  const fits = pb.x >= -1 && pb.x + pb.width <= w + 1 && pb.y >= -1 && pb.y + pb.height <= h + 1 && !(await overflowX(page));
  const placed = w >= 768 ? (pb.y > 8 && pb.y + pb.height < h - 8) : Math.abs(pb.y + pb.height - h) <= 2;
  ok(`[${label}] popup layout: inside the screen, ${w >= 768 ? 'centred card' : 'bottom sheet'}`, fits && placed, JSON.stringify({ x: Math.round(pb.x), y: Math.round(pb.y), w: Math.round(pb.width), h: Math.round(pb.height) }));
  await page.screenshot({ path: `${SHOTS}/switcher_${label}.png` });

  // quiz name
  await dlg.getByTestId('switcher-search').fill('beta'); await page.waitForTimeout(300);
  ok(`[${label}] search "beta" -> 1 quiz`, await dlg.getByTestId('switcher-row').count() === 1 && /1 of 3/.test(await dlg.getByTestId('switcher-count').innerText()));
  await dlg.getByTestId('switcher-search').fill('zzz'); await page.waitForTimeout(300);
  ok(`[${label}] no match -> empty message`, await dlg.getByTestId('switcher-empty').isVisible());
  await dlg.getByTestId('switcher-search').fill(''); await page.waitForTimeout(300);
  // subjects (several at once)
  await dlg.getByTestId('switcher-subject-OBG').click(); await page.waitForTimeout(300);
  ok(`[${label}] subject OBG -> 2 quizzes`, await dlg.getByTestId('switcher-row').count() === 2);
  await dlg.getByTestId('switcher-subject-FON').click(); await page.waitForTimeout(300);
  ok(`[${label}] OBG + FON together -> 3 quizzes`, await dlg.getByTestId('switcher-row').count() === 3);
  await dlg.getByTestId('switcher-subject-FON').click(); await page.waitForTimeout(300);
  // date
  await dlg.getByTestId('switcher-date-today').click(); await page.waitForTimeout(300);
  ok(`[${label}] date "Today" -> nothing (the quizzes are 1-3 days old)`, await dlg.getByTestId('switcher-empty').isVisible());
  await dlg.getByTestId('switcher-date-7d').click(); await page.waitForTimeout(300);
  ok(`[${label}] date "7 days" + OBG -> 2 quizzes`, await dlg.getByTestId('switcher-row').count() === 2);
  const day = new Date(A.timestamp); const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  await dlg.getByTestId('switcher-date-custom').click(); await dlg.getByTestId('switcher-from').fill(iso); await dlg.getByTestId('switcher-to').fill(iso); await page.waitForTimeout(400);
  ok(`[${label}] custom range = the day of Alpha Set -> 1 quiz`, await dlg.getByTestId('switcher-row').count() === 1 && (await dlg.getByTestId('switcher-row').innerText()).includes('Alpha Set'));
  await dlg.getByTestId('switcher-reset').click(); await page.waitForTimeout(400);
  ok(`[${label}] Reset filters -> 3 quizzes, filters cleared`, await dlg.getByTestId('switcher-row').count() === 3 && await dlg.getByTestId('switcher-search').inputValue() === '' && await dlg.getByTestId('switcher-reset').isDisabled());
  await dlg.getByTestId('switcher-sort-old').click(); await page.waitForTimeout(300);
  ok(`[${label}] sort Oldest puts Alpha Set first`, (await dlg.getByTestId('switcher-row').first().innerText()).includes('Alpha Set'));
  // Escape closes, backdrop closes
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  ok(`[${label}] Escape closes the popup`, await page.getByTestId('quiz-switcher').count() === 0);
  await page.getByTestId('result-switcher-open').click(); await page.waitForTimeout(500);
  await page.mouse.click(Math.round(w / 2), 8); await page.waitForTimeout(400);
  ok(`[${label}] tapping outside closes the popup`, await page.getByTestId('quiz-switcher').count() === 0);
  // jump
  await page.getByTestId('result-switcher-open').click(); await page.waitForTimeout(500);
  await page.getByRole('dialog', { name: 'Jump to a quiz' }).getByTestId('switcher-row').filter({ hasText: 'Alpha Set' }).click(); await page.waitForTimeout(2000);
  ok(`[${label}] tapping a quiz opens it (Alpha Set, 3 of 3), popup closed, page scrolled to top`, (await page.getByTestId('result-nav-title').innerText()) === 'Alpha Set' && (await page.getByTestId('result-nav-position').innerText()) === '3 of 3' && await page.getByTestId('quiz-switcher').count() === 0 && (await page.evaluate(() => window.scrollY)) < 40);
  ok(`[${label}] the dashboard now shows Alpha Set's numbers (10 questions)`, (await page.getByTestId('stat-tile-all').innerText()).startsWith('10'));
  await page.screenshot({ path: `${SHOTS}/after_jump_${label}.png` });
  ok(`[${label}] no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ───────── 4. Progress: multi-select too ───────── */
async function progressMultiSuite() {
  const { ctx, page, errs } = await open({ w: 412, h: 860, ...seed2() });
  await nav(page, 'Progress'); await page.waitForTimeout(2200);
  const bar = page.getByTestId('progress-status-filter'); await bar.waitFor({ timeout: 15000 });
  await bar.getByTestId('status-pill-correct').click(); await bar.getByTestId('status-pill-wrong').click(); await page.waitForTimeout(900);
  ok('Progress: ✅ + ❌ on together lists both (' + (EXPECT.correct + EXPECT.wrong) + '), heading says "Filtered"', (await press(bar)) === 'correct,wrong' && await cardsOf(page) === EXPECT.correct + EXPECT.wrong && /Filtered Questions/i.test(await page.locator('body').innerText()));
  ok('Progress: the numbers stay', same(await pills(bar), EXPECT) && same(await tiles(page), EXPECT));
  await bar.getByTestId('status-pill-all').click(); await page.waitForTimeout(700);
  ok('Progress: All clears the others and lists every question', (await press(bar)) === 'all' && await cardsOf(page) === EXPECT.all);
  await page.reload(); await page.waitForTimeout(2200); await nav(page, 'Progress'); await page.waitForTimeout(1800);
  await bar.getByTestId('status-pill-skipped').click(); await bar.getByTestId('status-pill-wrong').click(); await page.waitForTimeout(500);
  await page.reload(); await page.waitForTimeout(2200); await nav(page, 'Progress'); await page.waitForTimeout(1800);
  ok('Progress: the selection survives a reload', (await press(bar)) === 'wrong,skipped', await press(bar));
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

await bookmarkIconSuite();
await dashboardSuite('phone', 412, 860);
await dashboardSuite('tablet', 1210, 756);
await switcherSuite('phone', 412, 860);
await switcherSuite('tablet', 1210, 756);
await progressMultiSuite();

await browser.close(); await server.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed'); process.exit(failed ? 1 : 0);
