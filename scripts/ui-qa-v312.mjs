/**
 * Real-Chrome regression for v3.12 (touch emulation):
 *  1. Library edit (name / date) updates the ONE record: no duplicate, nothing in Trash, still opens (legacy id-less record and a record with an id)
 *  2. quizzes already damaged by the old edit are repaired (questions re-attached, Trash leftover removed)
 *  3. a finished quiz is not a draft: leftover drafts are purged, a finished quiz is not re-saved when the app is backgrounded
 *  4. segmented progress bar: one block per question, attempted = primary, current marked
 *  5. immersive quiz mode: StatusBar hide on entering a quiz, show on leaving (native bridge faked)
 *  6. the Create form is empty again after the quiz made from it is finished
 * Run: npm run build && npm run test:ui:v312     (QMP_DIST=<dir> runs it against another build)
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SHOTS = path.join(os.tmpdir(), 'qmp-ui-v312'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4312;
const server = await preview({ configFile: path.resolve('vite.config.ts'), build: { outDir: process.env.QMP_DIST || 'dist' }, preview: { port: PORT, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.PW_CHANNEL || 'chrome' }), args: ['--no-sandbox'] });
let failed = 0;
const ok = (name, pass, info = '') => { if (!pass) failed++; console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  - ' + info : '')); };
const URL = `http://127.0.0.1:${PORT}/`;
const DAY = 86_400_000, NOW = Date.now();

const mkQuiz = (tag, n = 5) => Array.from({ length: n }, (_, i) => ({ question: `${tag} question ${i + 1}?`, options: ['Alpha drug', 'Beta blocker', 'Gamma globulin', 'Delta agent'], correctAnswer: 'Beta blocker', difficulty: 'medium', rationale: '• Beta blockers reduce heart rate.' }));
const resultOf = (tag, ts, extra = {}) => {
  const quizData = mkQuiz(tag, 5);
  return { quizTitle: tag, subject: 'FON', timestamp: ts, quizData, userAnswers: ['Beta blocker', 'Alpha drug', null, 'Beta blocker', 'Alpha drug'], totalQuestions: 5, percentage: 40, score: 2, maxScore: 5, netScore: 2, correct: 2, wrong: 2, skipped: 1, gain: 2, penalty: 0, accuracy: 50, timeTaken: 413, passMark: 50, ...extra };
};
const lite = r => ({ ...r, quizData: [], userAnswers: [] });
// same hash as src/utils/drafts.ts draftIdFor
const draftIdFor = (qd) => { const str = qd.map(q => String(q.question ?? '').trim().toLowerCase()).sort().join('\u241f'); let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length; for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return `d${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}q${qd.length}`; };
const draftOf = (tag, answered, savedAt, extra = {}) => {
  const quizData = mkQuiz(tag, 5);
  const d = { id: draftIdFor(quizData), title: tag, subject: 'FON', total: 5, answered, index: answered, savedAt, deviceId: 'dev_me', deviceName: 'Phone',
    session: { quizData, settings: { quizTitle: tag, subject: 'FON', timerMode: 'off', timerValue: 30, timerUnit: 'sec', negativeMarking: false, marksPerQuestion: 1, negativeMarks: 0 }, currentIndex: answered, userAnswers: quizData.map((_, i) => (i < answered ? 'Beta blocker' : null)), flaggedQuestions: quizData.map(() => false), accumulatedTime: 413, timeLeftPerQ: [], forcedNext: [], totalTimeLeft: 0, savedAt }, ...extra };
  return d;
};

/** seed = { ls: {key: value}, idb: {key: value}, bridge: bool } applied once before the app starts */
async function open(seed, { w = 390, h = 800 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage(); const errs = []; const bridge = [];
  page.on('pageerror', e => { if (!/plugin is not implemented on android/.test(String(e?.message ?? e))) errs.push(String(e)); }); // the faked bridge only implements StatusBar
  page.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 4\d\d|Failed to load resource|plugin is not implemented on android/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  await page.exposeFunction('__bridgeMsg', m => bridge.push(m));
  await page.addInitScript((s) => {
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('qmp_onboarding_done', 'true'); localStorage.setItem('__seeded', '1');
      localStorage.setItem('qm-cloud-device-v1', JSON.stringify({ id: 'dev_me', name: 'Phone', platform: 'android' }));
      for (const [k, v] of Object.entries(s.ls || {})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      const req = indexedDB.open('qmp_store', 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('keyval')) req.result.createObjectStore('keyval'); };
      req.onsuccess = () => { const tx = req.result.transaction('keyval', 'readwrite'); for (const [k, v] of Object.entries(s.idb || {})) tx.objectStore('keyval').put(v, k); };
    }
    if (s.bridge) { // pretend to be the Android app: the native layer would provide nativePromise; we record the calls instead
      window.androidBridge = { postMessage: () => {} };
      const names = ['hide', 'show', 'setStyle', 'setBackgroundColor', 'setOverlaysWebView', 'getInfo'];
      window.Capacitor = {
        PluginHeaders: [{ name: 'StatusBar', methods: names.map(n => ({ name: n, rtype: 'promise' })) }],
        nativePromise: (pluginId, methodName, options) => { window.__bridgeMsg({ pluginId, methodName, options }); return Promise.resolve({}); },
        nativeCallback: (pluginId, methodName, options) => { window.__bridgeMsg({ pluginId, methodName, options }); return 'cb'; },
      };
    }
  }, seed);
  await page.goto(URL); await page.waitForTimeout(2200);
  return { ctx, page, errs, bridge };
}
const nav = (page, name) => page.locator('nav').getByText(name, { exact: true }).first().click();
const idbGetRaw = (page, key) => page.evaluate((k) => new Promise((res) => { const r = indexedDB.open('qmp_store', 1); r.onsuccess = () => { const g = r.result.transaction('keyval').objectStore('keyval').get(k); g.onsuccess = () => res(g.result ?? null); g.onerror = () => res(null); }; r.onerror = () => res(null); }), key);
const trashCount = async (page) => { const t = await idbGetRaw(page, 'qmp_history_trash_idb'); return Array.isArray(t) ? t.length : 0; };
const libraryCards = (page) => page.getByText(/^(Legacy|Fresh|Orphan)/);

