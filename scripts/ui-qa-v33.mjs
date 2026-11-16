/**
 * UI regression for v3.3 (real Chrome): Android Widgets moved into Settings > Integrations, exactly two display modes
 * (Light / Dark) with legacy values migrated, one AI Generation switch with saved-key choices, Preview answer toggle,
 * and a Light-vs-Dark audit that flags invisible text on the main screens.
 * Run: npm run build && npm run test:ui:v33
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SHOTS = path.join(os.tmpdir(), 'qmp-ui-v33'); fs.mkdirSync(SHOTS, { recursive: true });
const server = await preview({ configFile: path.resolve('vite.config.ts'), preview: { port: 4233, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.PW_CHANNEL || 'chrome' }), args: ['--no-sandbox'] });
let failed = 0;
const ok = (name, pass, info = '') => { if (!pass) failed++; console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  - ' + info : '')); };
const URL = 'http://127.0.0.1:4233/';

const SESSION = { quizData: Array.from({ length: 6 }, (_, i) => ({ question: `Question number ${i + 1}: which option is correct?`, options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correctAnswer: 'Alpha', difficulty: 'easy', rationale: 'Because Alpha.' })), settings: { mode: 'submit', timerMode: 'off', quizTitle: 'QA', marksPerQuestion: 1 }, currentIndex: 0, userAnswers: new Array(6).fill(null), flaggedQuestions: new Array(6).fill(false), accumulatedTime: 0, timeLeftPerQ: [], forcedNext: new Array(6).fill(false), totalTimeLeft: 0, savedAt: Date.now() };
const letters = ['Alpha drug', 'Beta blocker', 'Gamma globulin', 'Delta agent'];
const quizData = Array.from({ length: 6 }, (_, i) => ({ question: `Which option is correct for case ${i + 1}?`, options: letters, correctAnswer: 'Beta blocker', difficulty: 'medium', rationale: '• Beta blockers reduce heart rate.' }));
const result = { id: 'qa-1', quizTitle: 'QA Set', subject: 'Pharmacology', timestamp: Date.now() - 3600_000, quizData, userAnswers: ['Beta blocker', 'Alpha drug', null, 'Beta blocker', 'Alpha drug', null], totalQuestions: 6, percentage: 33, score: 2, maxScore: 6, netScore: 2, correct: 2, wrong: 2, skipped: 2, gain: 2, penalty: 0, accuracy: 50, timeTaken: 200, passMark: 50 };
const MCQ = 'Q1(E). Which drug lowers heart rate?\n\n(a) Alpha drug\n\n(b) Beta blocker\n\n(c) Gamma globulin\n\n(d) Delta agent\n\nAnswer - (b) Beta blocker\n\n• Beta blockers reduce heart rate.\n\nQ2(M). Which is a vitamin?\n\n(a) Iron\n\n(b) Vitamin C\n\n(c) Zinc\n\n(d) Copper\n\nAnswer - (b) Vitamin C\n\n• Vitamin C is ascorbic acid.\n';

/** Finds text that is (almost) invisible: contrast below `min` against the real composited background. */
async function auditContrast(page, min = 2.0) {
  return page.evaluate((min) => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
    const bgOf = (el) => { const stack = []; for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); const c = parse(cs.backgroundColor); if (c && c.a > 0) stack.push(c); if (c && c.a >= 0.99) break; if (cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) return null; } let base = { r: 255, g: 255, b: 255, a: 1 }; for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const txt = (t.nodeValue || '').trim(); if (txt.length < 2) continue;
      const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
      if (el.closest('svg')) continue; // the report paper (SVG) draws its own white page and coloured bands; it is checked as a rendered PDF instead
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const fg = parse(cs.color); const bg = bgOf(el); if (!fg || !bg) continue;
      const eff = over({ ...fg, a: fg.a * Number(cs.opacity) }, bg);
      const L1 = lum(eff), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (cr < min) out.push({ text: txt.slice(0, 40), cr: Math.round(cr * 100) / 100, cls: String(el.className).slice(0, 60) });
    }
    return out;
  }, min);
}

