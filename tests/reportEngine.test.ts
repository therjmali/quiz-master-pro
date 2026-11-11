import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { segmentText, measureText, neededScripts, type Face, type FontSet } from '../src/utils/reports/pdf/fontSet';
import { layoutReport, wrapSpans } from '../src/utils/reports/pdf/layout';
import { buildQuestionDoc, reportFilename, styleFor } from '../src/utils/reports/pdf/model';
import { generatePdf } from '../src/utils/reports/pdf/generate';
import { docToHtml, docToText } from '../src/utils/reports/pdf/formats';
import { markdownToBlocks, parseInline } from '../src/utils/reports/pdf/markdown';
import { DEFAULT_STYLE, type ReportDoc } from '../src/utils/reports/pdf/types';
import { sanitizePrefs } from '../src/utils/reports/reportPrefs';
import { nodeFontSource } from './helpers/nodeFonts';

/** Fake fonts: every glyph is 0.5em wide; the "greek" face only covers Greek. */
const mk = (id: string, bold: boolean, covers: (cp: number) => boolean): Face => ({ id, bold, covers, width: (t, s) => [...t].length * s * 0.5 });
const latin = (cp: number) => (cp >= 0x20 && cp < 0x250);
const greek = (cp: number) => cp >= 0x370 && cp <= 0x3ff;
const fakeSet: FontSet = { regular: [mk('l', false, latin), mk('g', false, greek)], bold: [mk('lb', true, latin), mk('gb', true, greek)] };

const Q = (n: number, extra: Record<string, unknown> = {}) => ({ question: `Question ${n} about something`, options: ['Alpha', 'Beta', 'Gamma', 'Delta'], correctAnswer: 'Beta', difficulty: 'medium', ...extra });
const result = (qs: any[], answers: (string | null)[], extra: any = {}): any => ({ id: 'r1', quizTitle: 'Test Quiz', subject: 'Pharma', timestamp: 1_700_000_000_000, quizData: qs, userAnswers: answers, totalQuestions: qs.length, percentage: 50, correct: 0, wrong: 0, skipped: 0, timeTaken: 90, ...extra });
const BUILD = { order: 'attempt' as const, difficulty: 'all' as const, rationale: { showBook: true, showAi: true }, rationaleCache: {} as Record<string, string>, scope: 'quiz' as const };

test('segmentText: picks a face per character, replaces unsupported symbols, drops control characters', () => {
  const segs = segmentText('abc βγ def', false, fakeSet);
  assert.deepEqual(segs.map(s => [s.face.id, s.text]), [['l', 'abc '], ['g', 'βγ'], ['l', ' def']]);
  assert.equal(segmentText('x \u2265 3', false, fakeSet).map(s => s.text).join(''), 'x >= 3');
  assert.equal(segmentText('H\u2082O', false, fakeSet).map(s => s.text).join(''), 'H2O');
  assert.equal(segmentText('a\u0007b', false, fakeSet).map(s => s.text).join(''), 'ab');
  assert.equal(segmentText('\u4e2d', false, fakeSet).map(s => s.text).join(''), '?'); // no font has it
  assert.equal(measureText('abcd', false, 10, fakeSet), 20);
  assert.deepEqual(neededScripts(['plain', 'β']), { latinExt: false, greek: true, devanagari: false });
  assert.deepEqual(neededScripts(['हिन्दी', 'ā']), { latinExt: true, greek: false, devanagari: true });
});

test('wrapSpans: wraps at the width, indents continuation lines, splits endless words', () => {
  const lines = wrapSpans([{ text: 'aaaa bbbb cccc dddd', bold: false }], 50, 10, fakeSet); // 10 chars per line
  assert.deepEqual(lines.map(l => l.map(s => s.text).join('')), ['aaaa bbbb', 'cccc dddd']);
  const hang = wrapSpans([{ text: 'aaaa bbbb cccc', bold: false }], 50, 10, fakeSet, 10); // continuation lines 8 chars
  assert.ok(hang.length >= 2);
  const long = wrapSpans([{ text: 'x'.repeat(40), bold: true }], 50, 10, fakeSet);
  assert.ok(long.length >= 4 && long.every(l => l.map(s => s.text).join('').length <= 10));
  assert.deepEqual(wrapSpans([{ text: '   ', bold: false }], 50, 10, fakeSet).length, 1);
});