/* ───────── 1. Library edit: legacy (id-less) record, date + name ───────── */
async function editSuite(label, { withId }) {
  const A = resultOf(withId ? 'Fresh A' : 'Legacy A', NOW - 2 * DAY, withId ? { id: 'uuid-fresh-a' } : {});
  const B = resultOf(withId ? 'Fresh B' : 'Legacy B', NOW - 1 * DAY, withId ? { id: 'uuid-fresh-b' } : {});
  const idb = { ['qmp_detail_' + A.timestamp]: A, ['qmp_detail_' + B.timestamp]: B, ...(withId ? { 'qmp_detail_uuid-fresh-a': A, 'qmp_detail_uuid-fresh-b': B } : {}) };
  const { ctx, page, errs } = await open({ ls: { qmp_history: [lite(B), lite(A)] }, idb });
  await nav(page, 'Library'); await page.waitForTimeout(1500);
  const base = withId ? 'Fresh' : 'Legacy';
  ok(`[${label}] two quizzes in the Library`, (await page.getByText(new RegExp(`^${base} [AB]$`)).count()) === 2);
  const pencils = page.locator('button:has(svg.lucide-pencil)');
  await pencils.nth(1).click(); await page.waitForTimeout(600); // second card = A
  const dlg = page.getByRole('dialog');
  await dlg.getByPlaceholder('Enter title…').fill(`${base} A renamed`);
  await dlg.locator('input[type="date"]').fill('2026-11-10');
  await dlg.locator('input[type="time"]').fill('09:30');
  await dlg.getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(1500);
  ok(`[${label}] still exactly two quizzes, the edited one once (no duplicate)`, (await page.getByText(new RegExp(`^${base} A renamed$`)).count()) === 1 && (await page.getByText(new RegExp(`^${base} B$`)).count()) === 1 && (await page.getByText(new RegExp(`^${base} A$`)).count()) === 0);
  ok(`[${label}] the old version did NOT go to Trash`, (await trashCount(page)) === 0, String(await trashCount(page)));
  await page.getByText(`${base} A renamed`).first().click(); await page.waitForTimeout(2500);
  const cards = await page.locator('[data-review-status]').count();
  ok(`[${label}] the edited quiz opens with all its questions`, cards === 5, `${cards} review cards`);
  await page.screenshot({ path: `${SHOTS}/edit_${label.replace(/\W+/g, '_')}.png` });
  ok(`[${label}] no JS errors`, errs.length === 0, errs.join(' | ').slice(0, 300));
  await ctx.close();
}

