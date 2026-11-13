import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMasterReport } from '../src/utils/reports/pdf/masterTemplate';
import { docToMasterHtml } from '../src/utils/reports/pdf/masterHtml';
import { layoutFor } from '../src/utils/reports/pdf/generate';
import { measureText, type Face, type FontSet } from '../src/utils/reports/pdf/fontSet';
import { buildQuestionDoc, styleFor } from '../src/utils/reports/pdf/model';
import { docToHtml, docToText, docToWordHtml } from '../src/utils/reports/pdf/formats';
import { markdownToBlocks } from '../src/utils/reports/pdf/markdown';
import type { ReportItem, Page } from '../src/utils/reports/pdf/types';

/** Same fake metrics as the engine tests: every glyph is 0.5em wide. */
const mk = (id: string, bold: boolean): Face => ({ id, bold, covers: (cp: number) => cp >= 0x20 && cp < 0x250, width: (t, s) => [...t].length * s * 0.5 });
const set: FontSet = { regular: [mk('l', false)], bold: [mk('lb', true)] };

const item = (n: number, over: Partial<ReportItem> = {}): ReportItem => ({
  n, question: `Question ${n} asks about the mechanism of action in some detail`,
  options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correct: ['Beta'], user: 'Beta', status: 'correct',
  book: 'Because the enzyme is inhibited irreversibly.', ai: 'Review unit 4.', ...over,
});

const doc = (items: ReportItem[], summary = true) => ({
  kind: 'all' as const, title: 'Full Report — TG 344 - 373', meta: ['13 Nov 2026', 'Pharmacology'],
  summary: summary ? { quizzes: 1, questions: items.length, correct: items.filter(i => i.status === 'correct').length, wrong: items.filter(i => i.status === 'wrong').length, skipped: items.filter(i => i.status === 'skipped').length, accuracy: 60, scorePct: 55, shown: items.length, scope: 'quiz' as const } : undefined,
  items,
});

const style = styleFor('all', { columns: 2, brand: 'R.J QUIZ' });
const flat = (pages: Page[], t: 'text' | 'rect' | 'circle') => pages.flatMap(p => p.ops).filter(o => o.t === t) as any[];

