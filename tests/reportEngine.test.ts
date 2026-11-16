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
import { CARD_TONES, DIFF_EMOJI, STATUS_EMOJI, isCardItem, levelOf, markedOptions, rationaleBullets } from '../src/utils/reports/pdf/cardModel';
import { nodeFontSource } from './helpers/nodeFonts';

/** Fake fonts: every glyph is 0.5em wide; the "greek" face only covers Greek. */
const mk = (id: string, bold: boolean, covers: (cp: number) => boolean): Face => ({ id, bold, covers, width: (t, s) => [...t].length * s * 0.5 });
const latin = (cp: number) => (cp >= 0x20 && cp < 0x250) || cp === 0x2022;
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
      // the card of a question keeps its last option on the same page and in the same column, below the question
      const after = p.ops.slice(p.ops.indexOf(q));
      const lastOpt = after.find((o): o is Extract<typeof o, { t: 'text' }> => o.t === 'text' && o.text === '(D)');
      assert.ok(lastOpt, `${q.text} keeps its options on the same page`);
      assert.equal(colOf(lastOpt.x, p.width), colOf(q.x, p.width), `${q.text} options are in the same column`);
      assert.ok(lastOpt.y > q.y, 'options are below the question');
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
  assert.ok(texts().includes('Answer Key')); assert.ok(!texts().includes('Explanations'), 'no "Explanations" title: a rule and the 📖 icon instead');
  assert.ok(texts().some(t => /^Ans\. 1 \(B\)$/.test(t)), 'key entries read "Ans. 1 (B)"');
  assert.ok(!texts({ ...styleFor('exam'), answers: 'none' }).includes('Answer Key'));
  assert.ok(texts({ ...styleFor('exam'), answers: 'inline' }).some(t => /^Ans\. 1 \(B\)/.test(t)));
});

test('exam paper: black & white, no question numbers by default, "Ans. 1 (C)", 📖 bullets without an "Explanation" label', () => {
  const qs = [Q(1, { rationale: '• Point A\n• Point B' }), Q(2, { rationale: 'Second' })];
  const doc = buildQuestionDoc([result(qs, [null, null])], { ...BUILD, kind: 'exam' });
  const run = (s: any) => layoutReport(doc, s, fakeSet).pages.flatMap(p => p.ops);
  const hex = (c: string) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const isGray = (c?: string) => !c || !/^#[0-9a-f]{6}$/i.test(c) || new Set(hex(c)).size === 1;
  const base = { ...styleFor('exam'), answers: 'inline' as const, columns: 1 as const };
  const ops = run(base);
  assert.equal(base.mono, true);
  assert.ok(ops.every(o => o.t === 'line' || o.t === 'text' ? isGray(o.color) : isGray((o as any).fill) && isGray((o as any).stroke)), 'every colour is black or grey');
  const texts = ops.filter(o => o.t === 'text').map(o => (o as any).text as string);
  assert.ok(!texts.some(t => /^\d+\.$/.test(t) || /^Q\d+\.$/.test(t)), 'no question numbers by default');
  assert.ok(texts.some(t => /^Ans\. 1 \(B\) /.test(t)) && texts.some(t => /^Ans\. 2 \(B\) /.test(t)), '"Ans. 1 (C)" style answer lines');
  assert.ok(!texts.some(t => /Explanation|Rationale|Your answer|Correct$/.test(t)) && texts.some(t => t.includes('Point A')) && texts.some(t => t.includes('Point B')), 'bullets, no label');
  assert.ok(ops.some(o => o.t === 'rect' && o.stroke === '#111111'), 'the 📖 icon is drawn (outline in black)');
  // numbers on request, and always when the answers are in a key at the end
  assert.ok(run({ ...base, examNumbers: true }).some(o => o.t === 'text' && /^1\.$/.test(o.text)));
  assert.ok(run({ ...base, answers: 'key' }).some(o => o.t === 'text' && /^1\.$/.test(o.text)), 'a key needs numbers');
  assert.ok(!run({ ...base, answers: 'none' }).some(o => o.t === 'text' && /^Ans\./.test(o.text)), 'hidden: no answers');
  // other reports keep their colours
  assert.equal(styleFor('all').mono, undefined);
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
  const doc = buildQuestionDoc([result([Q(1, { question: 'Is <b>x</b> & y?', rationale: '• Because\n• Second point' })], ['Alpha'])], { ...BUILD, kind: 'all' });
  const t = docToText(doc, styleFor('all'));
  assert.match(t, /^❌ Q1\. 🟡 Is <b>x<\/b> & y\?$/m);
  assert.match(t, /^ {2}\(B\) Beta {2}✓$/m, 'the correct option carries the green check');
  assert.match(t, /^ {2}\(A\) Alpha {2}✗$/m, 'the wrong pick is marked');
  assert.match(t, /^ {2}📖 • Because$/m); assert.match(t, /^ {5}• Second point$/m);
  assert.ok(!/Explanation|Rationale|Answer|Ans\./i.test(t), 'no text labels in the card format');
  const noAns = docToText(doc, { ...styleFor('all'), answers: 'none' });
  assert.ok(!/✓|📖/.test(noAns), 'answers hidden: no check, no rationale');
  const h = docToHtml(doc, { ...styleFor('all'), template: 'classic' });
  assert.ok(h.includes('Is &lt;b&gt;x&lt;/b&gt; &amp; y?') && !h.includes('<b>x</b>'));
  assert.match(h, /class="card wrong"/); assert.match(h, /prefers-color-scheme:dark/);
  assert.ok(docToHtml(doc, styleFor('all')).includes('Is &lt;b&gt;x&lt;/b&gt; &amp; y?'), 'the default (master) web page escapes too');
  // the exam paper (a blank test) keeps the plain numbered layout
  const exam = docToText(buildQuestionDoc([result([Q(1, { rationale: 'Because' })], [null])], { ...BUILD, kind: 'exam' }), styleFor('exam', {}, true));
  assert.match(exam, /^Ans\. 1 \(B\) Beta$/m, 'exam paper: "Ans. 1 (C) text"');
  assert.match(exam, /^ {2}📖 • Because$/m); assert.ok(!/Explanation|Ans\.1\./.test(exam));
  assert.ok(!/^(\d+\.|Q\d+\.) /m.test(exam), 'no question numbers in the exam text');
  const examHtml = docToHtml(buildQuestionDoc([result([Q(1, { rationale: 'Because' })], [null])], { ...BUILD, kind: 'exam' }), styleFor('exam', {}, true));
  assert.ok(examHtml.includes('<body class="mono">') && examHtml.includes('Ans. 1 ') && examHtml.includes('📖') && !examHtml.includes('Explanation:'), 'exam web page: black & white, same format');
});