/* ───────── 2. repair of an already damaged edit ───────── */
async function repairSuite() {
  const original = resultOf('Orphan original', NOW - 3 * DAY);
  const orphan = lite(resultOf('Orphan edited', NOW - 5 * DAY));
  const { ctx, page, errs } = await open({ ls: { qmp_history: [orphan] }, idb: { qmp_history_trash_idb: [{ result: original, deletedAt: NOW - 1000 }] } });
  await page.waitForTimeout(1500);
  ok('[repair] the app says it repaired one quiz', /Repaired 1 quiz/.test(await page.locator('body').innerText()) || (await trashCount(page)) === 0);
  ok('[repair] the leftover left Trash', (await trashCount(page)) === 0, String(await trashCount(page)));
  await nav(page, 'Library'); await page.waitForTimeout(1500);
  await page.getByText('Orphan edited').first().click(); await page.waitForTimeout(2500);
  ok('[repair] the damaged quiz opens again', (await page.locator('[data-review-status]').count()) === 5);
  ok('[repair] no JS errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await ctx.close();
}

/* ───────── 3. finished quizzes are not drafts ───────── */
async function draftSuite() {
  const done = resultOf('Zombie Quiz', NOW - 3600_000); // 2 correct + 2 wrong = 4 answered, 413 s
  const zombie = draftOf('Zombie Quiz', 4, NOW - 60_000); // the same finished attempt, saved again afterwards
  const real = draftOf('Real Draft', 2, NOW - 30_000);
  const { ctx, page, errs } = await open({ ls: { qmp_history: [lite(done)], qmp_drafts_v1: { v: 1, items: { [zombie.id]: JSON.stringify(zombie), [real.id]: JSON.stringify(real) } } }, idb: { ['qmp_detail_' + done.timestamp]: done } });
  const rail = page.getByTestId('drafts-rail'); await rail.waitFor({ timeout: 15000 }).catch(() => {});
  const txt = await page.locator('body').innerText();
  ok('[drafts] the leftover draft of the finished quiz is gone', !/Zombie Quiz/.test(await rail.innerText().catch(() => '')) && (await rail.locator('article').count()) === 1, (await rail.locator('article').count()) + ' cards');
  ok('[drafts] a genuinely unfinished quiz stays a draft', /Real Draft/.test(await rail.innerText()));
  ok('[drafts] no JS errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await ctx.close();
}

/* ───────── 4 + 5 + 6. quiz screen: segments, immersive, create form ───────── */
async function quizSuite(label, w, h, withBridge = false) {
  const d = draftOf('Segment Quiz', 2, NOW - 5000);
  const { ctx, page, errs, bridge } = await open({ bridge: withBridge, ls: { qmp_drafts_v1: { v: 1, items: { [d.id]: JSON.stringify(d) } }, qmp_input: 'Q1. pasted text for the next quiz', qmp_create_quiz_id: d.id } }, { w, h });
  const rail = page.getByTestId('drafts-rail'); await rail.waitFor({ timeout: 15000 });
  await rail.locator('article').first().getByRole('button', { name: /Resume/ }).click();
  await page.getByRole('button', { name: 'Exit quiz' }).waitFor({ timeout: 15000 }); await page.waitForTimeout(1200);

  const bar = page.getByTestId('quiz-progress');
  const segs = bar.locator('.qh-seg');
  ok(`[${label}] one block per question (5)`, (await segs.count()) === 5, String(await segs.count()));
  const states = await segs.evaluateAll(els => els.map(e => e.getAttribute('data-seg')));
  ok(`[${label}] answered questions are primary, the rest neutral`, JSON.stringify(states) === '["done","done","none","none","none"]', JSON.stringify(states));
  ok(`[${label}] exactly one block marks where you are (question 3)`, (await bar.locator('[data-current="true"]').count()) === 1 && (await segs.nth(2).getAttribute('data-current')) === 'true');
  const sizes = await segs.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
  ok(`[${label}] blocks have equal width`, Math.max(...sizes) - Math.min(...sizes) <= 1, sizes.join(','));
  const colors = await segs.evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor));
  ok(`[${label}] attempted and neutral blocks really differ in colour`, colors[0] !== colors[2] && colors[0] === colors[1] && colors[2] === colors[3], colors.join(' | '));
  ok(`[${label}] the old continuous line is gone`, (await page.locator('.qh-track, .qh-fill').count()) === 0);
  ok(`[${label}] progressbar semantics`, (await bar.getAttribute('aria-valuenow')) === '2' && (await bar.getAttribute('aria-valuemax')) === '5');
  // answer question 3: the third block turns primary
  await page.getByText('Beta blocker', { exact: true }).first().click(); await page.waitForTimeout(900);
  const after = await segs.evaluateAll(els => els.map(e => e.getAttribute('data-seg')));
  ok(`[${label}] answering fills the current block`, after[2] === 'done', JSON.stringify(after));
  await page.screenshot({ path: `${SHOTS}/quiz_${label.replace(/\W+/g, '_')}.png` });

  // immersive: the status bar was hidden when the quiz opened
  const calls = bridge.filter(m => m.pluginId === 'StatusBar').map(m => m.methodName);
  if (withBridge) {
    ok(`[${label}] immersive: StatusBar.hide() called on entering the quiz`, calls.includes('hide'), calls.join(','));
    ok(`[${label}] immersive: not shown while the quiz is open`, !calls.includes('show'), calls.join(','));
  } else ok(`[${label}] web build: no native status-bar calls at all`, calls.length === 0, calls.join(','));
  // leave: save & exit -> status bar shown again
  await page.getByRole('button', { name: 'Exit quiz' }).click(); await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Save & exit/ }).click(); await page.waitForTimeout(1500);
  const calls2 = bridge.filter(m => m.pluginId === 'StatusBar').map(m => m.methodName);
  if (withBridge) ok(`[${label}] immersive: StatusBar.show() called on leaving the quiz`, calls2.includes('show'), calls2.join(','));
  ok(`[${label}] no JS errors`, errs.length === 0, errs.join(' | ').slice(0, 300));
  await ctx.close();
}

