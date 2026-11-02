import { QuizQuestion } from '../types/quiz';

export interface CSVParseResult {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface ColumnMapping {
  question: number;
  optionA: number;
  optionB: number;
  optionC: number;
  optionD: number;
  correctAnswer: number;
  explanation: number;
  difficulty: number;
  subject: number;
  imageUrl: number;
}

export interface RowError {
  row: number;
  errors: string[];
}

/**
 * Parse CSV text into headers and rows.
 * Handles quoted fields with commas inside.
 */
export function parseCSVText(text: string): CSVParseResult {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [], totalRows: 0 };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(parseLine);
  return { headers, rows, totalRows: rows.length };
}

/**
 * Auto-detect column mapping from headers.
 */
export function autoMapColumns(headers: string[]): Partial<ColumnMapping> {
  const map: Partial<ColumnMapping> = {
    question: -1, optionA: -1, optionB: -1, optionC: -1, optionD: -1,
    correctAnswer: -1, explanation: -1, difficulty: -1, subject: -1, imageUrl: -1,
  };

  const lower = headers.map(h => h.toLowerCase().trim());

  const find = (patterns: string[]): number =>
    lower.findIndex(h => patterns.some(p => h.includes(p)));

  map.question = find(['question', 'q.', 'stem', 'prompt']);
  map.optionA = find(['option a', 'option_a', 'choice a', 'a)', 'opt a', 'option 1']);
  map.optionB = find(['option b', 'option_b', 'choice b', 'b)', 'opt b', 'option 2']);
  map.optionC = find(['option c', 'option_c', 'choice c', 'c)', 'opt c', 'option 3']);
  map.optionD = find(['option d', 'option_d', 'choice d', 'd)', 'opt d', 'option 4']);
  map.correctAnswer = find(['correct', 'answer', 'key', 'right answer']);
  map.explanation = find(['explanation', 'rationale', 'reason', 'solution']);
  map.difficulty = find(['difficulty', 'level', 'diff']);
  map.subject = find(['subject', 'topic', 'category', 'chapter']);
  map.imageUrl = find(['image', 'imageurl', 'image_url', 'image url', 'img', 'picture']);

  // If no option columns found, try sequential after question
  if (map.question !== -1 && map.optionA === -1) {
    const qi = map.question;
    if (qi + 1 < headers.length) map.optionA = qi + 1;
    if (qi + 2 < headers.length) map.optionB = qi + 2;
    if (qi + 3 < headers.length) map.optionC = qi + 3;
    if (qi + 4 < headers.length) map.optionD = qi + 4;
  }

  return map;
}

/**
 * Validate rows and convert to QuizQuestion[].
 */
export function validateAndConvert(
  rows: string[][],
  mapping: ColumnMapping
): { questions: QuizQuestion[]; errors: RowError[] } {
  const questions: QuizQuestion[] = [];
  const errors: RowError[] = [];

  const get = (row: string[], idx: number): string =>
    idx >= 0 && idx < row.length ? (row[idx] || '').trim() : '';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowErrors: string[] = [];

    const question = get(row, mapping.question);
    if (!question) { rowErrors.push('Missing question text'); }

    const opts: string[] = [];
    const optA = get(row, mapping.optionA);
    const optB = get(row, mapping.optionB);
    const optC = get(row, mapping.optionC);
    const optD = get(row, mapping.optionD);
    if (optA) opts.push(optA);
    if (optB) opts.push(optB);
    if (optC) opts.push(optC);
    if (optD) opts.push(optD);

    if (opts.length < 2) { rowErrors.push('Need at least 2 options'); }

    const rawAnswer = get(row, mapping.correctAnswer);
    let correctAnswer = '';
    if (!rawAnswer) {
      rowErrors.push('Missing correct answer');
    } else {
      // Check if it's a letter (A/B/C/D)
      const letter = rawAnswer.toUpperCase().replace(/[^A-D]/g, '');
      if (letter.length === 1) {
        const idx = letter.charCodeAt(0) - 65;
        correctAnswer = opts[idx] || rawAnswer;
      } else {
        // Check if it matches any option text
        const match = opts.find(o => o.toLowerCase() === rawAnswer.toLowerCase());
        correctAnswer = match || rawAnswer;
      }
      if (correctAnswer && opts.length > 0 && !opts.includes(correctAnswer)) {
        // Try partial match
        const partial = opts.find(o => o.toLowerCase().includes(rawAnswer.toLowerCase()));
        if (partial) correctAnswer = partial;
        else rowErrors.push(`Correct answer "${rawAnswer}" doesn't match any option`);
      }
    }

    const explanation = get(row, mapping.explanation);
    const imgUrl = get(row, mapping.imageUrl);
    const diffRaw = get(row, mapping.difficulty).toLowerCase();
    const difficulty: 'easy' | 'medium' | 'hard' =
      diffRaw.startsWith('easy') || diffRaw === 'e' ? 'easy' :
      diffRaw.startsWith('hard') || diffRaw === 'h' ? 'hard' : 'medium';

    if (rowErrors.length > 0) {
      errors.push({ row: i + 2, errors: rowErrors }); // +2 for 1-indexed + header
    } else {
      questions.push({
        question,
        options: opts,
        correctAnswer,
        difficulty,
        rationale: explanation || undefined,
        imageUrl: (imgUrl && /^https?:\/\//i.test(imgUrl)) ? imgUrl : undefined,
      });
    }
  }

  return { questions, errors };
}