async function newPage(w, h, init = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 4\d\d|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  await page.addInitScript(([r, extra]) => {
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('qmp_onboarding_done', 'true'); localStorage.setItem('qmp_history', JSON.stringify([r]));
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
      localStorage.setItem('__seeded', '1');
    }
  }, [result, init]);
  await page.goto(URL); await page.waitForTimeout(1600);
  return { ctx, page, errs };
}

async function openSection(page, id) {
  const b = page.locator(`#section-${id} button[aria-controls]`);
  if ((await b.getAttribute('aria-expanded')) !== 'true') { await b.click(); await page.waitForTimeout(600); }
}

async function run(label, w, h) {
  const { ctx, page, errs } = await newPage(w, h);
  const nav = (name) => page.locator('nav').getByText(name, { exact: true }).first().click();

  /* ── 1. widgets are not in the header any more ── */
  const body0 = await page.locator('body').innerText();
  ok(`[${label}] header has no widgets button`, (await page.locator('[title*="idget"], [aria-label*="idget"]').count()) === 0 && !/Android Home Screen Widgets/.test(body0));

  /* ── 2. Settings > Integrations > Android Widgets ── */
  await page.getByTestId('avatar-settings').click(); await page.getByLabel('Search settings').waitFor({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1200);
  const mainText = await page.locator('body').innerText();
  ok(`[${label}] Settings has an Integrations section`, /Integrations/.test(mainText));
  ok(`[${label}] widget manager is NOT on the main settings page`, (await page.getByTestId('widget-manager').count()) === 0 && !/Pin Daily Practice Widget/.test(mainText));
  await openSection(page, 'integrations');
  await page.locator('#setting-androidWidgets').click(); await page.waitForTimeout(900);
  const wm = page.getByTestId('widget-manager');
  ok(`[${label}] Android Widgets opens as its own Settings page`, await wm.isVisible() && /Android Home Screen Widgets/.test(await wm.innerText()));
  ok(`[${label}] the page is inline (not a floating sheet) and has no close button`, await wm.evaluate(el => getComputedStyle(el).position !== 'fixed') && (await wm.getByRole('button', { name: 'Close' }).count()) === 0);
  ok(`[${label}] widget page fits the screen width`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await page.screenshot({ path: `${SHOTS}/widgets_${label}.png` });
  const backBtn = page.getByRole('button', { name: /^Back|Back to settings/i }).first();
  if (await backBtn.count()) { await backBtn.click(); await page.waitForTimeout(600); }
  ok(`[${label}] back from Android Widgets returns to Settings`, /Integrations/.test(await page.locator('body').innerText()) && (await wm.count()) === 0);

  /* ── 3. Appearance: only Light and Dark ── */
  await openSection(page, 'appearance');
  const modes = page.locator('#section-appearance [aria-label="Display mode"] [role="radio"]');
  const modeTexts = (await modes.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  ok(`[${label}] exactly two display modes: Light and Dark`, modeTexts.length === 2 && /Light/.test(modeTexts[0]) && /Dark/.test(modeTexts[1]), modeTexts.join(' | '));
  const appearance = await page.locator('#section-appearance').innerText();
  ok(`[${label}] no Parchment / Ink / Papyrus / Liquid Glass / accent palette / blur slider`, !/Parchment|Ink|Papyrus|Liquid Glass|Accent palette|Glass blur/i.test(appearance));
  await page.screenshot({ path: `${SHOTS}/appearance_light_${label}.png` });
  await page.getByTestId('theme-dark').click(); await page.waitForTimeout(700);
  const dark = await page.evaluate(() => ({ cls: document.documentElement.className, ls: localStorage.getItem('qmp_theme'), bg: getComputedStyle(document.body).backgroundColor, scheme: document.documentElement.style.colorScheme }));
  ok(`[${label}] Dark: html gets app-dark + dark, saved as "dark"`, /app-dark/.test(dark.cls) && /\bdark\b/.test(dark.cls) && !/app-light/.test(dark.cls) && dark.ls === 'dark' && dark.scheme === 'dark', JSON.stringify(dark));
  const lumOf = (c) => { const p = c.match(/[\d.]+/g).map(Number); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; };
  ok(`[${label}] Dark: page background is dark`, lumOf(dark.bg) < 0.2, dark.bg);
  await page.screenshot({ path: `${SHOTS}/appearance_dark_${label}.png` });
  await page.getByTestId('theme-light').click(); await page.waitForTimeout(600);
  ok(`[${label}] Light: back to app-light`, await page.evaluate(() => document.documentElement.classList.contains('app-light') && !document.documentElement.classList.contains('dark')));

  /* ── 4. AI Generation switch ── */
  await page.goto(URL); await page.waitForTimeout(1500);
  await nav('Create'); await page.waitForTimeout(1200);
  await page.getByTestId('ai-trigger').click(); await page.waitForTimeout(400);
  const sw = page.getByTestId('ai-switch');
  ok(`[${label}] AI Generation has one switch`, await sw.isVisible() && (await sw.getAttribute('role')) === 'switch');
  ok(`[${label}] no Zite / Off / Custom AI segments any more`, !/Zite AI|Custom AI|Rationale Generated By/.test(await page.getByTestId('ai-panel').innerText()));
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await page.waitForTimeout(300);
  ok(`[${label}] ON with no saved key: prompt to add one, no key list`, await page.getByTestId('ai-no-keys').isVisible() && (await page.getByTestId('ai-keys').count()) === 0);
  await sw.click(); await page.waitForTimeout(300);
  const offState = await page.evaluate(() => JSON.parse(localStorage.getItem('qmp_ai_prefs') || '{}'));
  ok(`[${label}] OFF hides every AI sub-setting and turns quiz + rationale AI off`, (await page.getByTestId('ai-no-keys').count()) === 0 && (await page.getByTestId('ai-keys').count()) === 0 && offState.quizHelper === 'off' && offState.reportHelper === 'off', JSON.stringify(offState));
  await page.screenshot({ path: `${SHOTS}/ai_off_${label}.png` });
  await sw.click(); await page.waitForTimeout(300);
  await page.getByTestId('ai-add-key').click(); await page.waitForTimeout(1000);
  ok(`[${label}] "Add API key" opens Profile → API Keys`, /API Keys|Gemini/i.test(await page.locator('body').innerText()) && (await page.getByTestId('ai-panel').count()) === 0);
  await ctx.close();
  ok(`[${label}] no JS errors (widgets / appearance / AI)`, errs.length === 0, errs.slice(0, 2).join(' | '));

  /* ── 5. with saved keys: only those are listed ── */
  const k = await newPage(w, h, { qmp_user_api_keys: JSON.stringify({ gemini: 'AIzaTestKey123456', openai: 'sk-test-abcdefg', anthropic: '', cohere: '  ', openaiEnabled: true }) });
  const p2 = k.page;
  await p2.locator('nav').getByText('Create', { exact: true }).first().click(); await p2.waitForTimeout(1200);
  await p2.getByTestId('ai-trigger').click(); await p2.waitForTimeout(400);
  if ((await p2.getByTestId('ai-switch').getAttribute('aria-checked')) !== 'true') await p2.getByTestId('ai-switch').click();
  await p2.waitForTimeout(300);
  const keyTexts = (await p2.getByTestId('ai-keys').locator('[role="radio"]').allInnerTexts()).map(t => t.trim());
  ok(`[${label}] only saved keys are listed: 🔑 Gemini, 🔑 OpenAI`, keyTexts.length === 2 && keyTexts[0] === '🔑 Gemini' && keyTexts[1] === '🔑 OpenAI', keyTexts.join(' | '));
  await p2.getByTestId('ai-key-openai').click(); await p2.waitForTimeout(200);
  const pref = await p2.evaluate(() => JSON.parse(localStorage.getItem('qmp_ai_client_prefs') || '{}'));
  ok(`[${label}] choosing 🔑 OpenAI makes it the provider tried first`, pref.preferred === 'openai' && (await p2.getByTestId('ai-key-openai').getAttribute('aria-checked')) === 'true', JSON.stringify(pref));
  await p2.screenshot({ path: `${SHOTS}/ai_on_${label}.png` });
  await p2.keyboard.press('Escape'); await p2.waitForTimeout(300);

  /* ── 6. Preview answers toggle ── */
  await p2.locator('textarea').first().fill(MCQ); await p2.waitForTimeout(1500);
  const toggle = p2.getByTestId('preview-toggle-answers');
  await toggle.waitFor({ timeout: 8000 });
  const marks = () => p2.locator('.cq-prev-opt.is-correct').count();
  ok(`[${label}] preview hides correct answers by default`, (await marks()) === 0 && (await toggle.getAttribute('aria-label')) === 'Show correct answers' && (await toggle.getAttribute('aria-pressed')) === 'false');
  ok(`[${label}] no ✓ icon while hidden`, (await p2.locator('section[aria-live="polite"] svg[aria-label="Correct answer"]').count()) === 0);
  await toggle.click(); await p2.waitForTimeout(250);
  ok(`[${label}] eye button reveals the green correct options with ✓`, (await marks()) === 2 && (await p2.locator('section[aria-live="polite"] svg[aria-label="Correct answer"]').count()) === 2 && (await toggle.getAttribute('aria-label')) === 'Hide correct answers');
  await p2.screenshot({ path: `${SHOTS}/preview_shown_${label}.png` });
  await toggle.click(); await p2.waitForTimeout(250);
  ok(`[${label}] clicking again hides them again`, (await marks()) === 0);
  ok(`[${label}] Create screen fits the width`, !(await p2.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  ok(`[${label}] no JS errors (keys / preview)`, k.errs.length === 0, k.errs.slice(0, 2).join(' | '));
  await k.ctx.close();

  /* ── 6b. tap-to-cycle controls are small popup windows now ── */
  {
    const t = await newPage(w, h);
    const tp = t.page;
    const themeOf = () => tp.evaluate(() => document.documentElement.classList.contains('app-dark') ? 'dark' : 'light');
    await tp.getByTestId('theme-trigger').click(); await tp.waitForTimeout(450);
    ok(`[${label}] the header theme button opens a small window (Light / Dark) and changes nothing by itself`, await tp.getByTestId('popup-theme').isVisible() && (await tp.locator('[data-testid="popup-theme"] [role="radio"]').count()) === 2 && (await themeOf()) === 'light');
    await tp.screenshot({ path: `${SHOTS}/popup_theme_${label}.png` });
    await tp.locator('[data-testid="popup-theme"] [data-choice="dark"]').click(); await tp.waitForTimeout(600);
    ok(`[${label}] picking Dark in the window applies it and closes the window`, (await themeOf()) === 'dark' && (await tp.getByTestId('popup-theme').count()) === 0);
    await tp.getByTestId('theme-trigger').click(); await tp.waitForTimeout(450);
    await tp.locator('[data-testid="popup-theme"] [data-choice="light"]').click(); await tp.waitForTimeout(500);
    ok(`[${label}] and back to Light`, (await themeOf()) === 'light');
    const clock = tp.getByTestId('clock-card').first();
    if (await clock.count()) {
      await clock.click(); await tp.waitForTimeout(450);
      ok(`[${label}] the home clock opens a style window (Digital / Flip / Analog) instead of cycling`, await tp.getByTestId('popup-clock').isVisible() && (await tp.locator('[data-testid="popup-clock"] [role="radio"]').count()) === 3);
      await tp.keyboard.press('Escape'); await tp.waitForTimeout(300);
    }
    ok(`[${label}] no JS errors (popups)`, t.errs.length === 0, t.errs.slice(0, 2).join(' | '));
    await t.ctx.close();
  }

  /* ── 6c. Create Quiz: AI Generation is a prominent row at the top ── */
  {
    const c = await newPage(w, h, { qmp_user_api_keys: JSON.stringify({ gemini: 'AIzaTestKey123456', openai: 'sk-test-abcdefg' }) });
    await c.page.locator('nav').getByText('Create', { exact: true }).first().click(); await c.page.waitForTimeout(1300);
    const box = await c.page.getByTestId('ai-trigger').boundingBox();
    ok(`[${label}] AI Generation row is full width and sits at the top of Create`, box && box.width > Math.min(w, 760) * 0.55 && box.y < 280, JSON.stringify(box));
    const status = await c.page.getByTestId('ai-status').innerText();
    ok(`[${label}] the row shows the state at a glance`, /^(Off · MCQs load offline|On · )/.test(status), status);
    await c.page.getByTestId('ai-trigger').click(); await c.page.waitForTimeout(400);
    if ((await c.page.getByTestId('ai-switch').getAttribute('aria-checked')) !== 'true') await c.page.getByTestId('ai-switch').click();
    await c.page.getByTestId('ai-key-openai').click(); await c.page.waitForTimeout(200);
    const pr = await c.page.evaluate(() => JSON.parse(localStorage.getItem('qmp_ai_client_prefs') || '{}'));
    ok(`[${label}] choosing a key means "use only this key"`, pr.preferred === 'openai' && pr.only === true, JSON.stringify(pr));
    await c.page.keyboard.press('Escape'); await c.page.waitForTimeout(350);
    ok(`[${label}] the row now reads "On · 🔑 OpenAI"`, (await c.page.getByTestId('ai-status').innerText()) === 'On · 🔑 OpenAI');
    await c.page.screenshot({ path: `${SHOTS}/ai_row_${label}.png` });
    await c.ctx.close();
  }

  /* ── 6d. Exam paper: black & white, no question numbers, "Ans. 1 (C)", 📖 bullets, three answer modes ── */
  {
    const e = await newPage(w, h);
    const ep = e.page;
    await ep.locator('nav').getByText('Progress', { exact: true }).first().click(); await ep.waitForTimeout(1400);
    await ep.getByRole('button', { name: /Preview Exam Paper/ }).click();
    await ep.waitForSelector('[data-testid="report-pages"]', { timeout: 25000 }); await ep.waitForTimeout(1200);
    const svgTxt = () => ep.evaluate(() => [...document.querySelectorAll('[data-page] svg text')].map(t => t.textContent).join('\n'));
    const colours = () => ep.evaluate(() => {
      const bad = []; const ok = (c) => !c || c === 'none' || c === 'transparent' || c === '#fff' || /^#([0-9a-f]{2})\1\1$/i.test(c);
      document.querySelectorAll('[data-page] svg [fill], [data-page] svg [stroke]').forEach(n => { for (const a of ['fill', 'stroke']) { const v = n.getAttribute(a); if (!ok(v)) bad.push(v); } });
      return [...new Set(bad)];
    });
    await ep.getByTestId('opt-answers').click(); await ep.waitForTimeout(350);
    await ep.locator('[data-testid="popup-answers"] [data-choice="inline"]').click(); await ep.waitForTimeout(1100);
    const t1 = await svgTxt();
    ok(`[${label}] exam paper is black & white`, (await colours()).length === 0, (await colours()).join(','));
    ok(`[${label}] exam paper: "Ans. 1 (C) …" lines, no "Ans.1. :" and no Explanation label`, /Ans\. 1 \([A-D]\) /.test(t1) && !/Ans\.1\.|Explanation|Rationale/.test(t1));
    ok(`[${label}] exam paper: no question numbers by default`, !/^Q?\d+\.$/m.test(t1.split('\n').filter(x => !/^\d+\.\d/.test(x)).join('\n')));
    await ep.screenshot({ path: `${SHOTS}/exam_inline_${label}.png` });
    await ep.getByTestId('opt-include').click(); await ep.waitForTimeout(350);
    ok(`[${label}] Include has a "Question numbers" switch for the exam paper`, (await ep.locator('[data-testid="popup-include"] [role="switch"][aria-label="Question numbers"]').count()) === 1);
    await ep.locator('[data-testid="popup-include"] [role="switch"][aria-label="Question numbers"]').click(); await ep.waitForTimeout(1000);
    await ep.keyboard.press('Escape'); await ep.waitForTimeout(400);
    ok(`[${label}] turning question numbers on prints 1. 2. 3.`, /^1\.$/m.test(await svgTxt()));
    await ep.getByTestId('answers-eye').click(); await ep.waitForTimeout(350);
    await ep.locator('[data-testid="popup-answers"] [data-choice="none"]').click(); await ep.waitForTimeout(1000);
    ok(`[${label}] answers hidden (crossed eye): a clean paper`, !/Ans\. \d/.test(await svgTxt()));
    await ep.getByTestId('answers-eye').click(); await ep.waitForTimeout(350);
    await ep.locator('[data-testid="popup-answers"] [data-choice="key"]').click(); await ep.waitForTimeout(1000);
    const t3 = await svgTxt();
    ok(`[${label}] answers at the end: Answer Key with "Ans. 1 (C)" entries and numbered questions`, /Answer Key/.test(t3) && /Ans\. 1 \([A-D]\)/.test(t3) && /^1\.$/m.test(t3));
    ok(`[${label}] exam preview: no JS errors`, e.errs.length === 0, e.errs.slice(0, 2).join(' | '));
    await e.ctx.close();
  }

  /* ── 7. legacy theme values are migrated on start ── */
  for (const [legacy, expected] of [['amoled', 'dark'], ['ancient', 'light'], ['light', 'light'], ['dark', 'dark']]) {
    const m = await newPage(w, h, { qmp_theme: legacy });
    const cls = await m.page.evaluate(() => document.documentElement.className);
    ok(`[${label}] stored theme "${legacy}" starts as ${expected}`, expected === 'dark' ? /app-dark/.test(cls) : /app-light/.test(cls) && !/app-dark/.test(cls), cls.slice(0, 60));
    await m.ctx.close();
  }

  /* ── 8. Light vs Dark: invisible-text audit on the main screens ── */
  for (const mode of ['light', 'dark']) {
    const a = await newPage(w, h, { qmp_theme: mode });
    const screens = [['Home', null], ['Library', 'Library'], ['Create', 'Create'], ['Stats', 'Stats'], ['Progress', 'Progress']];
    for (const [name, tab] of screens) {
      if (tab) { await a.page.locator('nav').getByText(tab, { exact: true }).first().click(); await a.page.waitForTimeout(1300); }
      const bad = await auditContrast(a.page);
      ok(`[${label}] ${mode}: ${name} has no invisible text`, bad.length === 0, bad.slice(0, 4).map(b => `${b.text}(${b.cr})`).join(', '));
      ok(`[${label}] ${mode}: ${name} fits the width`, !(await a.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
      await a.page.screenshot({ path: `${SHOTS}/${mode}_${name}_${label}.png` });
    }
    // popups (small windows) and the full-page report preview, in this mode
    await a.page.getByTestId('avatar-settings').click(); await a.page.waitForTimeout(900);
    await a.page.goto(URL); await a.page.waitForTimeout(1400);
    await a.page.getByTestId('theme-trigger').click(); await a.page.waitForTimeout(500);
    { const bad = await auditContrast(a.page); ok(`[${label}] ${mode}: theme popup has no invisible text`, bad.length === 0, bad.slice(0, 4).map(b => `${b.text}(${b.cr})`).join(', ')); await a.page.screenshot({ path: `${SHOTS}/${mode}_PopupTheme_${label}.png` }); }
    await a.page.keyboard.press('Escape'); await a.page.waitForTimeout(300);
    await a.page.locator('nav').getByText('Create', { exact: true }).first().click(); await a.page.waitForTimeout(1200);
    await a.page.getByTestId('ai-trigger').click(); await a.page.waitForTimeout(500);
    { const bad = await auditContrast(a.page); ok(`[${label}] ${mode}: AI Generation window has no invisible text`, bad.length === 0, bad.slice(0, 4).map(b => `${b.text}(${b.cr})`).join(', ')); await a.page.screenshot({ path: `${SHOTS}/${mode}_PopupAI_${label}.png` }); }
    await a.page.keyboard.press('Escape'); await a.page.waitForTimeout(300);
    await a.page.locator('nav').getByText('Progress', { exact: true }).first().click(); await a.page.waitForTimeout(1300);
    await a.page.getByRole('button', { name: /Preview Full Report/ }).click(); await a.page.waitForSelector('[data-testid="report-pages"]', { timeout: 25000 }); await a.page.waitForTimeout(1200);
    { const bad = await auditContrast(a.page); ok(`[${label}] ${mode}: report preview has no invisible text`, bad.length === 0, bad.slice(0, 4).map(b => `${b.text}(${b.cr})`).join(', ')); await a.page.screenshot({ path: `${SHOTS}/${mode}_ReportPreview_${label}.png` }); }
    await a.page.getByTestId('opt-answers').click(); await a.page.waitForTimeout(450);
    { const bad = await auditContrast(a.page); ok(`[${label}] ${mode}: Answers window has no invisible text`, bad.length === 0, bad.slice(0, 4).map(b => `${b.text}(${b.cr})`).join(', ')); await a.page.screenshot({ path: `${SHOTS}/${mode}_PopupAnswers_${label}.png` }); }
    await a.ctx.close();

    // the running quiz screen and the pause overlay
    const qz = await newPage(w, h, { qmp_theme: mode, qmp_active_session: JSON.stringify(SESSION) });
    await qz.page.getByRole('button', { name: /resume/i }).first().click(); await qz.page.waitForTimeout(1400);
    { const bad = await auditContrast(qz.page); ok(`[${label}] ${mode}: quiz screen has no invisible text`, bad.length === 0, bad.slice(0, 4).map(b => `${b.text}(${b.cr})`).join(', ')); await qz.page.screenshot({ path: `${SHOTS}/${mode}_Quiz_${label}.png` }); }
    ok(`[${label}] ${mode}: quiz screen fits the width`, !(await qz.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await qz.ctx.close();
    const a2 = await newPage(w, h, { qmp_theme: mode });
    await a2.page.getByTestId('avatar-settings').click(); await a2.page.waitForTimeout(900);
    const badS = await auditContrast(a2.page);
    ok(`[${label}] ${mode}: Settings has no invisible text`, badS.length === 0, badS.slice(0, 4).map(b => `${b.text}(${b.cr})`).join(', '));
    await a2.page.screenshot({ path: `${SHOTS}/${mode}_Settings_${label}.png` });
    await a2.ctx.close();
  }
}

try {
  // ONLY=phone or ONLY=tablet runs one viewport (each takes a few minutes)
  if (!process.env.ONLY || process.env.ONLY === 'phone') await run('phone 390x800', 390, 800);
  if (!process.env.ONLY || process.env.ONLY === 'tablet') await run('tablet 1280x800', 1280, 800);
} finally { await browser.close(); await server.close(); }
console.log(failed ? `\n${failed} check(s) FAILED  (screenshots: ${SHOTS})` : `\nAll v3.3 UI checks passed  (screenshots: ${SHOTS})`);
process.exit(failed ? 1 : 0);