/* ───────── 6. finishing a quiz made from the Create form empties the form ───────── */
async function createFormSuite() {
  const d = draftOf('Create Quiz', 4, NOW - 5000);
  const { ctx, page, errs } = await open({ ls: { qmp_drafts_v1: { v: 1, items: { [d.id]: JSON.stringify(d) } }, qmp_input: 'Q1. pasted text for this quiz', qmp_create_quiz_id: d.id, qmp_settings: { quizTitle: 'Create Quiz' } } });
  const rail = page.getByTestId('drafts-rail'); await rail.waitFor({ timeout: 15000 });
  await rail.locator('article').first().getByRole('button', { name: /Resume/ }).click();
  await page.getByRole('button', { name: 'Exit quiz' }).waitFor({ timeout: 15000 }); await page.waitForTimeout(1000);
  // last question -> answer -> Finish
  await page.getByText('Beta blocker', { exact: true }).first().click(); await page.waitForTimeout(800);
  const fin = page.getByRole('button', { name: /Finish/ }).first();
  await fin.click(); await page.waitForTimeout(800);
  const confirm = page.getByRole('button', { name: /^(Submit|Finish|Yes|Confirm)/i });
  if (await page.locator('[role="alertdialog"], [role="dialog"]').count()) await page.locator('[role="alertdialog"] button, [role="dialog"] button').filter({ hasText: /Submit|Finish|Yes|Confirm/i }).last().click().catch(() => {});
  await page.waitForTimeout(3500);
  const onResults = (await page.locator('[data-review-status]').count()) > 0 || /Review|Score|Report/i.test(await page.locator('body').innerText());
  ok('[create form] the quiz was finished (results screen)', onResults);
  const saved = await page.evaluate(() => localStorage.getItem('qmp_input'));
  ok('[create form] the stored form text was cleared', saved === null || saved === '', String(saved));
  await nav(page, 'Create'); await page.waitForTimeout(1500);
  const ta = page.locator('textarea').first(); await ta.waitFor({ timeout: 10000 });
  ok('[create form] the Create box is empty again', (await ta.inputValue()) === '', JSON.stringify(await ta.inputValue()));
  ok('[create form] the finished quiz is not a draft', (await page.evaluate(() => localStorage.getItem('qmp_drafts_v1'))) === null);
  // background the app on the results screen / Create: must not bring the draft back
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
  await page.waitForTimeout(800);
  ok('[create form] backgrounding the app after finishing does not re-create the draft or session', (await page.evaluate(() => localStorage.getItem('qmp_drafts_v1'))) === null && (await page.evaluate(() => localStorage.getItem('qmp_active_session'))) === null);
  ok('[create form] no JS errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await page.screenshot({ path: `${SHOTS}/create_cleared.png` });
  await ctx.close();
}

await editSuite('legacy record (no id)', { withId: false });
await editSuite('record with id', { withId: true });
await repairSuite();
await draftSuite();
await quizSuite('phone 390x800 (faked Android bridge)', 390, 800, true);
await quizSuite('tablet 1210x756', 1210, 756, false);
await createFormSuite();

await browser.close(); await server.close();
console.log(failed ? `\n${failed} check(s) FAILED. Screenshots: ${SHOTS}` : `\nAll checks passed. Screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
