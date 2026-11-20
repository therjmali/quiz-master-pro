/**
 * UI regression for v3.10 (real Chrome, touch emulation, Light + Dark):
 *  - review cards: colour + icon only (correct / wrong / skipped / multi-answer); the answer is the bold green option, no "(You answered: …)" and no separate "Ans. -" line
 *  - the Answers show/hide modal is gone from the review options (answers are always shown)
 *  - Shuffle (Create Quiz) and Rationale (report panel + review popup) switches really switch, in Light and Dark
 *  - Paste: native bridge, web fallback, blocked and empty clipboard
 * Run: npm run build && npm run test:ui:v310
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SHOTS = path.join(os.tmpdir(), 'qmp-ui-v310'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4310;
const server = await preview({ configFile: path.resolve('vite.config.ts'), preview: { port: PORT, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.PW_CHANNEL || 'chrome' }), args: ['--no-sandbox'] });
let failed = 0;
const ok = (name, pass, info = '') => { if (!pass) failed++; console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  - ' + info : '')); };
const URL = `http://127.0.0.1:${PORT}/`;

const OPTS = ['Alpha drug', 'Beta blocker', 'Gamma globulin', 'Delta agent'];
const mk = (n, extra = {}) => ({ question: `Which option is right for case ${n}?`, options: OPTS, correctAnswer: 'Beta blocker', difficulty: 'medium', rationale: '• Beta blockers reduce heart rate.', ...extra });
const quizData = [mk(1), mk(2), mk(3), mk(4, { correctAnswers: ['Beta blocker', 'Gamma globulin'] })];
const result = { id: 'qa-310', quizTitle: 'QA Review Set', subject: 'Pharmacology', timestamp: Date.now() - 3600_000, quizData, userAnswers: ['Beta blocker', 'Alpha drug', null, 'Delta agent'], totalQuestions: 4, percentage: 25, score: 1, maxScore: 4, netScore: 1, correct: 1, wrong: 2, skipped: 1, gain: 1, penalty: 0, accuracy: 33, timeTaken: 120, passMark: 50 };
const MCQ = 'Q1(E). Which drug lowers heart rate?\n\n(a) Alpha drug\n\n(b) Beta blocker\n\n(c) Gamma globulin\n\n(d) Delta agent\n\nAnswer - (b) Beta blocker\n\n• Beta blockers reduce heart rate.\n';

async function newPage(w, h, { theme = 'light', init = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 4\d\d|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  await page.addInitScript(([r, t, code]) => {
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('qmp_onboarding_done', 'true'); localStorage.setItem('qmp_history', JSON.stringify([r])); localStorage.setItem('qmp_theme', t); localStorage.setItem('__seeded', '1');
    }
    if (code) new Function(code)();
  }, [result, theme, init]);
  await page.goto(URL); await page.waitForTimeout(1700);
  return { ctx, page, errs };
}
const nav = (page, name) => page.locator('nav').getByText(name, { exact: true }).first().click();
const lum = (rgb) => { const m = rgb.match(/rgba?\(([^)]+)\)/); const [r, g, b] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* ───────── 1. review cards ───────── */
async function reviewSuite(label, w, h, theme) {
  const { ctx, page, errs } = await newPage(w, h, { theme });
  await nav(page, 'Progress'); await page.waitForTimeout(1300);
  await page.getByText('QA Review Set').first().click({ timeout: 10000 });
  await page.getByTestId('review-filters').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const cards = page.locator('[data-review-status]');
  ok(`[${label}] four review cards`, (await cards.count()) === 4, String(await cards.count()));
  const states = async (i) => cards.nth(i).locator('[data-option-state]').evaluateAll(els => els.map(e => e.getAttribute('data-option-state')));
  const icons = async (i) => cards.nth(i).locator('[data-option-state] [role="img"]').evaluateAll(els => els.map(e => e.textContent));

  ok(`[${label}] A correct: picked option green ✅, nothing red`, JSON.stringify(await states(0)) === '["neutral","correct","neutral","neutral"]' && JSON.stringify(await icons(0)) === '["✅"]', JSON.stringify(await states(0)));
  ok(`[${label}] B wrong: pick red ❌ + right option green ✅`, JSON.stringify(await states(1)) === '["wrong","correct","neutral","neutral"]' && JSON.stringify(await icons(1)) === '["❌","✅"]', JSON.stringify(await icons(1)));
  ok(`[${label}] C skipped: only ✅ on the right option, no ❌, no red`, JSON.stringify(await states(2)) === '["neutral","correct","neutral","neutral"]' && JSON.stringify(await icons(2)) === '["✅"]');
  ok(`[${label}] D multi-answer wrong: both right options ✅, the pick ❌`, JSON.stringify(await states(3)) === '["neutral","correct","correct","wrong"]' && (await icons(3)).filter(x => x === '✅').length === 2 && (await icons(3)).filter(x => x === '❌').length === 1);
  const weights = await cards.nth(1).locator('[data-option-state]').evaluateAll(els => els.map(e => ({ st: e.getAttribute('data-option-state'), w: Number(getComputedStyle(e).fontWeight) })));
  ok(`[${label}] the answer sits INSIDE its option: right + wrong pick bold, the others regular`, weights.every(x => x.st === 'neutral' ? x.w <= 500 : x.w >= 700), JSON.stringify(weights));
  const body = await page.locator('body').innerText();
  ok(`[${label}] no "(You answered: …)" text anywhere on the screen`, !/You answered/i.test(body));
  ok(`[${label}] no separate "Ans. - …" line under any card`, (await page.getByTestId('review-answer-line').count()) === 0 && !/Ans\. -/.test(body));
  const optText = await page.getByTestId('review-options').innerText();
  ok(`[${label}] no Answers show/hide control (answers are always shown)`, (await page.getByTestId('review-opt-answers').count()) === 0 && !/Answers/.test(optText) && !/Show answers|Hide answers/.test(body), optText.replace(/\n/g, ' | '));
  // no layout shift: every option row of the wrong card has the same height whatever its state
  const hs = await cards.nth(1).locator('[data-option-state]').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  ok(`[${label}] option rows keep one height in every state (no layout shift)`, Math.max(...hs) - Math.min(...hs) <= 1, hs.join(','));
  // colours: the right row reads clearly, in both themes
  const col = await cards.nth(1).locator('[data-option-state="correct"]').evaluate(e => { const s = getComputedStyle(e); return { bg: s.backgroundColor, fg: s.color }; });
  const red = await cards.nth(1).locator('[data-option-state="wrong"]').evaluate(e => { const s = getComputedStyle(e); return { bg: s.backgroundColor, fg: s.color }; });
  const bgL = theme === 'dark' ? lum(col.bg) < 0.25 : lum(col.bg) > 0.7;
  ok(`[${label}] green row: ${theme} background, text contrast ≥ 4.5`, bgL && cr(col.fg, col.bg.replace(/rgba\(([^)]+),\s*[\d.]+\)/, 'rgb($1)')) >= 4.5, `${col.bg} / ${col.fg}`);
  ok(`[${label}] red row: ${theme} background, text contrast ≥ 4.5`, cr(red.fg, red.bg.replace(/rgba\(([^)]+),\s*[\d.]+\)/, 'rgb($1)')) >= 4.5, `${red.bg} / ${red.fg}`);
  await cards.nth(1).scrollIntoViewIfNeeded(); await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/review_${label.replace(/\W+/g, '_')}.png` });

  /* Rationale popover on the review bar: the switches switch */
  await page.getByTestId('review-opt-include').click(); await page.waitForTimeout(500);
  const pop = page.getByTestId('review-popup-include');
  const book = pop.getByRole('switch', { name: 'Book rationale' });
  const was = await book.getAttribute('aria-checked');
  await book.tap(); await page.waitForTimeout(250);
  const now = await book.getAttribute('aria-checked');
  ok(`[${label}] review popup: Book rationale switch flips (${was} → ${now})`, was !== now);
  await book.tap(); await page.waitForTimeout(250);
  ok(`[${label}] review popup: flips back`, (await book.getAttribute('aria-checked')) === was);
  const ai = pop.getByRole('switch', { name: 'AI rationale' });
  const aiWas = await ai.getAttribute('aria-checked'); await ai.tap(); await page.waitForTimeout(250);
  ok(`[${label}] review popup: AI rationale switch flips`, (await ai.getAttribute('aria-checked')) !== aiWas);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  /* Rationale control of the report panel (RationaleControlsButton) */
  const trig = page.locator('button[aria-haspopup="true"]:has(svg.lucide-book-open)').first();
  await trig.scrollIntoViewIfNeeded(); await trig.tap(); await page.waitForTimeout(600);
  const sw = page.getByRole('dialog').getByRole('switch');
  const n = await sw.count();
  ok(`[${label}] report panel Rationale popover opens with switches`, n >= 2, `${n} switches`);
  const first = sw.nth(0); const a0 = await first.getAttribute('aria-checked');
  await first.tap(); await page.waitForTimeout(250);
  ok(`[${label}] report panel: Book switch responds to a tap`, (await first.getAttribute('aria-checked')) !== a0);
  await first.tap(); await page.waitForTimeout(250);
  ok(`[${label}] report panel: and back again (two taps in a row work)`, (await first.getAttribute('aria-checked')) === a0);
  const row = page.getByRole('dialog').getByText('📖 Book Rationale', { exact: true });
  const a1 = await first.getAttribute('aria-checked'); await row.tap(); await page.waitForTimeout(250);
  ok(`[${label}] report panel: tapping the whole row also switches (once, not twice)`, (await first.getAttribute('aria-checked')) !== a1);
  await page.screenshot({ path: `${SHOTS}/rationale_${label.replace(/\W+/g, '_')}.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(`[${label}] no JS errors`, errs.length === 0, errs.join(' | ').slice(0, 400));
  await ctx.close();
}

