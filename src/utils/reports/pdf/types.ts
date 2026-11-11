import type { Block } from './markdown';

export type ReportKind = 'all' | 'correct' | 'wrong' | 'skipped' | 'notes' | 'exam' | 'revision' | 'custom';
export type AnswerMode = 'inline' | 'key' | 'none';

export interface ReportItem {
  n: number;
  question: string;
  options: string[];
  /** Correct option texts (one, or several for multi-answer questions). */
  correct: string[];
  user: string | null;
  status: 'correct' | 'wrong' | 'skipped' | 'unknown';
  difficulty?: string;
  book?: string;
  ai?: string;
  /** Where the question came from (quiz title) - shown when a report mixes several quizzes. */
  source?: string;
}

export interface ReportSummary {
  quizzes: number;
  questions: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number;
  scorePct?: number;
  timeSec?: number;
}

export interface ReportDoc {
  kind: ReportKind;
  title: string;
  subtitle?: string;
  meta: string[];
  summary?: ReportSummary;
  items?: ReportItem[];
  blocks?: Block[];
}

export interface ReportStyle {
  columns: 1 | 2;
  fontSize: 'sm' | 'md' | 'lg';
  answers: AnswerMode;
  /** Show "Your answer" (and "Not attempted") lines under each answer. */
  showUserAnswer: boolean;
  paper: 'a4' | 'letter';
  brand: string;
  /** Title band + summary chips on the first page. */
  header: boolean;
}

export const DEFAULT_STYLE: ReportStyle = { columns: 2, fontSize: 'md', answers: 'inline', showUserAnswer: true, paper: 'a4', brand: 'R.J QUIZ', header: true };

/* ───────── layout output ───────── */
export type Op =
  | { t: 'text'; x: number; y: number; text: string; bold: boolean; size: number; color: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; color: string; dash?: [number, number] }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; r?: number };

export interface Page { width: number; height: number; number: number; ops: Op[] }
export interface LaidOutReport { pages: Page[]; style: ReportStyle; title: string }
