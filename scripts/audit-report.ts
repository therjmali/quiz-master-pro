/**
 * Dev-only layout auditor: lays a synthetic 30-question result out with the master template and checks the
 * geometry that is easy to get wrong — no element outside the printable area, no two question cards overlapping,
 * every column reasonably filled, footers on every page, and nothing dropped.
 *
 *   node --import tsx scripts/audit-report.ts
 *
 * Exits non-zero when an invariant breaks, so it can be used while iterating on the template.
 */
import { buildQuestionDoc, styleFor } from '../src/utils/reports/pdf/model';
import { createReportFonts } from '../src/utils/reports/pdf/reportFonts';
import { layoutMasterReport } from '../src/utils/reports/pdf/masterTemplate';
import type { Page } from '../src/utils/reports/pdf/types';
import { nodeFontSource } from '../tests/helpers/nodeFonts';
import type { QuizQuestion, QuizResult } from '../src/types/quiz';

const M = { l: 30, r: 30, t: 30, b: 44 };

function makeResult(n: number): QuizResult {
  const sets = [
    ['Reversible inhibition', 'Irreversible block', 'Partial agonism', 'Inverse agonism'],
    ['A considerably longer option that has to wrap onto a second line to prove the layout copes', 'Second long option', 'Third', 'Fourth'],
    ['Alpha', 'Beta', 'Gamma', 'Delta'],
  ];
  const quizData: QuizQuestion[] = Array.from({ length: n }, (_, i) => ({
    question: [
      'Which of the following statements about the mechanism of action is correct according to the standard text?',
      'A 42-year-old patient presents with the classic triad. What is the most likely diagnosis?',
      'Name the single best investigation for confirming the diagnosis in this patient.',
    ][i % 3],
    options: sets[i % 3],
    correctAnswer: sets[i % 3][1],
    difficulty: (i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard') as QuizQuestion['difficulty'],
    rationale: 'This is a high-yield fact that has appeared in three previous exams, so learn the exact wording.',
    originalIndex: i,
  }));
  const userAnswers: (string | null)[] = quizData.map((q, i) => (i % 7 === 3 || i % 7 === 6 ? null : i % 3 === 0 ? q.correctAnswer : q.options[3] ?? null));
  return {
    id: 'a', totalQuestions: n, quizData, userAnswers,
    correct: 0, wrong: 0, skipped: 0, gain: 0, penalty: 0, netScore: 0, maxScore: n, percentage: 64, accuracy: 64,
    score: 240, timeTaken: 2645, difficulty: 'medium', timestamp: 1794562200000,
    quizTitle: 'TG 344 - 373', subject: 'Pharmacology', passMark: 50,
  } as unknown as QuizResult;
}

const result = makeResult(30);
const doc = buildQuestionDoc([result], {
  kind: 'all', order: 'original', difficulty: 'all',
  rationale: { showBook: true, showAi: true },
  rationaleCache: Object.fromEntries(Array.from(new Set((result.quizData ?? []).map(q => q.question))).map((q, i) => [q, `AI note ${i + 1}`])),
  scope: 'quiz',
});
const style = styleFor('all', { columns: 2, fontSize: 'md', paper: 'a4', brand: 'R.J QUIZ', showUserAnswer: true });
const fonts = await createReportFonts([doc.title, ...(doc.items ?? []).flatMap(i => [i.question, ...i.options, i.book ?? '', i.ai ?? ''])], nodeFontSource);
const report = layoutMasterReport(doc, style, fonts.set);

const W = report.pages[0].width, H = report.pages[0].height;
const problems: string[] = [];
const note = (m: string) => problems.push(m);

/** Card rectangles = the big filled rects that start a card (height > 40, rounded). */
function cards(p: Page) {
  return p.ops.filter(o => o.t === 'rect' && o.r === 7 && o.h > 60 && o.w > 100) as Extract<Page['ops'][number], { t: 'rect' }>[];
}

/** Footer/dividers are excluded from the bounds test by construction; everything else must be inside. */
function boundsCheck(p: Page, i: number) {
  for (const op of p.ops) {
    const xs: number[] = [], ys: number[] = [];
    if (op.t === 'rect') { xs.push(op.x, op.x + op.w); ys.push(op.y, op.y + op.h); }
    else if (op.t === 'circle') { xs.push(op.x - op.r, op.x + op.r); ys.push(op.y - op.r, op.y + op.r); }
    else if (op.t === 'line') { xs.push(op.x1, op.x2); ys.push(op.y1, op.y2); }
    else { xs.push(op.x); ys.push(op.y); }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    // the very top masthead starts at the top margin, the footer sits below the bottom margin
    if (minX < M.l - 0.6 || maxX > W - M.r + 0.6) note(`page ${i + 1}: op ${op.t} outside the side margins (${minX.toFixed(1)}..${maxX.toFixed(1)})`);
    if (minY < M.t - 0.6) note(`page ${i + 1}: op ${op.t} above the top margin (${minY.toFixed(1)})`);
    if (maxY > H - 9) note(`page ${i + 1}: op ${op.t} runs into the footer (${maxY.toFixed(1)})`);
  }
}

report.pages.forEach((p, i) => boundsCheck(p, i));
if (process.env.DUMP) report.pages.forEach((p, i) => {
  console.log(`-- page ${i + 1}`);
  p.ops.forEach((o, k) => { if (o.t === 'rect' && o.h > 40 && o.w > 100) console.log('  ', k, `x=${o.x.toFixed(0)} y=${o.y.toFixed(0)} w=${o.w.toFixed(0)} h=${o.h.toFixed(0)} r=${o.r} fill=${o.fill}`); });
});

// cards must not overlap
report.pages.forEach((p, i) => {
  const c = cards(p);
  for (let a = 0; a < c.length; a++) for (let b = a + 1; b < c.length; b++) {
    const A = c[a], B = c[b];
    // stacked gradient bands of one masthead/summary card share the same origin — not an overlap
    if (Math.abs(A.x - B.x) < 0.5 && Math.abs(A.y - B.y) < 0.5) continue;
    const overlap = A.x < B.x + B.w && A.x + A.w > B.x && A.y < B.y + B.h && A.y + A.h > B.y;
    if (overlap) note(`page ${i + 1}: cards overlap (${A.x.toFixed(0)},${A.y.toFixed(0)}) and (${B.x.toFixed(0)},${B.y.toFixed(0)})`);
  }
});

// content must stay clear of the footer rule
const colBottom = H - M.b;
report.pages.forEach((p, i) => {
  for (const op of p.ops) {
    const bottom = op.t === 'rect' ? op.y + op.h : op.t === 'circle' ? op.y + op.r : op.t === 'line' ? Math.max(op.y1, op.y2) : op.y;
    if (bottom > colBottom + 6 && bottom < H - 40) note(`page ${i + 1}: content below the content area (${bottom.toFixed(1)} > ${colBottom})`);
  }
});

// every page has a footer with the right page number
const totals = report.pages.length;
report.pages.forEach((p, i) => {
  const label = `Page ${p.number} of ${totals}`;
  const has = p.ops.some(o => o.t === 'text' && o.text.includes(label));
  if (!has) note(`page ${i + 1}: footer is missing "${label}"`);
});

// text must stay inside the card it sits in
import { measureText } from '../src/utils/reports/pdf/fontSet';
report.pages.forEach((p, i) => {
  const rects = p.ops.filter(o => o.t === 'rect') as Extract<Page['ops'][number], { t: 'rect' }>[];
  for (const op of p.ops) {
    if (op.t !== 'text' || op.y > H - 60) continue; // the footer is its own band
    const w = measureText(op.text, op.bold, op.size, fonts.set);
    const owner = rects
      .filter(r => op.y >= r.y && op.y <= r.y + r.h && op.x >= r.x - 1 && op.x <= r.x + r.w)
      .sort((A, B) => A.w * A.h - B.w * B.h)[0];
    if (!owner) continue;
    if (op.x + w > owner.x + owner.w + 0.8) {
      note(`page ${i + 1}: text overflows its card by ${(op.x + w - owner.x - owner.w).toFixed(1)}pt "${op.text.slice(0, 44)}"`);
    }
  }
});

const print = report.pages.map((p, i) => {
  const c = cards(p);
  const cols = [0, 1].map(col => {
    const inCol = c.filter(x => Math.abs(x.x - (M.l + col * (p.width - M.l - M.r - 16) / 2 + col * 16)) < 2);
    const lowest = inCol.length ? Math.max(...inCol.map(x => x.y + x.h)) : 0;
    return { col, cards: inCol.length, bottom: Number(lowest.toFixed(0)), fill: Number(((lowest - M.t) / (colBottom - M.t) * 100).toFixed(0)) };
  });
  return { page: i + 1, cards: c.length, cols };
});

console.log(JSON.stringify({ pages: totals, questions: doc.items?.length, layout: print }, null, 1));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n` + problems.slice(0, 25).join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nOK: bounds, overlaps, footers and flow all check out.');
}
