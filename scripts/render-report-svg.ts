/**
 * Dev-only: lays a real quiz result out with the production master template and serialises every page to a
 * standalone SVG (real font metrics, same ops the PDF gets) so the design can be inspected with no browser.
 *
 *   node --import tsx scripts/render-report-svg.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildQuestionDoc, styleFor } from '../src/utils/reports/pdf/model';
import { createReportFonts } from '../src/utils/reports/pdf/reportFonts';
import { layoutMasterReport } from '../src/utils/reports/pdf/masterTemplate';
import { nodeFontSource } from '../tests/helpers/nodeFonts';
import type { QuizQuestion, QuizResult } from '../src/types/quiz';

const BOOK = [
  'This is a high-yield fact from TG 344. It has appeared in three previous exams, so learn the exact wording.',
  'Refer to the parent drug class: the mechanism is shared by every agent in the group, which is why the side-effect profile is similar.',
  'Competitive antagonists shift the dose-response curve right without lowering the maximum response; non-competitive ones flatten it.',
];
const AI = [
  'You missed the same concept twice; review the summary table in unit 8 before the next attempt.',
  'You changed your answer on this one three times — trust the first reasoned choice.',
];
const QUESTIONS = [
  'Which of the following statements about the mechanism of action is correct according to the standard text?',
  'A 42-year-old patient presents with the classic triad. What is the most likely diagnosis?',
  'Name the single best investigation for confirming the diagnosis in this patient.',
  'Which drug is contraindicated in the second trimester of pregnancy?',
  'The most common side effect of this class is best described as:',
  'Which of the following is NOT a recognised complication of long-term therapy?',
];
const OPTION_SETS = [
  ['Reversible inhibition', 'Irreversible block', 'Partial agonism', 'Inverse agonism'],
  ['A considerably longer option that has to wrap onto a second line to prove the layout copes', 'Second long option', 'Third', 'Fourth'],
  ['Alpha', 'Beta', 'Gamma', 'Delta'],
];

function makeResult(n: number): QuizResult {
  const quizData: QuizQuestion[] = Array.from({ length: n }, (_, i) => ({
    question: QUESTIONS[i % QUESTIONS.length],
    options: OPTION_SETS[i % OPTION_SETS.length],
    correctAnswer: OPTION_SETS[i % OPTION_SETS.length][1],
    difficulty: (i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard') as QuizQuestion['difficulty'],
    rationale: BOOK[i % BOOK.length],
    originalIndex: i,
  }));
  const userAnswers: (string | null)[] = quizData.map((q, i) => (i % 7 === 3 || i % 7 === 6 ? null : i % 3 === 0 ? q.correctAnswer : q.options[3 - (i % 3)] ?? null));
  return {
    id: 'sample', totalQuestions: n, quizData, userAnswers,
    correct: 0, wrong: 0, skipped: 0, gain: 0, penalty: 0, netScore: 0, maxScore: n, percentage: 64, accuracy: 64,
    score: 240, timeTaken: 2645, difficulty: 'medium', timestamp: 1794562200000,
    quizTitle: 'TG 344 - 373', subject: 'Pharmacology', passMark: 50,
  } as unknown as QuizResult;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toSvg(pages: ReturnType<typeof layoutMasterReport>['pages']): string {
  return pages.map(p => {
    const body = p.ops.map(op => {
      switch (op.t) {
        case 'rect':
          return `<rect x="${op.x.toFixed(2)}" y="${op.y.toFixed(2)}" width="${op.w.toFixed(2)}" height="${op.h.toFixed(2)}" rx="${op.r ?? 0}" fill="${op.fill ?? 'none'}"${op.opacity !== undefined ? ` fill-opacity="${op.opacity}"` : ''}${op.stroke ? ` stroke="${op.stroke}" stroke-width="${op.sw ?? 0.5}"` : ''}/>`;
        case 'circle':
          return `<circle cx="${op.x.toFixed(2)}" cy="${op.y.toFixed(2)}" r="${op.r.toFixed(2)}" fill="${op.fill ?? 'none'}"${op.opacity !== undefined ? ` fill-opacity="${op.opacity}"` : ''}${op.stroke ? ` stroke="${op.stroke}" stroke-width="${op.sw ?? 0.5}"` : ''}/>`;
        case 'line':
          return `<line x1="${op.x1.toFixed(2)}" y1="${op.y1.toFixed(2)}" x2="${op.x2.toFixed(2)}" y2="${op.y2.toFixed(2)}" stroke="${op.color}" stroke-width="${op.w}"${op.dash ? ` stroke-dasharray="${op.dash.join(' ')}"` : ''}/>`;
        default:
          return `<text x="${op.x.toFixed(2)}" y="${op.y.toFixed(2)}" font-size="${op.size}" fill="${op.color}"${op.opacity !== undefined ? ` fill-opacity="${op.opacity}"` : ''} font-weight="${op.bold ? 700 : 400}" font-family="Inter, sans-serif">${esc(op.text)}</text>`;
      }
    }).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}"><rect width="${p.width}" height="${p.height}" fill="#EEF1F6"/><rect x="0" y="0" width="${p.width}" height="${p.height}" fill="#fff"/>\n${body}\n</svg>`;
  }).join('\n');
}

const result = makeResult(30);
const doc = buildQuestionDoc([result], {
  kind: 'all', order: 'original', difficulty: 'all',
  rationale: { showBook: true, showAi: true },
  rationaleCache: Object.fromEntries(QUESTIONS.map((q, i) => [q, AI[i % AI.length]])),
  scope: 'quiz',
});
const style = styleFor('all', { columns: 2, fontSize: 'md', paper: 'a4', brand: 'R.J QUIZ', showUserAnswer: true });
const fonts = await createReportFonts([doc.title, ...(doc.items ?? []).flatMap(i => [i.question, ...i.options, i.book ?? '', i.ai ?? ''])], nodeFontSource);
const report = layoutMasterReport(doc, style, fonts.set);
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/master-preview.svg', toSvg(report.pages));
console.log('pages:', report.pages.length, 'ops:', report.pages.reduce((a, p) => a + p.ops.length, 0));