test('buildQuestionDoc: kinds, order, difficulty, rationale switches, multi-answer', () => {
  const qs = [Q(1, { difficulty: 'easy', rationale: 'Book note 1', originalIndex: 5 }), Q(2, { difficulty: 'hard', correctAnswers: ['Beta', 'Gamma'] }), Q(3, { originalIndex: 0 }), Q(4)];
  const r = result(qs, ['Beta', 'Alpha', null, 'Beta']);
  const all = buildQuestionDoc([r], { ...BUILD, kind: 'all' });
  assert.equal(all.items!.length, 4);
  assert.deepEqual(all.items!.map(i => i.status), ['correct', 'wrong', 'skipped', 'correct']);
  assert.deepEqual(buildQuestionDoc([r], { ...BUILD, kind: 'wrong' }).items!.map(i => i.question), ['Question 2 about something']);
  assert.equal(buildQuestionDoc([r], { ...BUILD, kind: 'wrong' }).items![0].n, 1, 'numbers restart in a filtered report');
  assert.equal(buildQuestionDoc([r], { ...BUILD, kind: 'skipped' }).items!.length, 1);
  assert.equal(buildQuestionDoc([r], { ...BUILD, kind: 'all', difficulty: 'easy' }).items!.length, 1);
  assert.equal(buildQuestionDoc([r], { ...BUILD, kind: 'all', order: 'original' }).items![0].question, 'Question 3 about something');
  assert.deepEqual(all.items![1].correct, ['Beta', 'Gamma']);
  assert.equal(all.items![0].book, 'Book note 1');
  assert.equal(buildQuestionDoc([r], { ...BUILD, kind: 'all', rationale: { showBook: false, showAi: false } }).items![0].book, '');
  const ai = buildQuestionDoc([r], { ...BUILD, kind: 'all', rationaleCache: { 'Question 1 about something': 'AI says so' } });
  assert.equal(ai.items![0].ai, 'AI says so');
  assert.equal(all.summary!.correct, 2); assert.equal(all.summary!.wrong, 1); assert.equal(all.summary!.skipped, 1);
  assert.match(reportFilename('wrong', [r], 'pdf', new Date(2026, 10, 11)), /^RJQuiz_Mistakes_Test-Quiz_Pharma_20261111\.pdf$/);
  assert.equal(styleFor('exam').answers, 'key'); assert.equal(styleFor('exam', {}, true).answers, 'inline'); assert.equal(styleFor('wrong').showUserAnswer, true); assert.equal(styleFor('correct').showUserAnswer, false);
});

test('layoutReport: two columns fill left then right, answers stay with their question, footer on every page', () => {
  const qs = Array.from({ length: 30 }, (_, i) => Q(i + 1, { rationale: i % 4 === 0 ? 'Because of reasons. '.repeat(8) : undefined }));
  const doc = buildQuestionDoc([result(qs, qs.map(q => q.correctAnswer))], { ...BUILD, kind: 'all' });
  const report = layoutReport(doc, DEFAULT_STYLE, fakeSet);
  assert.ok(report.pages.length >= 2);
  const colOf = (x: number, w: number) => (x < w / 2 ? 0 : 1);
  for (const p of report.pages) {
    assert.ok(p.ops.every(o => o.t !== 'text' || (o.x >= 0 && o.x <= p.width && o.y > 0 && o.y <= p.height)), 'nothing outside the page');
    const footer = p.ops.filter(o => o.t === 'text' && /^Page \d+ of \d+$/.test(o.text));
    assert.equal(footer.length, 1);
    const qOps = p.ops.filter((o): o is Extract<typeof o, { t: 'text' }> => o.t === 'text' && /^Q\d+\.$/.test(o.text));
    for (const q of qOps) {
      const n = q.text.slice(1, -1);
      const ans = p.ops.find(o => o.t === 'text' && o.text === `Ans.${n}. : `);
      assert.ok(ans && ans.t === 'text', `Ans.${n} is on the same page as Q${n}`);
      assert.equal(colOf(ans.x, p.width), colOf(q.x, p.width), `Ans.${n} is in the same column as Q${n}`);
      assert.ok(ans.y > q.y, 'answer is below the question');
    }
  }
  const page1Cols = new Set(report.pages[0].ops.filter(o => o.t === 'text' && /^Q\d+\.$/.test(o.text)).map(o => (o as any).x > 297 ? 1 : 0));
  assert.equal(page1Cols.size, 2, 'both columns are used on page 1');
  const single = layoutReport(doc, { ...DEFAULT_STYLE, columns: 1 }, fakeSet);
  assert.ok(single.pages.length > report.pages.length);
});

