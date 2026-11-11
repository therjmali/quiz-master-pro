/**
 * Real-Chrome regression for the new offline report system + moved status card:
 * Progress has no status card, Settings has it, report cards, full-page preview (pages, zoom, tabs, options),
 * PDF download (valid file, right content), Reports settings section.
 * Run: npm run build && npm run test:ui:reports
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SHOTS = path.join(os.tmpdir(), 'qmp-ui-reports'); fs.mkdirSync(SHOTS, { recursive: true });
const server = await preview({ configFile: path.resolve('vite.config.ts'), preview: { port: 4202, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.PW_CHANNEL || 'chrome' }), args: ['--no-sandbox'] });
let failed = 0;
const ok = (name, pass, info = '') => { if (!pass) failed++; console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  - ' + info : '')); };

const letters = ['Alpha drug', 'Beta blocker', 'Gamma globulin', 'Delta agent'];
const quizData = Array.from({ length: 12 }, (_, i) => ({
  question: `Which option is correct for case number ${i + 1}? ${i === 3 ? 'Dose is ≥ 5 µg of H₂O soluble β-agent.' : ''}`.trim(),
  options: letters, correctAnswer: 'Beta blocker', difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard',
  rationale: i % 2 === 0 ? `Beta blockers reduce heart rate (case ${i + 1}).` : undefined,
}));
// 5 correct, 4 wrong, 3 skipped
const userAnswers = quizData.map((_, i) => (i < 5 ? 'Beta blocker' : i < 9 ? 'Alpha drug' : null));
const result = { id: 'qa-1', quizTitle: 'QA Pharmacology Set', subject: 'Pharmacology', timestamp: Date.now() - 3600_000, quizData, userAnswers, totalQuestions: 12, percentage: 42, score: 5, maxScore: 12, netScore: 5, correct: 5, wrong: 4, skipped: 3, gain: 5, penalty: 0, accuracy: 56, timeTaken: 400, passMark: 50 };

async function run(label, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 4\d\d|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  await page.addInitScript(r => { localStorage.setItem('qmp_onboarding_done', 'true'); localStorage.setItem('qmp_history', JSON.stringify([r])); }, result);
  await page.goto('http://127.0.0.1:4202/'); await page.waitForTimeout(1500);
  await page.locator('nav').getByText('Progress', { exact: true }).first().click(); await page.waitForTimeout(1200);

  const body = await page.locator('body').innerText();
  ok(`[${label}] Progress screen has no "All systems healthy" card`, !/All systems healthy|Your data is saved, backed up/i.test(body));
  await page.getByRole('button', { name: /Preview Full Report/ }).waitFor({ timeout: 15000 }).catch(() => {});
  ok(`[${label}] Progress shows the report cards`, await page.getByRole('button', { name: /Preview Full Report/ }).isVisible());
  ok(`[${label}] Progress fits the screen width`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

  // open the full-page preview
  await page.getByRole('button', { name: /Preview Full Report/ }).click();
  await page.waitForSelector('[data-testid="report-pages"]', { timeout: 20000 });
  await page.waitForTimeout(800);
  ok(`[${label}] preview opens full screen with pages`, await page.locator('[data-screen="report-preview"]').isVisible() && (await page.locator('[data-page]').count()) >= 1);
  const svgText = async () => page.evaluate(() => Array.from(document.querySelectorAll('[data-page] svg text')).map(t => t.textContent).join('|'));
  const t1 = await svgText();
  ok(`[${label}] preview shows the questions and the "Ans." lines in the new format`, /Q1\./.test(t1) && /Ans\.1\. :/.test(t1) && /\(B\)/.test(t1) && t1.includes('Beta blocker'));
  ok(`[${label}] explanations are shown (book rationale on)`, /Explanation:/.test(t1));
  ok(`[${label}] footer has page numbers and the brand`, /Page 1 of \d+/.test(t1) && /R\.J QUIZ/.test(t1));
  const total = await page.getByTestId('page-indicator').innerText();
  ok(`[${label}] page indicator`, /1 \/ \d+/.test(total), total);
  await page.screenshot({ path: `${SHOTS}/preview_${label}.png` });

  // zoom
  const w0 = (await page.locator('[data-page]').first().boundingBox()).width;
  await page.getByRole('button', { name: 'Zoom in' }).click(); await page.waitForTimeout(300);
  const w1 = (await page.locator('[data-page]').first().boundingBox()).width;
  ok(`[${label}] zoom in makes the page wider`, w1 > w0 + 10, `${Math.round(w0)} -> ${Math.round(w1)}`);
  await page.getByRole('button', { name: 'Fit to width' }).click(); await page.waitForTimeout(200);

  // options: hide answers, then tabs
  await page.getByRole('button', { name: /Answers: after each/ }).click(); await page.waitForTimeout(250);
  await page.getByRole('button', { name: /Answers: key at end/ }).click(); await page.waitForTimeout(250);
  await page.waitForSelector('[data-testid="report-pages"]'); await page.waitForTimeout(700);
  ok(`[${label}] answers can be hidden`, !/Ans\.1\. :/.test(await svgText()));
  await page.getByRole('tab', { name: /Mistakes/ }).click(); await page.waitForTimeout(1200);
  const mist = await svgText();
  const qCount = (mist.match(/Q\d+\./g) || []).length;
  ok(`[${label}] Mistakes tab shows only the 4 wrong questions`, qCount === 4 && /Your answer: \(A\) Alpha drug/.test(mist), `Q labels: ${qCount}`);
  await page.getByRole('tab', { name: /Skipped/ }).click(); await page.waitForTimeout(1200);
  ok(`[${label}] Skipped tab shows the 3 skipped questions`, ((await svgText()).match(/Q\d+\./g) || []).length === 3);
  await page.getByRole('tab', { name: /Full report/ }).click(); await page.waitForTimeout(1200);

  // PDF download from the top bar
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name: 'Download PDF' }).click()]);
  const file = path.join(SHOTS, `${label.replace(/\W+/g, '_')}_${dl.suggestedFilename()}`);
  await dl.saveAs(file);
  const bytes = fs.readFileSync(file);
  ok(`[${label}] downloaded file is a PDF named like RJQuiz_Report_…`, bytes.subarray(0, 5).toString() === '%PDF-' && /^RJQuiz_Report_.*\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename() + ` (${bytes.length} bytes)`);
  let txt = ''; try { txt = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }); } catch { /* pdftotext missing */ }
  if (txt) {
    ok(`[${label}] PDF text has questions, answers, explanations, special characters`, /Q1\./.test(txt) && /Ans\.1\. :/.test(txt) && /Explanation:/.test(txt) && /Page 1 of/.test(txt) && /β/.test(txt) && /µg/.test(txt));
    ok(`[${label}] PDF has no blank-box / replacement characters`, !/\uFFFD|□/.test(txt));
  }
  // other formats
  await page.getByRole('button', { name: 'More formats and share' }).click();
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: /Plain text/ }).click()]);
  const txtBytes = fs.readFileSync(await dl2.path());
  ok(`[${label}] text download works and follows the settings`, /Q1\./.test(txtBytes.toString()) && dl2.suggestedFilename().endsWith('.txt'));

  await page.getByRole('button', { name: 'Back', exact: true }).click(); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/after_back_${label}.png` });
  ok(`[${label}] Back returns to Progress`, await page.getByRole('heading', { name: 'Progress', level: 2 }).isVisible(), page.url());

  // quick PDF from a card
  const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name: /Download Mistakes as PDF/ }).click()]);
  ok(`[${label}] one-tap PDF from a card`, /^RJQuiz_Mistakes_/.test(dl3.suggestedFilename()), dl3.suggestedFilename());
  await page.waitForTimeout(500);
  ok(`[${label}] recently saved list appears`, await page.getByText('Recently saved').isVisible());

  // Settings: status card lives here, reports section exists
  await page.getByTestId('avatar-settings').click(); await page.waitForTimeout(900);
  const s = await page.locator('body').innerText();
  ok(`[${label}] Settings shows the status card ("All systems healthy…")`, /All systems healthy|needs attention|Check/i.test(s) && /CLOUD/i.test(s));
  ok(`[${label}] Settings has Reports & downloads`, await page.locator('#section-reports').count() === 1);
  await page.locator('#section-reports button[aria-expanded]').first().click(); await page.waitForTimeout(400);
  ok(`[${label}] report settings render`, await page.getByText('Paper size').first().isVisible() && await page.getByText('Notify when a report is saved').first().isVisible());
  await page.screenshot({ path: `${SHOTS}/settings_${label}.png` });
  ok(`[${label}] no JS errors`, errs.length === 0, errs.join(' | ').slice(0, 400));
  await ctx.close();
}
await run('phone 390x800', 390, 800);
await run('tablet 1280x800', 1280, 800);
await browser.close(); await server.close();
console.log(failed ? `\n${failed} check(s) FAILED  (screenshots: ${SHOTS})` : `\nAll report UI checks passed  (screenshots: ${SHOTS})`);
process.exit(failed ? 1 : 0);
