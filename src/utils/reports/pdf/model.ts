/** Turns quiz results + the user's report settings into a ReportDoc for the layout engine. */
import type { QuizResult, QuizQuestion, RationalePrefs, ReportOrder } from '../../../types/quiz';
import { DEFAULT_STYLE, type AnswerMode, type ReportDoc, type ReportItem, type ReportKind, type ReportStyle, type ReportSummary } from './types';
import { markdownToBlocks } from './markdown';

export type Difficulty = 'all' | 'easy' | 'medium' | 'hard';

export interface BuildOptions {
  kind: ReportKind;
  order: ReportOrder;
  difficulty: Difficulty;
  rationale: RationalePrefs;
  rationaleCache: Record<string, string>;
  scope: 'quiz' | 'profile';
  /** Exam paper: print the answers after each question instead of in a key at the end. */
  examInlineAnswers?: boolean;
  now?: Date;
}

export const KIND_TITLES: Record<ReportKind, string> = {
  all: 'Full Report', correct: 'Correct Answers', wrong: 'Mistakes Report', skipped: 'Skipped Questions',
  notes: 'Study Notes', exam: 'Exam Paper', revision: 'Revision Sheet', custom: 'Report',
};
export const KIND_FILE: Record<ReportKind, string> = {
  all: 'Report', correct: 'Correct', wrong: 'Mistakes', skipped: 'Skipped', notes: 'StudyNotes', exam: 'ExamPaper', revision: 'Revision', custom: 'Report',
};

const clean = (s: string) => String(s ?? '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();

export function reportFilename(kind: ReportKind, results: QuizResult[], ext: string, now = new Date()): string {
  const subject = clean(results[0]?.subject || '').replace(/ /g, '-');
  const title = results.length === 1 ? clean(results[0]?.quizTitle || '').replace(/ /g, '-').slice(0, 40) : 'Profile';
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return ['RJQuiz', KIND_FILE[kind], title, subject, d].filter(Boolean).join('_') + '.' + ext;
}

/** How a kind should look by default (the user can override answers / user-answer in the preview). */
export function styleFor(kind: ReportKind, base: Partial<ReportStyle> = {}, examInline = false): ReportStyle {
  const s: ReportStyle = { ...DEFAULT_STYLE, ...base };
  const answers: AnswerMode = kind === 'exam' ? (examInline ? 'inline' : 'key') : 'inline';
  // An exam paper keeps the classic two-column paper look; every other report gets the premium dashboard.
  const template = base.template ?? (kind === 'exam' ? 'classic' : 'master');
  return { ...s, template, answers, showUserAnswer: kind === 'all' || kind === 'wrong' ? s.showUserAnswer : false };
}

const correctOf = (q: QuizQuestion): string[] => (q.correctAnswers && q.correctAnswers.length ? q.correctAnswers : [q.correctAnswer]).filter(Boolean);

function statusOf(q: QuizQuestion, ua: string | null): ReportItem['status'] {
  if (ua === null || ua === undefined || ua === '') return 'skipped';
  return correctOf(q).some(c => c.trim() === String(ua).trim()) ? 'correct' : 'wrong';
}

export function buildQuestionDoc(results: QuizResult[], o: BuildOptions): ReportDoc {
  const all: ReportItem[] = [];
  let n = 0;
  for (const r of results) {
    const pairs = (r.quizData || []).map((q, idx) => ({ q, ua: (r.userAnswers?.[idx] ?? null) as string | null, idx }));
    if (o.order === 'original') pairs.sort((a, b) => ((a.q.originalIndex ?? a.idx) - (b.q.originalIndex ?? b.idx)));
    for (const { q, ua } of pairs) {
      if (o.difficulty !== 'all' && (q.difficulty || 'medium') !== o.difficulty) continue;
      const opts = o.order === 'original' ? q.options : (q.shuffledOpts && q.shuffledOpts.length ? q.shuffledOpts : q.options);
      all.push({
        n: ++n, question: q.question, options: (opts || []).map(String), correct: correctOf(q), user: ua, status: statusOf(q, ua),
        difficulty: q.difficulty, source: r.quizTitle,
        book: o.rationale.showBook ? (q.rationale || '').trim() : '',
        ai: o.rationale.showAi ? (o.rationaleCache[q.question] || '').trim() : '',
      });
    }
  }
  const items = (o.kind === 'correct' || o.kind === 'wrong' || o.kind === 'skipped') ? all.filter(i => i.status === o.kind) : all;
  items.forEach((it, i) => { it.n = i + 1; });

  const c = all.filter(i => i.status === 'correct').length, w = all.filter(i => i.status === 'wrong').length, s = all.filter(i => i.status === 'skipped').length;
  const summary: ReportSummary = {
    quizzes: results.length, questions: all.length, correct: c, wrong: w, skipped: s,
    accuracy: c + w > 0 ? Math.round((c / (c + w)) * 100) : 0,
    scorePct: results.length === 1 && Number.isFinite(results[0].percentage) ? Math.round(results[0].percentage) : undefined,
    timeSec: results.reduce((a, r) => a + (r.timeTaken || 0), 0),
  };
  const now = o.now ?? new Date();
  const base = o.scope === 'quiz' ? (results[0]?.quizTitle || 'Quiz') : 'Profile Analysis';
  const subjects = Array.from(new Set(results.map(r => r.subject).filter(Boolean)));
  // Book/unit identity for the report header ("TG 344 - 373", "Book order"): used by the master template.
  const titles = Array.from(new Set(results.map(r => (r.quizTitle || '').trim()).filter(Boolean)));
  const correct = all.filter(i => i.status === 'correct').length;
  const wrong = all.filter(i => i.status === 'wrong').length;
  const total = all.length;
  const meta = [
    now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    subjects.length ? subjects.slice(0, 3).join(', ') : '',
    `${results.length} quiz${results.length === 1 ? '' : 'zes'}`,
    o.difficulty !== 'all' ? `${o.difficulty[0].toUpperCase()}${o.difficulty.slice(1)} only` : '',
    o.order === 'original' ? 'Book order' : 'Attempt order',
    summary.timeSec ? `${Math.floor(summary.timeSec / 60)} min ${summary.timeSec % 60}s` : '',
  ].filter(Boolean);
  const docSummary: ReportSummary = {
    ...summary,
    shown: total,
    maxScore: total > 0 ? Math.round((correct / total) * 100) : 0,
    scope: o.scope,
    subjects: subjects.filter((x): x is string => Boolean(x)),
    quizzesDetail: results.map(r => ({
      title: (r.quizTitle || 'Quiz').trim(),
      subject: r.subject || '',
      percentage: Number.isFinite(r.percentage) ? Math.round(r.percentage) : 0,
      questions: r.totalQuestions || 0,
      timestamp: r.timestamp,
    })),
    bookRange: titles.length === 1 ? titles[0] : undefined,
  };
  return { kind: o.kind, title: `${KIND_TITLES[o.kind]} — ${base}`, subtitle: undefined, meta, summary: docSummary, items };
}

/** Revision sheet / generic markdown document. */
export function buildMarkdownDoc(kind: ReportKind, title: string, markdown: string, meta: string[] = []): ReportDoc {
  return { kind, title, meta, blocks: markdownToBlocks(markdown) };
}

/** Anything the legacy HTML builders produce, as a document (fallback for screens that still build HTML). */
export function buildBlocksDoc(kind: ReportKind, title: string, blocks: ReportDoc['blocks'], meta: string[] = []): ReportDoc {
  return { kind, title, meta, blocks };
}