test('master template: draws both columns, keeps every question, and numbers pages', () => {
  const items = Array.from({ length: 12 }, (_, i) => item(i + 1, { status: ['correct', 'wrong', 'skipped'][i % 3] as ReportItem['status'] }));
  const report = layoutMasterReport(doc(items), style, set);
  assert.ok(report.pages.length >= 2, 'a dozen questions need more than one page');

  const numbers = flat(report.pages, 'text').map(o => o.text).filter((t: string) => /^\d+$/.test(t)).map(Number);
  for (let n = 1; n <= items.length; n++) assert.ok(numbers.includes(n), `question ${n} was dropped`);

  report.pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${report.pages.length}`;
    assert.ok(p.ops.some(o => o.t === 'text' && o.text === label), `page ${i + 1} has no footer`);
  });

  // two columns actually used on the first page
  const cards = report.pages[0].ops.filter(o => o.t === 'rect' && o.r === 7 && o.h > 60 && o.w > 100) as any[];
  const left = cards.filter(c => c.x < report.pages[0].width / 2);
  const right = cards.filter(c => c.x >= report.pages[0].width / 2);
  assert.ok(left.length > 0 && right.length > 0, 'both columns should carry cards');
});

test('master template: uses circles for icons and keeps everything inside the page', () => {
  const report = layoutMasterReport(doc([item(1), item(2, { status: 'wrong' })]), style, set);
  assert.ok(flat(report.pages, 'circle').length > 5, 'status dots and badge marks are circles');

  for (const p of report.pages) {
    for (const op of p.ops) {
      const xs = op.t === 'rect' ? [op.x, op.x + op.w] : op.t === 'line' ? [op.x1, op.x2] : [op.x - (op.r ?? 0), op.x + (op.r ?? 0)];
      const ys = op.t === 'rect' ? [op.y, op.y + op.h] : op.t === 'line' ? [op.y1, op.y2] : [op.y - (op.r ?? 0), op.y + (op.r ?? 0)];
      assert.ok(Math.min(...xs) >= 29 && Math.max(...xs) <= p.width - 29, `op escapes the side margins on page ${p.number}`);
      assert.ok(Math.min(...ys) >= 29 && Math.max(...ys) <= p.height, `op escapes vertically on page ${p.number}`);
    }
  }
});

test('master template: text never overflows the card that holds it', () => {
  const long = item(1, { question: 'x'.repeat(400), options: ['y'.repeat(300), 'z'.repeat(120), 'Alpha', 'Delta'], book: 'w '.repeat(400) });
  const report = layoutMasterReport(doc([long]), style, set);
  for (const p of report.pages) {
    const rects = p.ops.filter(o => o.t === 'rect') as any[];
    for (const op of p.ops) {
      if (op.t !== 'text' || op.y > p.height - 60) continue;
      const w = measureText(op.text, op.bold, op.size, set);
      const owner = rects.filter(r => op.y >= r.y && op.y <= r.y + r.h && op.x >= r.x - 1 && op.x <= r.x + r.w).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      if (!owner) continue;
      assert.ok(op.x + w <= owner.x + owner.w + 0.8, `"${op.text.slice(0, 30)}" overflows by ${(op.x + w - owner.x - owner.w).toFixed(1)}pt`);
    }
  }
});

test('master template: a card taller than a column gets its own full-width page instead of looping or vanishing', () => {
  const giant = item(1, { question: 'Long question. '.repeat(120), book: 'Rationale text. '.repeat(200) });
  const report = layoutMasterReport(doc([giant, item(2)]), style, set);
  const wide = report.pages.flatMap(p => p.ops).filter(o => o.t === 'rect' && o.r === 7 && o.w > 500) as any[];
  assert.ok(wide.length >= 1, 'the oversized card should be laid out at full width');
  assert.ok(flat(report.pages, 'text').some(o => o.text === '1') && flat(report.pages, 'text').some(o => o.text === '2'));
});

test('master template: summary card closes the last page and carries the real numbers', () => {
  const items = [item(1, { status: 'correct' }), item(2, { status: 'wrong' }), item(3, { status: 'skipped' })];
  const report = layoutMasterReport(doc(items), style, set);
  const texts = flat(report.pages, 'text').map(o => o.text);
  assert.ok(texts.includes('Quiz Summary'));
  assert.ok(texts.includes('Correct') && texts.includes('Wrong') && texts.includes('Skipped'));
  assert.ok(texts.includes('55%'), 'score banner shows the score from the summary');
  const summary = report.pages[report.pages.length - 1].ops.filter(o => o.t === 'rect' && o.fill === '#4B2C7F' && o.r === 7 && o.w > 200 && o.h > 100) as any[];
  assert.equal(summary.length, 1, 'exactly one summary card, on the final page');
});

test('master template: answer modes — inline prints answers, key prints a key, none prints neither', () => {
  const items = [item(1), item(2, { status: 'wrong', user: 'Gamma' })];
  const inline = flat(layoutMasterReport(doc(items), style, set).pages, 'text').map(o => o.text);
  assert.ok(inline.some(t => t.startsWith('Ans.1.:')), 'inline answers after each question');
  assert.ok(inline.some(t => t.includes('Your answer:')), 'user answer line');

  const keyOnly = flat(layoutMasterReport(doc(items), { ...style, answers: 'key' }, set).pages, 'text').map(o => o.text);
  assert.ok(keyOnly.includes('Answer Key'));
  assert.ok(!keyOnly.some(t => t.startsWith('Ans.1.:')));

  const hidden = flat(layoutMasterReport(doc(items), { ...style, answers: 'none', showUserAnswer: false }, set).pages, 'text').map(o => o.text);
  assert.ok(!hidden.some(t => t.startsWith('Ans.')) && !hidden.some(t => t.includes('Your answer')));
  assert.equal(hidden.length < inline.length, true);
});

test('master template: one column, small and large type all stay inside the page', () => {
  const items = Array.from({ length: 6 }, (_, i) => item(i + 1));
  for (const variant of [{ columns: 1 as const }, { fontSize: 'sm' as const }, { fontSize: 'lg' as const }, { paper: 'letter' as const }]) {
    const report = layoutMasterReport(doc(items), { ...style, ...variant }, set);
    for (const p of report.pages) {
      for (const op of p.ops) {
        const maxX = op.t === 'rect' ? op.x + op.w : op.t === 'line' ? Math.max(op.x1, op.x2) : op.x;
        assert.ok(maxX <= p.width - 29.5, `${JSON.stringify(variant)}: content escapes the right margin`);
      }
    }
  }
});

test('layoutFor dispatches on the template and keeps the classic engine intact', () => {
  const d = doc([item(1)]);
  assert.ok(flat(layoutFor(d, style, set).pages, 'circle').length > 0, 'master draws circles');
  assert.equal(flat(layoutFor(d, { ...style, template: 'classic' }, set).pages, 'circle').length, 0, 'classic has no circles');
  assert.ok(styleFor('exam').template === 'classic', 'exam papers stay on the classic template');
  assert.ok(styleFor('all').template === 'master', 'reports default to the master template');
});

test('HTML export: self-contained, no network, escapes content, and matches the report data', () => {
  const d = {
    ...doc([item(1, { question: 'Which <script>alert(1)</script> is "correct"?' }), item(2, { status: 'wrong', user: 'Gamma' })]),
  };
  const html = docToMasterHtml(d, style);
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'a complete document');
  assert.ok(!/<script/i.test(html), 'no scripts, so nothing to sanitise and nothing to run');
  assert.ok(!/https?:\/\//i.test(html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '')), 'no external requests');
  assert.ok(!/@import|fonts\.googleapis/.test(html), 'no remote fonts');
  assert.ok(html.includes('&lt;script&gt;'), 'question text is escaped');
  assert.ok(html.includes('max-width:1000px'), 'the 1000px content column from the design');
  assert.ok(html.includes('grid-template-columns:1fr 1fr'), 'two-column grid');
  assert.ok(html.includes('#F5F3FF'), 'explanation boxes use the approved purple');
  assert.ok(html.includes('Ans.1.:'), 'the answer line is printed');
  assert.ok(html.includes('Quiz Summary') && html.includes('Saved on device'), 'summary and footer present');
  assert.ok((html.match(/<article class="card/g) ?? []).length === 2, 'one card per question');
  // the web-page export and the PDF now share one template
  assert.equal(docToHtml(d, style), html);
});

test('text export still works when the template is set to master', () => {
  const txt = docToText(doc([item(1)]), style);
  assert.ok(txt.includes('Q1.') && txt.includes('Ans.1.'));
});

test('buildQuestionDoc summary feeds the template (shown / maxScore / bookRange)', () => {
  const q = (question: string) => ({ question, options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correctAnswer: 'Beta', difficulty: 'medium' as const });
  const result = { id: 'r', quizTitle: 'TG 344 - 373', subject: 'Pharmacology', timestamp: 1, quizData: [q('one'), q('two'), q('three')], userAnswers: ['Beta', 'Alpha', null], totalQuestions: 3, percentage: 66, correct: 1, wrong: 1, skipped: 1, timeTaken: 60 };
  const d = buildQuestionDoc([result] as never, { order: 'original', difficulty: 'all', rationale: { showBook: true, showAi: true }, rationaleCache: {}, scope: 'quiz' });
  assert.equal(d.summary?.shown, 3);
  assert.equal(d.summary?.maxScore, 33);
  assert.equal(d.summary?.bookRange, 'TG 344 - 373');
  assert.equal(d.summary?.quizzesDetail?.[0].title, 'TG 344 - 373');
});

test('master template: markdown documents (revision sheets, legacy HTML) lay out as full-width cards', () => {
  const md = ['# Revision Sheet', 'Intro paragraph that is long enough to wrap over a couple of lines in the column.', '- bullet one', '  - nested bullet', '- bullet two', '> a quoted note', '---', '## Section two', 'More text.'].join('\n');
  const d = { kind: 'revision' as const, title: 'Revision Sheet — Pharmacology', meta: ['13 Nov 2026'], blocks: markdownToBlocks(md) };
  for (const columns of [1, 2] as const) {
    const report = layoutMasterReport(d, { ...style, columns }, set);
    const texts = flat(report.pages, 'text').map(o => o.text);
    assert.ok(texts.some(t => t.includes('Revision Sheet')), 'title is in the masthead');
    assert.ok(texts.some(t => t.includes('Intro paragraph')), 'body text is printed');
    assert.ok(texts.some(t => t.includes('Section two')), 'headings are printed');
    assert.ok(texts.some(t => t.includes('nested bullet')), 'nested bullets are printed');
    const widest = Math.max(...report.pages.flatMap(p => p.ops).filter(o => o.t === 'rect').map(o => o.w));
    assert.ok(widest > 400, 'markdown cards use the full content width');
  }
});

test('Word export stays on the classic page (Word cannot lay out the dashboard grid)', () => {
  const d = doc([item(1)]);
  const word = docToWordHtml(d, style);
  assert.ok(word.includes('urn:schemas-microsoft-com:office:word'), 'Word namespaces present');
  assert.ok(!word.includes('class="summary"'), 'no dashboard markup in the Word file');
  assert.ok(!word.includes('grid-template-columns'), 'no CSS grid, which Word ignores');
  assert.ok(word.includes('@page'), 'print setup kept');
});
