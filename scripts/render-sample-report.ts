/**
 * Dev-only: renders a real quiz result (30 questions, mixed statuses, book + AI rationales) through the
 * production report engine and writes every format to `artifacts/` so the design can be inspected and diffed.
 *
 *   node --import tsx scripts/render-sample-report.ts
 *
 * Nothing here ships in the app; it exists so the template can be reviewed without a browser (the PDF writer
 * output is checked separately by tests/reportEngine.test.ts and the HTML is plain, dependency-free markup).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildQuestionDoc, reportFilename, styleFor } from '../src/utils/reports/pdf/model';
import { docToHtml, docToText } from '../src/utils/reports/pdf/formats';
import { docToMasterHtml } from '../src/utils/reports/pdf/masterHtml';
import type { QuizQuestion, QuizResult } from '../src/types/quiz';

const BOOK = [
  'This is a high-yield fact from TG 344. It has appeared in three previous exams, so learn the exact wording.',
  'Refer to the parent drug class: the mechanism is shared by every agent in the group, which is why the side-effect profile is so similar.',
  'Competitive antagonists shift the dose-response curve right without lowering the maximum response; non-competitive ones flatten it.',
  'Remember the mnemonic used in the class: the first letter of each drug spells out the order of potency.',
];
const AI = [
  'Question 12 tested the same concept twice; review the summary table in unit 8 before the next attempt.',
  'You changed your answer on questions like this three times — trust the first reasoned choice.',
];
const OPTIONS = [
  ['A short one', 'Another short', 'Third choice', 'Fourth here'],
  ['A considerably longer option that wraps onto a second line to prove the layout copes', 'Second long option text', 'Third', 'Fourth'],
  ['Alpha', 'Beta', 'Gamma', 'Delta'],
  ['Inhibit the enzyme irreversibly', 'Compete for the receptor site', 'Block the ion channel', 'Reduce absorption'],
];
const QUESTIONS = [
  'Which of the following statements about the mechanism of action is correct according to the standard text?',
  'A 42-year-old patient presents with the classic triad. What is the most likely diagnosis?',
  'Name the single best investigation for confirming the diagnosis.',
  'Which drug is contraindicated in the second trimester?',
  'The most common side effect of this class of drugs is best described as:',
  'What is the half-life of the active metabolite?',
  'Which of the following is NOT a recognised complication?',
  'Choose the correct sequence of the pathway.',
  'The incidence in the general population is closest to:',
  'Which statement about the prognosis is true?',
];

function makeResult(n: number): QuizResult {
  const quizData: QuizQuestion[] = Array.from({ length: n }, (_, i) => ({
    question: QUESTIONS[i % QUESTIONS.length],
    options: OPTIONS[i % OPTIONS.length],
    correctAnswer: OPTIONS[i % OPTIONS.length][i % 2],
    difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard',
    rationale: BOOK[i % BOOK.length],
    rationaleBullets: [BOOK[i % BOOK.length], AI[i % AI.length]],
    originalIndex: i,
  }));
  const userAnswers: (string | null)[] = quizData.map((q, i) => {
    if (i % 7 === 3 || i % 7 === 6) return null; // skipped
    return i % 5 === 4 || i % 5 === 2 ? (q.options[3 - (i % 3)] ?? null) : q.correctAnswer;
  });
  return {
    id: 'sample', totalQuestions: n, quizData, userAnswers,
    correct: userAnswers.filter((a, i) => a && a === quizData[i].correctAnswer).length,
    wrong: userAnswers.filter((a, i) => a && a !== quizData[i].correctAnswer).length,
    skipped: userAnswers.filter(a => !a).length,
    gain: 0, penalty: 0, netScore: 0, maxScore: 30,
    percentage: 64, accuracy: 64,
    score: 240, timeTaken: 2645, difficulty: 'medium', timestamp: Date.UTC(2026, 10, 13, 9, 30),
    quizTitle: 'TG 344 - 373', subject: 'Pharmacology', passMark: 50,
  } as unknown as QuizResult;
}

const result = makeResult(30);
const doc = buildQuestionDoc([result], {
  kind: 'all', order: 'original', difficulty: 'all',
  rationale: { showBook: true, showAi: true }, rationaleCache: {},
});
const style = styleFor('all', { columns: 2, fontSize: 'md', paper: 'a4', brand: 'R.J QUIZ', showUserAnswer: true });

const out = 'artifacts';
mkdirSync(out, { recursive: true });
const base = reportFilename('all', [result], 'html').replace(/\.html$/, '');
writeFileSync(`${out}/report-master.html`, docToMasterHtml(doc, style));
writeFileSync(`${out}/report-site.html`, docToHtml(doc, style));
writeFileSync(`${out}/report-classic.html`, docToHtml(doc, { ...style, template: 'classic' }));
writeFileSync(`${out}/report.txt`, docToText(doc, style));

const words = (docToMasterHtml(doc, style).match(/<article/g) ?? []).length;
console.log(JSON.stringify({ files: base, cards: words, items: doc.items?.length, summary: doc.summary }, null, 2));
