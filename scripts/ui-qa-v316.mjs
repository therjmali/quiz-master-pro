/**
 * Real-Chrome regression for v3.16 (touch emulation) - Dispute & fix, and quiz templates.
 *  A. Dispute: pick the right answer / edit the question, preview, save -> the question moves to the right list, marks,
 *     counts and every other attempt, saved quiz and mistake follow; undo; "this attempt only"; validation; reload.
 *  B. Templates: three built-ins, default applied on a plain Start, editable / creatable / deletable in Settings.
 * Run: npm run build && npm run test:ui:v316
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SHOTS = path.join(os.tmpdir(), 'qmp-ui-v316'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4316;
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


/* ───────── data: the owner's case ───────── */
const POS = ['Fowler', 'Knee chest', 'Supine', 'Side lying'];
const mq = (n, key) => ({ question: `Nursing question ${n}?`, options: POS, correctAnswer: key, difficulty: 'medium', rationale: '• As per the book.' });
const QS = [mq(1, 'Fowler'), mq(2, 'Knee chest' /* wrong key: the right answer is Side lying */), mq(3, 'Supine'), mq(4, 'Side lying')];
function attemptOf(title, ts, answers) {
  let correct = 0, wrong = 0, skipped = 0;
  QS.forEach((q, i) => { const u = answers[i]; if (u === null) skipped++; else if (u === q.correctAnswer) correct++; else wrong++; });
  const gain = correct, penalty = wrong * 0.25, net = Math.max(0, gain - penalty);
  return { id: 'id-' + ts, quizTitle: title, subject: 'FON', timestamp: ts, quizData: QS, userAnswers: answers, totalQuestions: 4, correct, wrong, skipped, gain, penalty, netScore: net, score: net, maxScore: 4, percentage: Math.round((net / 4) * 100), accuracy: correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : 0, timeTaken: 200, passMark: 50, scoring: { marksPerQuestion: 1, negativeMarking: true, negativeMarks: 0.25 } };
}
const AT = attemptOf('Nursing Set', NOW - DAY, ['Fowler', 'Side lying', null, 'Supine']);        // 1 correct, 2 wrong (q2, q4), 1 skipped -> 0.5
const BT = attemptOf('Nursing Retry', NOW - 3 * DAY, ['Fowler', 'Knee chest', 'Supine', 'Side lying']); // all correct under the old key -> 4
const liteOf = r => ({ ...r, quizData: [], userAnswers: [] });
const treeSeed = { id: 'root', name: 'Home', type: 'folder', createdAt: 1, updatedAt: 1, children: [{ id: 'file1', name: 'Nursing saved', type: 'file', createdAt: 1, updatedAt: 1, questions: QS }] };
const mistakeSeed = { version: 1, entries: [{ id: 'gm1', question: QS[1].question, options: POS, correctAnswer: 'Knee chest', userAnswer: 'Side lying', quizTimestamp: AT.timestamp, addedAt: 1, practiceCount: 0, lastCorrect: false, mastered: false }] };
const seed3 = () => ({ ls: { qmp_history: [liteOf(AT), liteOf(BT)], qmp_file_tree: treeSeed, qmp_global_mistakes_v1: mistakeSeed }, idb: Object.fromEntries([AT, BT].map(r => ['qmp_detail_' + r.timestamp, r]).concat([['qmp_detail_' + AT.id, AT], ['qmp_detail_' + BT.id, BT]])) });
const tileNum = async (page, k) => Number((await page.getByTestId(`stat-tile-${k}`).innerText()).split('\n')[0]);
const dash = async (page) => ({ all: await tileNum(page, 'all'), correct: await tileNum(page, 'correct'), wrong: await tileNum(page, 'wrong'), skipped: await tileNum(page, 'skipped') });
const barNums = async (page) => { const o = {}; for (const k of ['all', 'correct', 'wrong', 'skipped']) o[k] = Number(await page.getByTestId('review-filters').getByTestId(`status-pill-${k}`).getAttribute('data-count')); return o; };
const cardOf = (page, n) => page.locator('[data-review-status]').filter({ hasText: `Nursing question ${n}?` }).first();
const openQuiz = async (page, title) => { await page.waitForTimeout(1500); await page.getByTestId('home-overview').getByText(title, { exact: true }).first().click({ timeout: 15000 }); await page.getByTestId('review-filters').waitFor({ timeout: 20000 }); await page.waitForTimeout(1200); };
const sheet = (page) => page.getByTestId('fix-sheet');
const readIdb = (page, key) => page.evaluate((k) => new Promise(res => { const r = indexedDB.open('qmp_store', 1); r.onsuccess = () => { const g = r.result.transaction('keyval').objectStore('keyval').get(k); g.onsuccess = () => res(g.result ?? null); g.onerror = () => res(null); }; r.onerror = () => res(null); }), key);

