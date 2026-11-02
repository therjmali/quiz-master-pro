import { QuizResult, QuizQuestion } from '../types/quiz';

export interface WeakTopic {
  topic: string;
  wrongCount: number;
  totalEncounters: number;
  weaknessScore: number; // 0-100, higher = weaker
  correctCount: number;
  questions: QuizQuestion[]; // all wrong questions for practice
}

/**
 * Extract a "topic" from a question. Uses the quiz subject if available,
 * otherwise attempts keyword extraction from the question text.
 */
export function extractTopic(question: QuizQuestion, quizSubject?: string): string {
  // Use provided subject first
  if (quizSubject?.trim()) return quizSubject.trim();

  // Try to extract from the question text using common patterns
  const text = question.question;

  // "In [Topic], ..." or "Which [Topic] ..." patterns
  const inMatch = text.match(/^(?:In|Regarding|About|Concerning)\s+([A-Z][a-zA-Z\s]{2,25}?)[,.:]/);
  if (inMatch) return inMatch[1].trim();

  // If question starts with "The [X] of [topic]" 
  const theMatch = text.match(/^The\s+\w+\s+of\s+([A-Z][a-zA-Z\s]{2,20})/);
  if (theMatch) return theMatch[1].trim();

  // Difficulty as a rough proxy if nothing else
  return question.difficulty === 'hard' ? 'Advanced' : question.difficulty === 'easy' ? 'Basics' : 'General';
}

/**
 * Analyze quiz history and return weak topics sorted by weakness score.
 */
export function analyzeWeakTopics(history: QuizResult[]): WeakTopic[] {
  const topicMap = new Map<string, { wrong: number; correct: number; total: number; questions: QuizQuestion[] }>();

  for (const result of history) {
    const subject = result.subject?.trim() || '';
    if (!result.quizData?.length) continue;
    result.quizData.forEach((q, i) => {
      const topic = subject || extractTopic(q, subject);
      const ua = result.userAnswers[i];
      const existing = topicMap.get(topic) || { wrong: 0, correct: 0, total: 0, questions: [] };
      existing.total++;

      if (ua === null) {
        // skipped — don't count as wrong or correct
      } else if (ua === q.correctAnswer) {
        existing.correct++;
      } else {
        existing.wrong++;
        // Add to practice questions (dedupe by question text)
        if (!existing.questions.some(eq => eq.question === q.question)) {
          existing.questions.push(q);
        }
      }
      topicMap.set(topic, existing);
    });
  }

  const topics: WeakTopic[] = [];
  for (const [topic, data] of topicMap.entries()) {
    if (data.total < 2) continue; // Need at least 2 encounters
    const attempted = data.correct + data.wrong;
    if (attempted === 0) continue;
    const weaknessScore = Math.round((data.wrong / attempted) * 100);
    if (weaknessScore < 10) continue; // Not really weak
    topics.push({
      topic,
      wrongCount: data.wrong,
      totalEncounters: data.total,
      weaknessScore,
      correctCount: data.correct,
      questions: data.questions,
    });
  }

  return topics.sort((a, b) => b.weaknessScore - a.weaknessScore);
}

/**
 * Get the top N weak topics.
 */
export function getTopWeakTopics(history: QuizResult[], n = 5): WeakTopic[] {
  return analyzeWeakTopics(history).slice(0, n);
}