test('layoutReport: exam paper puts an answer key at the end; "none" prints no answers', () => {
  const qs = Array.from({ length: 6 }, (_, i) => Q(i + 1, { rationale: 'Because.' }));
  const doc = buildQuestionDoc([result(qs, qs.map(() => null))], { ...BUILD, kind: 'exam' });
  const texts = (s = styleFor('exam')) => layoutReport(doc, s, fakeSet).pages.flatMap(p => p.ops).filter(o => o.t === 'text').map(o => (o as any).text as string);
  assert.ok(texts().includes('Answer Key')); assert.ok(texts().includes('Explanations')); assert.ok(!texts().some(t => t.startsWith('Ans.')));
  assert.ok(!texts({ ...styleFor('exam'), answers: 'none' }).includes('Answer Key'));
  assert.ok(texts({ ...styleFor('exam'), answers: 'inline' }).some(t => t.startsWith('Ans.1.')));
});

test('layoutReport: a very long rationale is split across columns, never lost or looping', () => {
  const doc = buildQuestionDoc([result([Q(1, { rationale: 'word '.repeat(2500) })], ['Beta'])], { ...BUILD, kind: 'all' });
  const report = layoutReport(doc, DEFAULT_STYLE, fakeSet);
  const words = report.pages.flatMap(p => p.ops).filter(o => o.t === 'text').map(o => (o as any).text as string).join(' ').split(/\s+/).filter(w => w === 'word').length;
  assert.equal(words, 2500);
});

test('generatePdf (real fonts): valid PDF with the right page count, Hindi + Greek + symbols do not crash', async () => {
  const qs = [Q(1, { question: 'हिन्दी में प्रश्न: क्षय रोग कौन सा है?', options: ['क्षय', 'टायफाइड', 'मलेरिया', 'डेंगू'], correctAnswer: 'क्षय', rationale: 'β-blocker 5 µg ≥ 3 H₂O → done' }), ...Array.from({ length: 40 }, (_, i) => Q(i + 2))];
  const doc = buildQuestionDoc([result(qs, qs.map(q => q.correctAnswer))], { ...BUILD, kind: 'all' });
  const { bytes, pages } = await generatePdf(doc, styleFor('all'), nodeFontSource);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  const parsed = await PDFDocument.load(bytes);
  assert.equal(parsed.getPageCount(), pages); assert.ok(pages >= 2);
  assert.match(parsed.getTitle() ?? '', /Full Report/);
  assert.ok(bytes.length > 20_000 && bytes.length < 3_000_000);
});

test('docToText / docToHtml follow the same settings and escape markup', () => {
  const doc = buildQuestionDoc([result([Q(1, { question: 'Is <b>x</b> & y?', rationale: 'Because' })], ['Alpha'])], { ...BUILD, kind: 'all' });
  const t = docToText(doc, styleFor('all'));
  assert.match(t, /Q1\. Is <b>x<\/b> & y\?/); assert.match(t, /Ans\.1\. : \(B\) Beta/); assert.match(t, /Your answer: \(A\) Alpha - Incorrect/); assert.match(t, /Explanation: Because/);
  const noAns = docToText(doc, { ...styleFor('all'), answers: 'none' });
  assert.ok(!/Ans\.1/.test(noAns));
  const h = docToHtml(doc, styleFor('all'));
  assert.ok(h.includes('Is &lt;b&gt;x&lt;/b&gt; &amp; y?') && !h.includes('<b>x</b>'));
});

test('markdown: headings, bullets, quotes, bold spans, tables', () => {
  const b = markdownToBlocks('## Title\n\n- **Term** — fact\n  - nested\n1. first\n> tip\n---\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.deepEqual(b.map(x => x.type), ['h2', 'li', 'li', 'li', 'quote', 'hr', 'p', 'p']);
  assert.deepEqual(parseInline('a **b** c'), [{ text: 'a ', bold: false }, { text: 'b', bold: true }, { text: ' c', bold: false }]);
  const doc: ReportDoc = { kind: 'revision', title: 'Rev', meta: [], blocks: b };
  const rep = layoutReport(doc, { ...DEFAULT_STYLE, columns: 1 }, fakeSet);
  assert.ok(rep.pages.length >= 1);
});

test('report prefs are sanitised', () => {
  assert.deepEqual(sanitizePrefs({ columns: 7, fontSize: 'huge', paper: 'a3', brand: '   ', showUserAnswer: 'x' }), { columns: 2, fontSize: 'md', paper: 'a4', brand: 'R.J QUIZ', showUserAnswer: true });
  assert.equal(sanitizePrefs({ brand: 'A'.repeat(90) }).brand.length, 28);
  assert.equal(sanitizePrefs({ columns: 1, paper: 'letter', showUserAnswer: false }).showUserAnswer, false);
});