test('card model: status icons, difficulty emoji, check marks and rationale bullets map correctly', () => {
  assert.deepEqual([STATUS_EMOJI.correct, STATUS_EMOJI.wrong, STATUS_EMOJI.skipped], ['✅', '❌', '⏭️']);
  assert.deepEqual([DIFF_EMOJI.easy, DIFF_EMOJI.medium, DIFF_EMOJI.hard], ['🟢', '🟡', '🔴']);
  assert.equal(levelOf('Hard'), 'hard'); assert.equal(levelOf(undefined), null); assert.equal(levelOf('mixed'), null);
  assert.equal(CARD_TONES.correct.fill, '#f0fdf4'); assert.equal(CARD_TONES.wrong.fill, '#fef2f2'); assert.equal(CARD_TONES.skipped.fill, '#fefce8');
  assert.deepEqual(rationaleBullets('• One\n- Two\n\n3) Three'), ['One', 'Two', 'Three']);
  assert.deepEqual(rationaleBullets('• First • Second'), ['First', 'Second'], 'inline bullets become separate lines');
  assert.deepEqual(rationaleBullets('Plain sentence.'), ['Plain sentence.']);
  assert.deepEqual(rationaleBullets(''), []); assert.deepEqual(rationaleBullets(undefined), []);
  const base = { n: 1, question: 'q', options: ['A1', 'B1', 'C1', 'D1'], correct: ['B1'] } as const;
  const on = { inlineAnswers: true, showUserAnswer: true };
  assert.deepEqual(markedOptions({ ...base, user: 'B1', status: 'correct' }, on), { ok: [false, true, false, false], no: [false, false, false, false] });
  assert.deepEqual(markedOptions({ ...base, user: 'D1', status: 'wrong' }, on), { ok: [false, true, false, false], no: [false, false, false, true] });
  assert.deepEqual(markedOptions({ ...base, user: 'D1', status: 'wrong' }, { ...on, showUserAnswer: false }).no, [false, false, false, false]);
  assert.deepEqual(markedOptions({ ...base, user: null, status: 'skipped' }, on).ok, [false, true, false, false], 'skipped: the correct option still carries the check, so a skipped-only report shows its answers');
  assert.deepEqual(markedOptions({ ...base, user: null, status: 'skipped' }, on).no, [false, false, false, false]);
  assert.deepEqual(markedOptions({ ...base, user: null, status: 'unknown' }, on).ok, [false, false, false, false], 'no status (a blank paper): no check');
  assert.deepEqual(markedOptions({ ...base, user: 'B1', status: 'correct' }, { ...on, inlineAnswers: false }).ok, [false, false, false, false], 'answers at the end / hidden: no check');
  assert.equal(isCardItem({ ...base, user: null, status: 'skipped' }, 'all'), true);
  assert.equal(isCardItem({ ...base, user: null, status: 'skipped' }, 'exam'), false);
  assert.equal(isCardItem({ ...base, user: null, status: 'unknown' }, 'all'), false);
});

