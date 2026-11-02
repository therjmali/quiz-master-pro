import { QuizQuestion } from '../types/quiz';
import { cleanExplanationText } from '../lib/rationaleFormat';

/**
 * MCQ text format — the ONE format this app reads and writes.
 *
 *   Q1(E). Question text
 *
 *   (a) Option 1
 *
 *   (b) Option 2
 *
 *   (c) Option 3
 *
 *   (d) Option 4
 *
 *   Answer - (b) Option 2
 *
 *   • Explanation of why the answer is correct.
 *
 *   • Second point, only if needed.
 *
 * Rules
 *  1. Question line: Q + number + (E|M|H) + "." + one space + question.
 *  2. Exactly four options (a)–(d), lowercase, in order, one per line.
 *  3. Exactly one correct answer (options must be distinct).
 *  4. Answer line: "Answer - (letter) full option text" — text must match that option.
 *  5. Explanation: 1 or 2 bullets, "• " only, one per line.
 *  6. One blank line between blocks is recommended; blank lines, CRLF, tabs and
 *     trailing spaces are tolerated and ignored.
 *  Anything else is not counted.
 */

export const MCQ_SAMPLE = `Q1(E). Which organelle is known as the powerhouse of the cell?

(a) Nucleus

(b) Mitochondria

(c) Ribosome

(d) Golgi apparatus

Answer - (b) Mitochondria

• Mitochondria produce most of the cell's ATP through oxidative phosphorylation.

• They have their own circular DNA, inherited from the mother.`;

export const MCQ_RULES: { label: string; example: string }[] = [
  { label: 'Question', example: 'Q1(E). Question text — difficulty E, M or H' },
  { label: 'Options', example: '(a) (b) (c) (d) — exactly four, lowercase, one per line' },
  { label: 'Answer', example: 'Answer - (b) full option text' },
  { label: 'Explanation', example: '1 or 2 bullets, each starting with • on its own line' },
  { label: 'Spacing', example: 'One blank line between every line and between questions' },
];

export interface McqIssue {
  /** Question label as written, e.g. "Q4" */
  label: string;
  /** 1-based line number where the question starts */
  line: number;
  reason: string;
}

export interface McqParseResult {
  questions: QuizQuestion[];
  issues: McqIssue[];
  /** Questions whose text repeats an earlier one, e.g. "Q7 repeats Q2" */
  duplicates: string[];
}

const LETTERS = ['a', 'b', 'c', 'd'] as const;
const DIFF: Record<string, QuizQuestion['difficulty']> = { E: 'easy', M: 'medium', H: 'hard' };

const Q_LINE = /^Q(\d+)\(([EMH])\)\. (\S.*)$/;
const Q_ATTEMPT = /^Q\s*[.:]?\s*\d+/i;
const OPT_LINE = /^\(([a-d])\) (\S.*)$/;
const ANS_LINE = /^Answer - \(([a-d])\) (\S.*)$/;
const BULLET_LINE = /^• (\S.*)$/;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();

/** Clean one physical line: unify invisible spacing, trim the edges. */
const cleanLine = (l: string) => l.replace(/[\u00A0\u2007\u202F\t]/g, ' ').replace(/ {2,}/g, ' ').trim();

function parseBlock(lines: string[], startIdx: number): { q?: QuizQuestion; reason?: string } {
  // lines[startIdx] is the question line; the block ends before the next Q attempt.
  const rows: { text: string; idx: number }[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    if (i > startIdx && Q_ATTEMPT.test(lines[i])) break;
    if (lines[i]) rows.push({ text: lines[i], idx: i });
  }

  const qm = rows[0].text.match(Q_LINE);
  if (!qm) return { reason: 'question line must look like "Q1(E). Question text"' };

  const options: string[] = [];
  for (let o = 0; o < 4; o++) {
    const row = rows[1 + o];
    const om = row?.text.match(OPT_LINE);
    if (!om || om[1] !== LETTERS[o]) return { reason: `missing option (${LETTERS[o]})` };
    options.push(om[2].trim());
  }
  if (new Set(options.map(norm)).size !== 4) return { reason: 'options must be four different answers' };

  const am = rows[5]?.text.match(ANS_LINE);
  if (!am) return { reason: 'missing answer line "Answer - (x) option text"' };
  const ansIdx = LETTERS.indexOf(am[1] as typeof LETTERS[number]);
  if (norm(am[2]) !== norm(options[ansIdx])) return { reason: `answer letter (${am[1]}) does not match its option text` };

  const bullets: string[] = [];
  for (const row of rows.slice(6)) {
    const bm = row.text.match(BULLET_LINE);
    if (!bm) return { reason: 'explanation lines must start with "• "' };
    const clean = cleanExplanationText(bm[1]);
    if (clean) bullets.push(clean);
  }
  if (bullets.length < 1) return { reason: 'missing explanation bullet (•)' };
  if (bullets.length > 2) return { reason: 'more than 2 explanation bullets' };

  return {
    q: {
      question: qm[3].trim(),
      options,
      correctAnswer: options[ansIdx],
      difficulty: DIFF[qm[2]],
      rationale: bullets.join('\n'),
      rationaleBullets: bullets,
    },
  };
}