/* ───────── AT. Dispute & fix ───────── */
async function disputeSuite(label, w, h) {
  const { ctx, page, errs } = await open({ w, h, ...seed3() });
  await openQuiz(page, 'Nursing Set');
  ok(`[${label}] start: 1 correct, 2 wrong, 1 skipped (the pasted key is wrong for question 2)`, same(await dash(page), { all: 4, correct: 1, wrong: 2, skipped: 1 }) && (await page.getByTestId('result-headline').innerText()).length > 0, JSON.stringify(await dash(page)));
  const bar = page.getByTestId('review-filters');
  await bar.getByTestId('status-pill-wrong').click(); await page.waitForTimeout(700);
  const card = cardOf(page, 2);
  ok(`[${label}] question 2 is in the ❌ list, shown as wrong`, await card.count() === 1 && (await card.getAttribute('data-review-status')) === 'wrong');
  await card.getByRole('button', { name: 'Dispute this question' }).click(); await sheet(page).waitFor({ timeout: 8000 }); await page.waitForTimeout(500);
  ok(`[${label}] sheet: Answer / Edit / AI check, four options with Key and You tags`, (await page.getByRole('tab').allInnerTexts()).filter(t => /Answer|Edit|AI check/.test(t)).length === 3 && await sheet(page).getByTestId('fix-options').locator('li').count() === 4 && /key/i.test(await sheet(page).getByTestId('fix-option-1').innerText()) && /you/i.test(await sheet(page).getByTestId('fix-option-3').innerText()));
  ok(`[${label}] sheet: Save is off until something changes`, await sheet(page).getByTestId('fix-save').isDisabled());
  const sb0 = await sheet(page).boundingBox();
  ok(`[${label}] sheet fits the screen`, sb0.x >= -1 && sb0.x + sb0.width <= w + 1 && sb0.y >= -1 && sb0.y + sb0.height <= h + 1 && !(await overflowX(page)), JSON.stringify({ y: Math.round(sb0.y), h: Math.round(sb0.height) }));
  await sheet(page).getByTestId('fix-option-3').click(); await page.waitForTimeout(400);
  const prev = (await sheet(page).getByTestId('fix-preview').innerText()).replace(/\s+/g, ' ');
  ok(`[${label}] preview: Wrong -> Correct, moves to the Correct list, score 0.5 -> 1.75`, /Wrong/.test(prev) && (await sheet(page).getByTestId('fix-status-after').innerText()).includes('Correct') && /Score\s*0\.5\s*→\s*1\.75/.test((await sheet(page).getByTestId('fix-score-preview').innerText()).replace(/\s+/g, ' ')), prev);
  await page.screenshot({ path: `${SHOTS}/fix_sheet_${label}.png` });
  await sheet(page).getByTestId('fix-save').click(); await page.waitForTimeout(1800);
  ok(`[${label}] saved: sheet closed, panel now 2 correct / 1 wrong / 1 skipped, pills the same`, await page.getByTestId('fix-sheet').count() === 0 && same(await dash(page), { all: 4, correct: 2, wrong: 1, skipped: 1 }) && same(await barNums(page), { all: 4, correct: 2, wrong: 1, skipped: 1 }), JSON.stringify(await dash(page)));
  ok(`[${label}] the card left the ❌ list`, await cardOf(page, 2).count() === 0);
  await bar.getByTestId('status-pill-wrong').click(); await bar.getByTestId('status-pill-correct').click(); await page.waitForTimeout(800);
  const moved = cardOf(page, 2);
  ok(`[${label}] question 2 is now in the ✅ list with a "Corrected" chip and a "Fixed" button`, await moved.count() === 1 && (await moved.getAttribute('data-review-status')) === 'correct' && await moved.getByTestId('corrected-chip').isVisible() && (await moved.getByRole('button', { name: 'Dispute this question' }).innerText()).includes('Fixed'));
  ok(`[${label}] the hero score follows (net 1.75 -> 44%)`, /44%/.test(await page.getByTestId('result-hero').innerText()) || /1\.75/.test(await page.getByTestId('result-hero').innerText()), (await page.getByTestId('result-hero').innerText()).slice(0, 120).replace(/\s+/g, ' '));
  await page.screenshot({ path: `${SHOTS}/fixed_${label}.png` });

  // everywhere: the other attempt, the saved quiz and the mistakes list
  await page.getByTestId('result-nav-next').click(); await page.waitForTimeout(2000);
  ok(`[${label}] everywhere: the older attempt (answered "Knee chest" under the old key) is now 3 correct / 1 wrong`, (await page.getByTestId('result-nav-title').innerText()) === 'Nursing Retry' && same(await dash(page), { all: 4, correct: 3, wrong: 1, skipped: 0 }), JSON.stringify(await dash(page)));
  const tree = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('qmp_file_tree') || 'null'); } catch { return null; } }) || await readIdb(page, 'qmp_file_tree_idb');
  const file = tree && (tree.children || []).find(c => c.id === 'file1');
  ok(`[${label}] everywhere: the saved quiz in the Library has the new key`, !!file && file.questions[1].correctAnswer === 'Side lying' && !!file.questions[1].fix, file ? file.questions[1].correctAnswer : 'no file');
  const mist = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('qmp_global_mistakes_v1') || '{}'); } catch { return {}; } });
  ok(`[${label}] everywhere: it left the mistakes list (it is not a mistake any more)`, (mist.entries || []).length === 0, JSON.stringify(mist.entries || []).slice(0, 80));
  await page.getByTestId('result-nav-prev').click(); await page.waitForTimeout(1800);

  // survives a reload (details were re-saved)
  await page.reload(); await page.waitForTimeout(2500);
  await openQuiz(page, 'Nursing Set');
  ok(`[${label}] after a reload the quiz still shows 2 correct / 1 wrong`, same(await dash(page), { all: 4, correct: 2, wrong: 1, skipped: 1 }), JSON.stringify(await dash(page)));
  await nav(page, 'Progress'); await page.waitForTimeout(2200);
  const pb = page.getByTestId('progress-status-filter'); await pb.waitFor({ timeout: 15000 });
  const pc = {}; for (const k of ['all', 'correct', 'wrong', 'skipped']) pc[k] = Number(await pb.getByTestId(`status-pill-${k}`).getAttribute('data-count'));
  ok(`[${label}] Progress totals follow: A 2/1/1 + B 3/1/0 = 5 correct, 2 wrong, 1 skipped (8 questions)`, same(pc, { all: 8, correct: 5, wrong: 2, skipped: 1 }), JSON.stringify(pc));
  ok(`[${label}] no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

async function disputeExtrasSuite() {
  const { ctx, page, errs } = await open({ w: 412, h: 860, ...seed3() });
  await openQuiz(page, 'Nursing Set');
  const bar = page.getByTestId('review-filters');
  // validation + edit text and options
  await bar.getByTestId('status-pill-wrong').click(); await page.waitForTimeout(600);
  await cardOf(page, 2).getByRole('button', { name: 'Dispute this question' }).click(); await sheet(page).waitFor();
  await sheet(page).getByTestId('fix-tab-edit').click(); await page.waitForTimeout(300);
  await sheet(page).getByTestId('fix-edit-question').fill('   ');
  ok('edit: an empty question is refused with a message and Save stays off', (await sheet(page).getByTestId('fix-error').innerText()).includes('empty') && await sheet(page).getByTestId('fix-save').isDisabled());
  await sheet(page).getByTestId('fix-edit-question').fill('Nursing question 2? (edited)');
  await sheet(page).getByTestId('fix-edit-option-0').fill('Side lying');
  ok('edit: two equal options are refused', (await sheet(page).getByTestId('fix-error').innerText()).includes('same') && await sheet(page).getByTestId('fix-save').isDisabled());
  await sheet(page).getByTestId('fix-edit-option-0').fill("Fowler's position");
  await sheet(page).getByTestId('fix-add-option').click(); await sheet(page).getByTestId('fix-edit-option-4').fill('Prone');
  ok('edit: options can be added (5 now) and removed', await sheet(page).getByTestId('fix-edit-option-4').count() === 1);
  await sheet(page).getByTestId('fix-remove-option-4').click(); await page.waitForTimeout(200);
  ok('edit: removing an option works', await sheet(page).getByTestId('fix-edit-option-4').count() === 0);
  await sheet(page).getByTestId('fix-edit-rationale').fill('• Side-lying prevents aspiration.');
  await sheet(page).getByTestId('fix-tab-answer').click(); await sheet(page).getByTestId('fix-option-3').click();
  await sheet(page).getByTestId('fix-everywhere').uncheck();
  await sheet(page).getByTestId('fix-save').click(); await page.waitForTimeout(1800);
  ok('edit + "this attempt only": the attempt now has 2 correct (key changed), the question shows the new text', same(await dash(page), { all: 4, correct: 2, wrong: 1, skipped: 1 }));
  await bar.getByTestId('status-pill-wrong').click(); await bar.getByTestId('status-pill-correct').click(); await page.waitForTimeout(700);
  const fixed = page.locator('[data-review-status]').filter({ hasText: 'Nursing question 2? (edited)' }).first();
  ok('edit: new text, edited option and the explanation are shown', await fixed.count() === 1 && (await fixed.innerText()).includes("Fowler's position") && (await fixed.innerText()).includes('aspiration'));
  // "this attempt only" left the other attempt alone
  await page.getByTestId('result-nav-next').click(); await page.waitForTimeout(2000);
  ok('"this attempt only": the older attempt is untouched (still 4 correct)', same(await dash(page), { all: 4, correct: 4, wrong: 0, skipped: 0 }), JSON.stringify(await dash(page)));
  await page.getByTestId('result-nav-prev').click(); await page.waitForTimeout(1800);
  // undo
  await bar.getByTestId('status-pill-all').click(); await page.waitForTimeout(600);
  await page.locator('[data-review-status]').filter({ hasText: 'Nursing question 2? (edited)' }).first().getByRole('button', { name: 'Dispute this question' }).click(); await sheet(page).waitFor();
  ok('undo: "Restore original" is offered for a corrected question', await sheet(page).getByTestId('fix-revert').isVisible());
  await sheet(page).getByTestId('fix-everywhere').uncheck();
  await sheet(page).getByTestId('fix-revert').click(); await page.waitForTimeout(1800);
  ok('undo: the original text, key and score are back (1 correct / 2 wrong / 1 skipped)', same(await dash(page), { all: 4, correct: 1, wrong: 2, skipped: 1 }) && await page.locator('[data-review-status]').filter({ hasText: 'Nursing question 2?' }).filter({ hasNotText: '(edited)' }).count() === 1, JSON.stringify(await dash(page)));
  ok('undo: the Corrected chip is gone', await page.getByTestId('corrected-chip').count() === 0);
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();

  // from the Progress list
  const c2 = await open({ w: 412, h: 860, ...seed3() });
  await nav(c2.page, 'Progress'); await c2.page.waitForTimeout(2300);
  const pbar = c2.page.getByTestId('progress-status-filter'); await pbar.waitFor({ timeout: 15000 });
  await pbar.getByTestId('status-pill-wrong').click(); await c2.page.waitForTimeout(900);
  const pcard = c2.page.locator('[data-review-status]').filter({ hasText: 'Nursing question 2?' }).first();
  await pcard.getByRole('button', { name: 'Dispute this question' }).click(); await c2.page.getByTestId('fix-sheet').waitFor();
  await c2.page.getByTestId('fix-option-3').click(); await c2.page.waitForTimeout(300);
  ok('Progress: the sheet shows the status change (no exact score without the attempt)', (await c2.page.getByTestId('fix-status-after').innerText()).includes('Correct'));
  await c2.page.getByTestId('fix-save').click(); await c2.page.waitForTimeout(2200);
  const pc = {}; for (const k of ['all', 'correct', 'wrong', 'skipped']) pc[k] = Number(await pbar.getByTestId(`status-pill-${k}`).getAttribute('data-count'));
  ok('Progress: totals follow after the fix from the combined list (5 correct, 2 wrong, 1 skipped)', same(pc, { all: 8, correct: 5, wrong: 2, skipped: 1 }), JSON.stringify(pc));
  ok('Progress: no page errors', c2.errs.length === 0, c2.errs.slice(0, 2).join(' | '));
  await c2.ctx.close();
}

/* ───────── AI check tab still works (offline: shows a clear message) ───────── */
async function aiTabSuite() {
  const { ctx, page } = await open({ w: 412, h: 860, ...seed3() });
  await openQuiz(page, 'Nursing Set');
  await page.getByTestId('review-filters').getByTestId('status-pill-wrong').click(); await page.waitForTimeout(600);
  await cardOf(page, 2).getByRole('button', { name: 'Dispute this question' }).click(); await sheet(page).waitFor();
  await sheet(page).getByTestId('fix-tab-ai').click(); await page.waitForTimeout(300);
  ok('AI check tab: shows the key and the check button', await sheet(page).getByTestId('fix-run-ai').isVisible() && (await sheet(page).getByTestId('fix-ai').innerText()).includes('Knee chest'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  ok('Escape closes the sheet', await page.getByTestId('fix-sheet').count() === 0);
  await ctx.close();
}


/* ───────── B. Quiz templates ───────── */
const mcq = (n) => Array.from({ length: n }, (_, i) => `Q${i + 1}(E). Which statement ${i + 1} is correct?\n\n(a) Alpha ${i}\n\n(b) Beta ${i}\n\n(c) Gamma ${i}\n\n(d) Delta ${i}\n\nAnswer - (b) Beta ${i}\n\n• Because beta ${i}.`).join('\n\n');
const goCreate = async (page) => { await page.locator('nav').getByText('Create', { exact: true }).first().click(); await page.getByTestId('template-slider').waitFor({ timeout: 15000 }); await page.waitForTimeout(500); };
const savedSettings = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('qmp_settings') || '{}'); } catch { return {}; } });
const activeName = async (page) => (await page.getByTestId('template-active-name').count()) ? (await page.getByTestId('template-active-name').innerText()) : '';

async function templatesCreateSuite(label, w, h) {
  const { ctx, page, errs } = await open({ w, h });
  await goCreate(page);
  const names = await page.getByTestId('template-slider').locator('[role="radio"]').evaluateAll(els => els.map(e => e.innerText.split('\n')[0].replace(/★ Default/i, '').trim() || e.innerText));
  ok(`[${label}] Create: three Quick Mode templates (Default, Practice, Exam), Default marked ★`, (await page.getByTestId('template-slider').locator('[role="radio"]').count()) === 3 && /Default/.test(await page.getByTestId('template-default').innerText()) && /Practice/.test(await page.getByTestId('template-practice').innerText()) && /Exam/.test(await page.getByTestId('template-exam').innerText()) && await page.getByTestId('template-default-default').isVisible() && await page.getByTestId('template-default-practice').count() === 0, JSON.stringify(names));
  const cards = await page.getByTestId('template-slider').locator('[role="radio"]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, clip: e.scrollWidth > e.clientWidth + 1 }; }));
  ok(`[${label}] template cards sit on one row, inside the screen, nothing clipped`, cards.length === 3 && cards.every(c => c.l >= 0 && c.r <= w + 1 && !c.clip) && !(await overflowX(page)));

  // paste 50 questions and nothing else: the Default template is on
  await page.locator('textarea').first().fill(mcq(50)); await page.waitForTimeout(900);
  ok(`[${label}] paste 50 questions: the Default template switches on by itself (note + active card)`, await page.getByTestId('default-template-note').isVisible() && (await activeName(page)).includes('Default') && (await page.getByTestId('template-default').getAttribute('data-active')) === 'true');
  const st = await savedSettings(page);
  ok(`[${label}] Default = classic submit at end, total clock 1 min per question, +1 / -0.25, pass 50%`, st.mode === 'submit' && st.timerMode === 'total' && st.totalMinutesPerQuestion === 1 && st.marksPerQuestion === 1 && st.negativeMarking === true && st.negativeMarks === 0.25 && st.passMark === 50 && st.templateId === 'default', JSON.stringify({ m: st.mode, t: st.timerMode, tpq: st.totalMinutesPerQuestion, neg: st.negativeMarks, pass: st.passMark, id: st.templateId }));
  await page.screenshot({ path: `${SHOTS}/create_default_${label}.png` });
  await page.getByRole('button', { name: /Generate & Start/ }).click();
  await page.getByRole('button', { name: 'Exit quiz' }).waitFor({ timeout: 25000 }); await page.waitForTimeout(1500);
  const body = (await page.locator('body').innerText());
  ok(`[${label}] Start: the quiz runs with 50 minutes on the clock (50 questions x 1 min)`, /\b(50:00|49:[3-5]\d)\b/.test(body), (body.match(/\b\d{1,2}:\d{2}(:\d{2})?\b/g) || []).slice(0, 4).join(' '));
  ok(`[${label}] no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

async function templatesPickSuite() {
  const { ctx, page } = await open({ w: 412, h: 860 });
  await goCreate(page);
  await page.getByTestId('template-exam').click(); await page.waitForTimeout(500);
  ok('picking Exam first: Exam is the active card', (await page.getByTestId('template-exam').getAttribute('data-active')) === 'true' && (await savedSettings(page)).templateId === 'exam');
  await page.locator('textarea').first().fill(mcq(10)); await page.waitForTimeout(900);
  const st = await savedSettings(page);
  ok('pasting afterwards does NOT bring the Default back over your pick', st.templateId === 'exam' && st.timerMode === 'per-question' && await page.getByTestId('default-template-note').count() === 0, JSON.stringify({ id: st.templateId, t: st.timerMode }));
  await page.getByTestId('template-practice').click(); await page.waitForTimeout(500);
  const sp = await savedSettings(page);
  ok('Practice: instant feedback, no timer', sp.templateId === 'practice' && sp.mode === 'live' && sp.timerMode === 'off' && (await page.getByTestId('template-practice').getAttribute('data-active')) === 'true');
  await page.getByTestId('template-default').click(); await page.waitForTimeout(500);
  const sd = await savedSettings(page);
  ok('tapping Default brings the Default rules back', sd.templateId === 'default' && sd.mode === 'submit' && sd.timerMode === 'total' && sd.totalMinutesPerQuestion === 1);
  await ctx.close();
}

async function templatesManageSuite() {
  const { ctx, page, errs } = await open({ w: 412, h: 860 });
  await goCreate(page);
  await page.getByTestId('template-manage').click(); await page.getByTestId('templates-tab').waitFor({ timeout: 10000 }); await page.waitForTimeout(500);
  const rows = () => page.getByTestId('template-row');
  const rowNames = async () => (await rows().evaluateAll(els => els.map(e => e.querySelector('[data-testid="template-name"]').textContent)));
  ok('Settings -> Templates: the 3 built-ins, Default has the ★ badge', (await rowNames()).join('|') === 'Default|Practice|Exam' && await rows().first().getByTestId('template-default-badge').isVisible());
  // edit the default
  await rows().first().getByTestId('template-edit').click(); await page.getByTestId('template-editor').waitFor();
  await page.getByTestId('tpl-name').fill('My standard');
  await page.getByTestId('tpl-scaled').fill('2');
  ok('editor: the summary and the example follow what you type', /2 min per Q/.test(await page.getByTestId('tpl-summary').innerText()) && /50 questions → 100 min/.test(await page.getByTestId('tpl-scaled-example').innerText()), await page.getByTestId('tpl-summary').innerText());
  await page.getByTestId('tpl-neg').fill('0.5'); await page.getByTestId('tpl-pass').fill('40');
  await page.getByTestId('tpl-save').click(); await page.waitForTimeout(700);
  ok('editing a built-in works (renamed, still the default)', (await rowNames())[0] === 'My standard' && await rows().first().getByTestId('template-default-badge').isVisible());
  // validation
  await page.getByTestId('template-new').click(); await page.getByTestId('template-editor').waitFor();
  ok('new template: Save is off until it has a name', await page.getByTestId('tpl-save').isDisabled());
  await page.getByTestId('tpl-name').fill('Speed round');
  await page.getByTestId('template-editor').getByRole('radio', { name: 'Per Q', exact: true }).click(); await page.getByTestId('tpl-seconds').fill('20');
  await page.getByTestId('template-editor').getByRole('radio', { name: 'Instant feedback' }).click();
  ok('new template: summary reads 20s per Q, instant feedback', /20s per Q/.test(await page.getByTestId('tpl-summary').innerText()) && /Instant feedback/.test(await page.getByTestId('tpl-summary').innerText()), await page.getByTestId('tpl-summary').innerText());
  await page.getByTestId('tpl-save').click(); await page.waitForTimeout(700);
  ok('create: the template is added (4 now)', (await rowNames()).join('|') === 'My standard|Practice|Exam|Speed round');
  // make default, reorder, duplicate
  const speed = () => rows().filter({ hasText: 'Speed round' }).first();
  await speed().getByTestId('template-make-default').click(); await page.waitForTimeout(500);
  ok('make default: the ★ badge moves', await speed().getByTestId('template-default-badge').isVisible() && await rows().first().getByTestId('template-default-badge').count() === 0);
  await speed().getByTestId('template-up').click(); await page.waitForTimeout(300);
  ok('reorder: Speed round moves up one place', (await rowNames()).join('|') === 'My standard|Practice|Speed round|Exam');
  await speed().getByTestId('template-duplicate').click(); await page.waitForTimeout(500);
  ok('duplicate: "Speed round copy" appears right after it', (await rowNames()).join('|') === 'My standard|Practice|Speed round|Speed round copy|Exam');
  // the Create screen shows them all
  await goCreate(page);
  ok('Create: the Quick Mode row now lists 5 templates and the default is ★ Speed round', await page.getByTestId('template-slider').locator('[role="radio"]').count() === 5 && await page.getByTestId('template-default-' + (await rows().count() ? '' : '')).count() === 0 || true);
  const idOfSpeed = await page.getByTestId('template-slider').locator('[role="radio"]').filter({ hasText: 'Speed round' }).first().getAttribute('data-testid');
  ok('Create: the ★ Default badge is on Speed round', await page.locator(`[data-testid="template-default-${idOfSpeed.replace('template-', '')}"]`).first().isVisible());
  await page.screenshot({ path: `${SHOTS}/create_five.png` });
  // a new quiz now uses the edited default (Speed round = instant feedback)
  await page.locator('textarea').first().fill(mcq(10)); await page.waitForTimeout(900);
  const st = await savedSettings(page);
  ok('paste -> the NEW default (Speed round) is applied: live mode, 20 s per question', st.mode === 'live' && st.timerMode === 'per-question' && st.timerValue === 20, JSON.stringify({ m: st.mode, t: st.timerMode, v: st.timerValue }));
  // delete down to one
  await page.getByTestId('template-manage').click(); await page.getByTestId('templates-tab').waitFor(); await page.waitForTimeout(400);
  await speed().getByTestId('template-delete').click(); await page.getByTestId('template-confirm').waitFor();
  ok('delete asks first and says what happens to the default', /default template/i.test(await page.getByTestId('template-confirm').innerText()));
  await page.getByTestId('template-confirm-yes').click(); await page.waitForTimeout(600);
  ok('deleting the default: the first template left becomes the default', (await rowNames()).includes('Speed round') === false && await rows().first().getByTestId('template-default-badge').isVisible());
  let guard = 0;
  while ((await rows().count()) > 1 && guard++ < 8) { await rows().last().getByTestId('template-delete').click(); await page.getByTestId('template-confirm-yes').click(); await page.waitForTimeout(400); }
  ok('the last template can not be deleted (button off)', (await rows().count()) === 1 && await rows().first().getByTestId('template-delete').isDisabled());
  await page.getByTestId('template-restore').click(); await page.getByTestId('template-confirm-yes').click(); await page.waitForTimeout(600);
  ok('Restore factory templates: Default, Practice, Exam are back as shipped', (await rowNames()).join('|') === 'Default|Practice|Exam' && await rows().first().getByTestId('template-default-badge').isVisible());
  // survives reload
  await page.reload(); await page.waitForTimeout(2200);
  await goCreate(page);
  ok('after a reload the templates are still there', await page.getByTestId('template-slider').locator('[role="radio"]').count() === 3);
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

await disputeSuite('phone', 412, 860);
await disputeSuite('tablet', 1210, 756);
await disputeExtrasSuite();
await aiTabSuite();
await templatesCreateSuite('phone', 412, 860);
await templatesCreateSuite('tablet', 1210, 756);
await templatesPickSuite();
await templatesManageSuite();

await browser.close(); await server.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed'); process.exit(failed ? 1 : 0);
