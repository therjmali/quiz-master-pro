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
  /** Questions actually printed in this report (a filtered report shows fewer than `questions`). */
  shown?: number;
  /** Score if every printed question carried the same mark (percentage of the printed set). */
  maxScore?: number;
  scope?: 'quiz' | 'profile';
  subjects?: string[];
  /** One entry per quiz in the report — the template's summary card lists them. */
  quizzesDetail?: { title: string; subject: string; percentage: number; questions: number; timestamp: number }[];
  /** Book / unit range when the report covers a single quiz (e.g. "TG 344 - 373"). */
  bookRange?: string;
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

export type ReportTemplate = 'classic' | 'master';

export interface ReportStyle {
  /** Visual template: the classic exam-paper format, or the premium "Master" dashboard report. */
  template?: ReportTemplate;
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

export const DEFAULT_STYLE: ReportStyle = { template: 'master', columns: 2, fontSize: 'md', answers: 'inline', showUserAnswer: true, paper: 'a4', brand: 'R.J QUIZ', header: true };

/* ───────── layout output ───────── */
export type Op =
  | { t: 'text'; x: number; y: number; text: string; bold: boolean; size: number; color: string; opacity?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; color: string; dash?: [number, number] }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; r?: number; opacity?: number }
  /** Filled circle — status dots and the summary icons of the master template. */
  | { t: 'circle'; x: number; y: number; r: number; fill?: string; stroke?: string; sw?: number; opacity?: number };

export interface Page { width: number; height: number; number: number; ops: Op[] }
export interface LaidOutReport { pages: Page[]; style: ReportStyle; title: string }