/* ───────── 2. Shuffle switches on Create Quiz ───────── */
async function shuffleSuite(label, w, h, theme) {
  const { ctx, page, errs } = await newPage(w, h, { theme });
  await nav(page, 'Create'); await page.waitForTimeout(1200);
  const trig = page.locator('button[aria-haspopup="true"]:has(svg.lucide-book-open), button[aria-haspopup="true"]:has(svg.lucide-shuffle)').first();
  await trig.waitFor({ timeout: 10000 });
  await trig.tap(); await page.waitForTimeout(600);
  const dlg = page.getByRole('dialog');
  const q = dlg.locator('#toggle-shuffle-q'), o = dlg.locator('#toggle-shuffle-o');
  ok(`[${label}] Order Controls opens with both switches present`, (await q.count()) === 1 && (await o.count()) === 1);
  const orig = dlg.locator('button', { hasText: 'Original' }), full = dlg.locator('button', { hasText: 'Full Shuffle' });
  if (await orig.isEnabled()) { await orig.tap(); await page.waitForTimeout(250); }
  ok(`[${label}] 📖 Original puts both switches off`, (await q.getAttribute('aria-checked')) === 'false' && (await o.getAttribute('aria-checked')) === 'false');
  await q.tap(); await page.waitForTimeout(250);
  ok(`[${label}] Shuffle Questions switch turns on`, (await q.getAttribute('aria-checked')) === 'true' && (await o.getAttribute('aria-checked')) === 'false');
  await o.tap(); await page.waitForTimeout(250);
  ok(`[${label}] Shuffle Options switch turns on`, (await o.getAttribute('aria-checked')) === 'true');
  ok(`[${label}] banner says fully shuffled`, /Fully shuffled/.test(await dlg.innerText()));
  await q.tap(); await page.waitForTimeout(250);
  ok(`[${label}] Shuffle Questions turns off again`, (await q.getAttribute('aria-checked')) === 'false' && (await o.getAttribute('aria-checked')) === 'true');
  await dlg.getByText('Shuffle Questions').first().tap(); await page.waitForTimeout(250);
  ok(`[${label}] tapping the row text switches it once`, (await q.getAttribute('aria-checked')) === 'true');
  await q.focus(); await page.keyboard.press('Space'); await page.waitForTimeout(250);
  ok(`[${label}] keyboard Space works on the switch`, (await q.getAttribute('aria-checked')) === 'false');
  await orig.tap(); await page.waitForTimeout(250);
  ok(`[${label}] 📖 Original turns both off`, (await q.getAttribute('aria-checked')) === 'false' && (await o.getAttribute('aria-checked')) === 'false');
  await full.tap(); await page.waitForTimeout(250);
  ok(`[${label}] 🔀 Full Shuffle turns both on`, (await q.getAttribute('aria-checked')) === 'true' && (await o.getAttribute('aria-checked')) === 'true');
  await page.screenshot({ path: `${SHOTS}/shuffle_${label.replace(/\W+/g, '_')}.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  ok(`[${label}] the Create screen trigger now shows the shuffle icon (state reached the screen)`, (await page.locator('button[aria-haspopup="true"]:has(svg.lucide-shuffle)').count()) >= 1);
  ok(`[${label}] no JS errors`, errs.length === 0, errs.join(' | ').slice(0, 400));
  await ctx.close();
}

/* ───────── 3. Paste ───────── */
async function pasteCase(name, init, expect) {
  const { ctx, page, errs } = await newPage(412, 900, { init });
  await nav(page, 'Create'); await page.waitForTimeout(1200);
  const ta = page.locator('textarea').first();
  await ta.waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /^Paste$/ }).tap(); await page.waitForTimeout(900);
  const toast = (await page.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
  const val = await ta.inputValue();
  await expect({ toast, val, page });
  ok(`[paste: ${name}] no JS errors`, errs.length === 0, errs.join(' | ').slice(0, 300));
  await ctx.close();
}
async function pasteSuite() {
  await pasteCase('native bridge (Android WebView)', `window.QmNative = { readClipboard: () => ${JSON.stringify(MCQ)} };`, async ({ toast, val }) => {
    ok('[paste: native bridge] text lands in the box and the toast says Pasted', /Which drug lowers heart rate/.test(val) && /Pasted/.test(toast) && !/blocked/i.test(toast), toast);
  });
  await pasteCase('bridge empty, web API works', `window.QmNative = { readClipboard: () => '' }; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => ${JSON.stringify(MCQ)}, writeText: async () => {} } });`, async ({ toast, val }) => {
    ok('[paste: bridge empty → web fallback] still pastes', /Which drug lowers heart rate/.test(val) && /Pasted/.test(toast), toast);
  });
  await pasteCase('web API only', `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => ${JSON.stringify(MCQ)}, writeText: async () => {} } });`, async ({ toast, val }) => {
    ok('[paste: web API] pastes', /Which drug lowers heart rate/.test(val) && /Pasted/.test(toast), toast);
  });
  await pasteCase('blocked', `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')), read: () => Promise.reject(new DOMException('denied', 'NotAllowedError')), writeText: async () => {} } });`, async ({ toast, val }) => {
    ok('[paste: blocked] clear message with the long-press hint, box untouched', /Clipboard blocked/.test(toast) && /long-press/.test(toast) && val === '' || (/Clipboard blocked/.test(toast) && /long-press/.test(toast) && !/Which drug/.test(val)), toast);
  });
  await pasteCase('empty clipboard', `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => '', writeText: async () => {} } });`, async ({ toast }) => {
    ok('[paste: empty] says the clipboard is empty', /Clipboard is empty/.test(toast), toast);
  });
}

await reviewSuite('light phone 390x800', 390, 800, 'light');
await reviewSuite('dark phone 390x800', 390, 800, 'dark');
await reviewSuite('light tablet 1210x756', 1210, 756, 'light');
await shuffleSuite('light phone 390x800', 390, 800, 'light');
await shuffleSuite('dark phone 390x800', 390, 800, 'dark');
await shuffleSuite('light tablet 1210x756', 1210, 756, 'light');
await pasteSuite();

await browser.close(); await server.close();
console.log(failed ? `\n${failed} check(s) FAILED. Screenshots: ${SHOTS}` : `\nAll checks passed. Screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
