/**
 * Real-Chrome regression for v2.9: Drafts (max 5, resume, exit saves), compact report grid, capsule filters,
 * emoji one-line question card + bottom action bar.
 * Run: npm run build && npm run test:ui:v29
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SHOTS = path.join(os.tmpdir(), 'qmp-ui-v29'); fs.mkdirSync(SHOTS, { recursive: true });
const server = await preview({ configFile: path.resolve('vite.config.ts'), preview: { port: 4204, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.PW_CHANNEL || 'chrome' }), args: ['--no-sandbox'] });
let failed = 0;
const ok = (name, pass, info = '') => { if (!pass) failed++; console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  - ' + info : '')); };

const mkQuiz = (tag, n = 6) => Array.from({ length: n }, (_, i) => ({ question: `${tag} question ${i + 1}: which drug fits case ${i + 1}?`, options: ['Alpha drug', 'Beta blocker', 'Gamma globulin', 'Delta agent'], correctAnswer: 'Beta blocker', difficulty: ['easy', 'medium', 'hard'][i % 3], rationale: i % 2 === 0 ? `Beta blockers slow the heart (${tag} ${i + 1}).` : undefined }));
const draft = (tag, savedAt) => {
  const quizData = mkQuiz(tag);
  const d = { id: `d-${tag}`, title: `Draft ${tag}`, subject: 'Pharma', total: quizData.length, answered: 2, index: 2, savedAt, deviceId: tag === 'F' ? 'dev_other' : 'dev_me', deviceName: tag === 'F' ? 'Tablet' : 'Phone',
    session: { quizData, settings: { quizTitle: `Draft ${tag}`, subject: 'Pharma', timerMode: 'off', timerValue: 30, timerUnit: 'sec', negativeMarking: false, marksPerQuestion: 1, negativeMarks: 0 }, currentIndex: 2, userAnswers: ['Beta blocker', 'Alpha drug', null, null, null, null], flaggedQuestions: [false, false, false, false, false, false], accumulatedTime: 20, timeLeftPerQ: [], forcedNext: [], totalTimeLeft: 0, savedAt } };
  return d;
};
const drafts = { v: 1, items: {} };
['A', 'B', 'C', 'D', 'E', 'F'].forEach((t, i) => { const d = draft(t, Date.now() - (6 - i) * 3600_000); drafts.items[d.id] = JSON.stringify(d); });

const qd = mkQuiz('Result', 12);
const ans = qd.map((q, i) => (i < 5 ? 'Beta blocker' : i < 9 ? 'Alpha drug' : null));
const result = { id: 'qa-1', quizTitle: 'QA Pharmacology Set', subject: 'Pharmacology', timestamp: Date.now() - 3600_000, quizData: qd, userAnswers: ans, totalQuestions: 12, percentage: 42, score: 5, maxScore: 12, netScore: 5, correct: 5, wrong: 4, skipped: 3, gain: 5, penalty: 0, accuracy: 56, timeTaken: 400, passMark: 50 };

async function run(label, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 4\d\d|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  await page.addInitScript(([r, d]) => { localStorage.setItem('qmp_onboarding_done', 'true'); localStorage.setItem('qmp_history', JSON.stringify([r])); localStorage.setItem('qmp_drafts_v1', JSON.stringify(d)); localStorage.setItem('qm-cloud-device-v1', JSON.stringify({ id: 'dev_me', name: 'Phone', platform: 'android' })); }, [result, drafts]);
  await page.goto('http://127.0.0.1:4204/'); await page.waitForTimeout(1800);

  // ── Drafts ──
  const rail = page.getByTestId('drafts-rail');
  await rail.waitFor({ timeout: 15000 }).catch(() => {});
  const cards = await rail.locator('article').count();
  ok(`[${label}] drafts rail shows at most 5 of 6 saved drafts`, cards === 5, `${cards} cards`);
  ok(`[${label}] newest draft first, the oldest (A) was dropped`, (await rail.locator('article').first().innerText()).includes('Draft F') && !(await rail.innerText()).includes('Draft A'));
  ok(`[${label}] draft from another device is labelled`, /Tablet/.test(await rail.locator('article').first().innerText()));
  ok(`[${label}] drafts header shows 5/5`, /5\/5/.test(await page.locator('section[aria-label="Drafts"]').innerText()));
  await page.screenshot({ path: `${SHOTS}/dashboard_${label}.png` });
  // the rail scrolls sideways smoothly
  ok(`[${label}] drafts rail is a horizontal scroller`, await rail.evaluate(el => getComputedStyle(el).overflowX === 'auto' || getComputedStyle(el).overflowX === 'scroll'));

  // resume then exit -> the draft is kept, still 5, no duplicate
  await rail.locator('article').nth(1).getByRole('button', { name: /Resume/ }).click();
  await page.getByRole('button', { name: 'Exit quiz' }).waitFor({ timeout: 15000 });
  ok(`[${label}] resuming a draft opens the quiz`, await page.getByRole('button', { name: 'Exit quiz' }).isVisible());
  await page.getByRole('button', { name: 'Exit quiz' }).click(); await page.waitForTimeout(500);
  ok(`[${label}] exit dialog explains drafts`, /Drafts/.test(await page.locator('[role="alertdialog"]').innerText()));
  await page.getByRole('button', { name: /Save & exit/ }).click(); await page.waitForTimeout(1200);
  await page.getByTestId('drafts-rail').waitFor({ timeout: 10000 });
  const after = JSON.parse(await page.evaluate(() => localStorage.getItem('qmp_drafts_v1')));
  const ids = Object.keys(after.items);
  ok(`[${label}] exit keeps exactly 5 drafts, no duplicate`, ids.length === 5 && new Set(ids).size === 5, ids.join(','));
  ok(`[${label}] the exited quiz moved to the top`, (await page.getByTestId('drafts-rail').locator('article').first().innerText()).includes('Draft E'));

  // ── Progress: compact report grid ──
  await page.locator('nav').getByText('Progress', { exact: true }).first().click(); await page.waitForTimeout(1500);
  await page.getByTestId('report-grid').waitFor({ timeout: 15000 });
  const tiles = await page.getByTestId('report-grid').locator('[role="listitem"]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
  const rows = [...new Set(tiles.map(t => t.y))], cols = [...new Set(tiles.map(t => t.x))];
  ok(`[${label}] report buttons form a compact grid: 8 tiles in exactly 2 lines`, tiles.length === 8 && rows.length === 2 && cols.length === 4, `rows=${rows.length} cols=${cols.length}`);
  ok(`[${label}] tiles are equal squircles inside the card`, new Set(tiles.map(t => t.w)).size <= 2 && tiles.every(t => t.x >= 0 && t.x + t.w <= w), JSON.stringify(tiles[0]));
  const sub = page.getByTestId('reports-subtitle');
  const sb = await sub.boundingBox();
  ok(`[${label}] "Made on your device. Works offline. Saved to Downloads." is one straight line`, (await sub.innerText()) === 'Made on your device. Works offline. Saved to Downloads.' && sb.height < 20 && await sub.evaluate(e => e.scrollWidth <= e.clientWidth + 1), `h=${Math.round(sb.height)}`);
  const caps = await page.getByTestId('report-filters').locator('button').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return Math.round(r.y + r.height / 2); }));
  ok(`[${label}] report filters are one swipeable capsule line`, Math.max(...caps) - Math.min(...caps) <= 3 && caps.length >= 6 && await page.getByTestId('report-filters').evaluate(e => getComputedStyle(e).overflowX === 'auto'), `${caps.length} capsules`);
  ok(`[${label}] Progress fits the width`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await page.getByTestId('report-grid').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/reports_${label}.png` });

  // ── Review dashboard ──
  await page.getByText('QA Pharmacology Set').first().click({ timeout: 10000 });
  await page.getByTestId('review-filters').waitFor({ timeout: 20000 });
  const fb = page.getByTestId('review-filters').locator('button');
  const labels = await fb.allInnerTexts();
  ok(`[${label}] status filters: "All" has text, the rest are emoji only`, /All/.test(labels[0]) && labels.slice(1).every(t => t.trim().length > 0 && t.trim().length <= 3 && !/[A-Za-z]/.test(t)), JSON.stringify(labels));
  const ys = await fb.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().y)));
  ok(`[${label}] status filters sit on one line, capsule shaped`, new Set(ys).size === 1 && await fb.first().evaluate(e => parseFloat(getComputedStyle(e).borderTopLeftRadius) >= 16));
  const ob = await page.getByTestId('review-options').locator('> *').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return Math.round(r.y + r.height / 2); }));
  ok(`[${label}] view options (Answers, Book, AI, level, Explain) on one line`, Math.max(...ob) - Math.min(...ob) <= 3 && ob.length === 5, `${ob.length} items`);
  const head = page.getByTestId('review-card-header').first();
  const hy = await head.locator('> *').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2)));
  const hText = await head.innerText();
  ok(`[${label}] card header is one line: number, status emoji, difficulty emoji (no words)`, new Set(hy.map(v => Math.round(v / 4))).size === 1 && /^\d+\s*(✅|❌|⏭️)\s*(🟢|🟡|🔴)\s*$/.test(hText.replace(/\n/g, ' ').trim() + ' '), JSON.stringify(hText));
  const acts = page.getByTestId('review-card-actions').first().locator('button');
  const ay = await acts.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().y)));
  ok(`[${label}] bottom action bar: 📖 Rational | ⚖️ Dispute | 💾 Save | 🤖 AI on one line`, ay.length === 4 && new Set(ay).size === 1 && /📖/.test(await acts.nth(0).innerText()) && /⚖️/.test(await acts.nth(1).innerText()) && /💾/.test(await acts.nth(2).innerText()) && /🤖/.test(await acts.nth(3).innerText()));
  await page.getByTestId('review-filters').evaluate(e => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/review_${label}.png` });
  // rationale box: "Ans. - (b) …", purple bar, no book emoji in the title
  await acts.nth(0).click(); await page.waitForTimeout(500);
  const box = page.getByTestId('rationale-box').first();
  const bt = await box.innerText();
  ok(`[${label}] rationale box title is "Ans. - (x) text" without 📖`, /^Ans\. - \([a-d]\) /.test(bt) && !/📖/.test(bt.split('\n')[0]), bt.split('\n')[0]);
  // filter by wrong
  await page.getByRole('tab', { name: /^Wrong/ }).click(); await page.waitForTimeout(500);
  ok(`[${label}] ❌ filter shows only the 4 wrong questions`, (await page.locator('[data-review-status="wrong"]').count()) === 4 && (await page.locator('[data-review-status="correct"]').count()) === 0);
  ok(`[${label}] no JS errors`, errs.length === 0, errs.join(' | ').slice(0, 400));
  await ctx.close();
}
await run('phone 390x800', 390, 800);
await run('phone 360x740', 360, 740);
await run('tablet 1024x768', 1024, 768);
await browser.close(); await server.close();
console.log(failed ? `\n${failed} check(s) FAILED  (screenshots: ${SHOTS})` : `\nAll v2.9 UI checks passed  (screenshots: ${SHOTS})`);
process.exit(failed ? 1 : 0);
