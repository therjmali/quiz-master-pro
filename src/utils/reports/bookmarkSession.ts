/**
 * Bookmarked questions as a report session, so the bookmark exam paper uses the same offline engine,
 * black & white exam format and preview (answers popup, layout, levels) as every other paper.
 */
import type { QuizQuestion, QuizResult } from '../../types/quiz';
import type { ReportSession } from '../../components/reports/reportSession';

interface BookmarkLike { question: string; options: string[]; correctAnswer: string; rationale?: string; aiRationale?: string; difficulty?: string; questionType?: string; quizTitle?: string; subject?: string }

const level = (d?: string): QuizQuestion['difficulty'] => (d === 'easy' || d === 'hard' ? d : 'medium');

export function bookmarksToSession(items: BookmarkLike[], title?: string): ReportSession {
  const quizData: QuizQuestion[] = items.map(b => ({
    question: b.question, options: b.options, correctAnswer: b.correctAnswer, difficulty: level(b.difficulty),
    rationale: b.rationale, questionType: b.questionType,
  }));
  const result: QuizResult = {
    id: 'bookmarks', quizTitle: title?.trim() || 'Bookmarked questions', subject: items[0]?.subject || 'Bookmarks',
    timestamp: Date.now(), totalQuestions: quizData.length, quizData, userAnswers: quizData.map(() => null), timeTaken: 0, score: 0,
    correct: 0, wrong: 0, skipped: quizData.length, gain: 0, penalty: 0, netScore: 0, maxScore: quizData.length, percentage: 0, accuracy: 0,
  };
  const rationaleCache: Record<string, string> = {};
  for (const b of items) if (b.aiRationale?.trim()) rationaleCache[b.question] = b.aiRationale;
  return {
    scope: 'quiz', results: [result], rationaleCache, kind: 'exam', order: 'original', difficulty: 'all',
    rationale: { showBook: true, showAi: false },
  };
}