/** Parse pasted text. Only questions in the exact format are returned; everything else is reported. */
export function parseMcqText(text: string): McqParseResult {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(cleanLine);
  const questions: QuizQuestion[] = [];
  const issues: McqIssue[] = [];
  const duplicates: string[] = [];
  const seen = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    if (!Q_ATTEMPT.test(lines[i])) continue;
    const label = 'Q' + (lines[i].match(/\d+/)?.[0] || '');
    const { q, reason } = parseBlock(lines, i);
    if (q) {
      const key = norm(q.question);
      const prev = seen.get(key);
      if (prev) duplicates.push(`${label} repeats ${prev}`); else seen.set(key, label);
      questions.push(q);
    } else issues.push({ label, line: i + 1, reason: reason || 'Not in the required format' });
  }
  return { questions, issues, duplicates };
}

/** Parse pasted MCQs. Throws when nothing in the required format is found. */
export function localOfflineParser(text: string): QuizQuestion[] {
  const { questions, issues } = parseMcqText(text);
  if (questions.length === 0) {
    const first = issues[0];
    throw new Error(first
      ? `${first.label}: ${first.reason}.`
      : 'No questions found. Use the format: Q1(E). Question · (a)–(d) · Answer - (b) text · • explanation');
  }
  return questions;
}

/** True when the text contains at least one line that starts a question in the required format. */
export function looksLikeMCQ(text: string): boolean {
  return String(text || '').split(/\r?\n/).some(l => Q_LINE.test(cleanLine(l)));
}

/** Serialize questions back into the exact same format (used by export / copy). */
export function toMcqText(questions: QuizQuestion[]): string {
  const code = (d?: string) => (d === 'easy' ? 'E' : d === 'hard' ? 'H' : 'M');
  return questions.map((q, i) => {
    const opts = q.options.slice(0, 4);
    const ansIdx = Math.max(0, opts.findIndex(o => o === q.correctAnswer));
    const bullets = (q.rationale || '')
      .split('\n')
      .map(l => cleanExplanationText(l))
      .filter(Boolean)
      .slice(0, 2);
    const blocks = [
      `Q${i + 1}(${code(q.difficulty)}). ${q.question.replace(/\s*\n\s*/g, ' ').trim()}`,
      ...opts.map((o, k) => `(${LETTERS[k]}) ${o}`),
      `Answer - (${LETTERS[ansIdx]}) ${opts[ansIdx] ?? ''}`,
      ...bullets.map(b => `• ${b}`),
    ];
    return blocks.join('\n\n');
  }).join('\n\n');
}

/** Exact text copied by the "Copy Prompt" button — nothing else is ever appended. */
export const COPY_PROMPT_TEXT = `MCQ FORMAT

Q1(E). Question text

(a) Option 1

(b) Option 2

(c) Option 3

(d) Option 4

Answer - (b) Option 2

• Explanation of why the answer is correct.

• Second point, only if needed.

STRUCTURE RULES

1. Question line: Q, the question number, the difficulty tag in brackets, a full stop, one space, then the question. Example: Q12(M). Question text
2. Difficulty tags: E = Easy, M = Moderate, H = Hard.
3. Write exactly four options, (a) to (d), in lowercase, each on its own line.
4. There must be exactly one correct answer.
5. Answer line: Answer - (letter) full option text. The letter and text must match the option listed above.
6. Explanation: 1 or 2 bullets only, after the answer line. Use only the • symbol, with no emojis, dashes or numbering. Add the second bullet only when needed.
7. Start every line at the very left edge, with no leading spaces or tabs. Put each bullet on its own line, and never join two bullets in one line or paragraph.
8. Leave one blank line between every block: question, each option, answer line, each bullet, and between consecutive questions.
9. Order inside every MCQ: question, options (a) to (d), answer, explanation bullets.
10. Number questions in sequence. A new subject or chapter restarts at Q1 unless told to continue. Never repeat a question already given.
11. Give exactly the number of questions requested.
12. Plain text only: no bold, asterisks, headings, tables or code blocks.
13. Give only the MCQs, with no introduction, closing note or commentary.`;