test('layoutReport: status cards - tinted background per status, icons, difficulty dot, check marks, 📖 rationale without labels', () => {
  const qs = [
    Q(1, { difficulty: 'easy', rationale: '• Point A\n• Point B' }),
    Q(2, { difficulty: 'hard', rationale: 'Because it is.' }),
    Q(3, { difficulty: undefined, rationale: 'Skipped note' }),
  ];
  const doc = buildQuestionDoc([result(qs, ['Beta', 'Alpha', null])], { ...BUILD, kind: 'all' });
  const rep = layoutReport(doc, { ...DEFAULT_STYLE, columns: 1 }, fakeSet);
  const ops = rep.pages.flatMap(p => p.ops);
  const cards = ops.filter((o): o is Extract<typeof o, { t: 'rect' }> => o.t === 'rect' && !!o.r && o.r === 6);
  assert.deepEqual(cards.map(c => c.fill), ['#f0fdf4', '#fef2f2', '#fefce8'], 'green / red / yellow cards in question order');
  assert.ok(cards.every(c => c.w > 100 && c.h > 40));
  const circles = ops.filter((o): o is Extract<typeof o, { t: 'circle' }> => o.t === 'circle');
  const fills = circles.map(c => c.fill);
  for (const f of ['#16a34a', '#dc2626', '#ca8a04']) assert.ok(fills.includes(f), `status icon ${f}`);
  assert.ok(fills.includes('#22c55e') && fills.includes('#ef4444'), 'easy (green) and hard (red) dots');
  assert.ok(!fills.includes('#eab308'), 'no yellow dot: no question here is medium');
  assert.equal(fills.filter(f => f === '#22c55e' || f === '#eab308' || f === '#ef4444').length, 2, 'no dot for the question without difficulty');
  const texts = ops.filter(o => o.t === 'text').map(o => (o as any).text as string);
  assert.ok(texts.includes('Q1.') && texts.includes('Q2.') && texts.includes('Q3.'));
  assert.ok(!texts.some(t => /Ans\.|Explanation|Rationale|Answer/i.test(t)), 'no text labels');
  assert.ok(texts.includes('• ') && texts.some(t => t.includes('Point A')) && texts.some(t => t.includes('Point B')));
  // green check marks: Q1 (correct), Q2 (the correct option 'Beta') and the skipped Q3 (its correct option)
  const greenChecks = ops.filter(o => o.t === 'line' && o.color === '#16a34a' && o.cap === 'round' && o.w < 2 && o.x1 > 400);
  assert.equal(greenChecks.length, 6, 'two lines per check, one per card');
  const redMarks = ops.filter(o => o.t === 'line' && o.color === '#dc2626' && o.cap === 'round' && o.x1 > 400 && o.w < 2);
  assert.equal(redMarks.length, 2, 'the wrong pick of Q2 gets a cross');
  // answers hidden: tint stays, marks and rationale go
  const hidden = layoutReport(doc, { ...DEFAULT_STYLE, columns: 1, answers: 'none' }, fakeSet).pages.flatMap(p => p.ops);
  assert.equal(hidden.filter(o => o.t === 'rect' && o.r === 6).length, 3);
  assert.ok(!hidden.some(o => o.t === 'text' && o.text.includes('Point A')));
  assert.equal(hidden.filter(o => o.t === 'line' && o.color === '#16a34a' && o.cap === 'round' && o.x1 > 400).length, 0);
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
  assert.deepEqual(sanitizePrefs({ columns: 7, fontSize: 'huge', paper: 'a3', brand: '   ', showUserAnswer: 'x' }), { columns: 2, fontSize: 'md', paper: 'a4', brand: 'R.J QUIZ', showUserAnswer: true, examNumbers: false });
  assert.equal(sanitizePrefs({ examNumbers: true }).examNumbers, true);
  assert.equal(sanitizePrefs({ brand: 'A'.repeat(90) }).brand.length, 28);
  assert.equal(sanitizePrefs({ columns: 1, paper: 'letter', showUserAnswer: false }).showUserAnswer, false);
});

test('bookmark exam paper: built from saved questions by the same engine (black & white, no results chips)', async () => {
  const { bookmarksToSession } = await import('../src/utils/reports/bookmarkSession');
  const session = bookmarksToSession([{ question: 'Q one?', options: ['a', 'b', 'c', 'd'], correctAnswer: 'b', rationale: '• Because', difficulty: 'hard', quizTitle: 'T', subject: 'S' }], 'My marks');
  assert.equal(session.kind, 'exam');
  const doc = buildQuestionDoc(session.results, { ...BUILD, kind: 'exam', scope: 'quiz', order: 'original' });
  assert.equal(doc.summary, undefined, 'no 0 correct / 0 wrong chips');
  assert.ok(doc.meta.some(m => /1 bookmarked question$/.test(m)));
  const style = { ...styleFor('exam'), answers: 'inline' as const };
  const texts = layoutReport(doc, style, fakeSet).pages.flatMap(p => p.ops).filter(o => o.t === 'text').map(o => (o as any).text as string);
  assert.ok(texts.some(t => /^Ans\. 1 \(B\) b$/.test(t)) && texts.some(t => t.includes('Because')));
});
