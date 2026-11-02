import { QuizResult } from '../types/quiz';

export interface MistakePattern {
  id: string;
  title: string;
  description: string;
  frequency: number; // how many times this pattern occurred
  icon: string;
  severity: 'high' | 'medium' | 'low';
  tip: string;
}

/**
 * Analyzes quiz history to detect common mistake patterns.
 * Returns up to 5 most significant patterns.
 */
export function detectMistakePatterns(history: QuizResult[]): MistakePattern[] {
  if (history.length < 2) return [];

  const patterns: MistakePattern[] = [];
  let totalWrong = 0;
  let totalQuestions = 0;

  // Track various patterns
  const wrongBySubject = new Map<string, number>();
  const totalBySubject = new Map<string, number>();
  let longestOptionPicks = 0;
  let longestOptionTotal = 0;
  let secondLongestPicks = 0;
  let secondLongestTotal = 0;
  let lastOptionPicks = 0;
  let lastOptionTotal = 0;
  let changedToWrong = 0; // placeholder for rushed answers
  let hardWrong = 0;
  let hardTotal = 0;
  let easyWrong = 0;
  let easyTotal = 0;
  let skippedCount = 0;
  let wrongOnLongQuestions = 0;
  let totalLongQuestions = 0;
  let firstHalfWrong = 0;
  let secondHalfWrong = 0;
  let firstHalfTotal = 0;
  let secondHalfTotal = 0;
  let quickAnswerWrong = 0;
  let quickAnswerTotal = 0;

  history.filter(r => r.quizData?.length > 0).forEach(r => {
    const subj = r.subject || 'General';
    r.quizData.forEach((q, i) => {
      totalQuestions++;
      const ua = r.userAnswers[i];
      const isWrong = ua !== null && ua !== q.correctAnswer;
      const isSkipped = ua === null;

      // Subject tracking
      totalBySubject.set(subj, (totalBySubject.get(subj) || 0) + 1);
      if (isWrong) {
        totalWrong++;
        wrongBySubject.set(subj, (wrongBySubject.get(subj) || 0) + 1);
      }
      if (isSkipped) skippedCount++;

      // Difficulty tracking
      if (q.difficulty === 'hard') { hardTotal++; if (isWrong) hardWrong++; }
      if (q.difficulty === 'easy') { easyTotal++; if (isWrong) easyWrong++; }

      // Option position bias: longest option
      if (isWrong && ua) {
        const opts = q.shuffledOpts || q.options;
        const sorted = [...opts].sort((a, b) => b.length - a.length);
        longestOptionTotal++;
        if (ua === sorted[0]) longestOptionPicks++;

        // Second-longest bias
        secondLongestTotal++;
        if (sorted.length >= 2 && ua === sorted[1]) secondLongestPicks++;

        // Last option bias
        lastOptionTotal++;
        if (ua === opts[opts.length - 1]) lastOptionPicks++;
      }

      // Long question text (>100 chars) mistakes
      if (q.question.length > 100) {
        totalLongQuestions++;
        if (isWrong) wrongOnLongQuestions++;
      }

      // First half vs second half fatigue
      const mid = Math.floor(r.quizData.length / 2);
      if (i < mid) { firstHalfTotal++; if (isWrong) firstHalfWrong++; }
      else { secondHalfTotal++; if (isWrong) secondHalfWrong++; }

      // Quick answer detection (using timing data if available)
      if (r.questionTimings && r.questionTimings[i] !== undefined) {
        const time = r.questionTimings[i];
        if (time < 5 && time > 0) { // less than 5 seconds
          quickAnswerTotal++;
          if (isWrong) quickAnswerWrong++;
        }
      }
    });
  });

  if (totalWrong === 0) return [];

  // Pattern 1: Longest option bias
  if (longestOptionTotal >= 5) {
    const rate = longestOptionPicks / longestOptionTotal;
    if (rate > 0.35) {
      patterns.push({
        id: 'longest-option',
        title: 'Longest Option Bias',
        description: `You pick the longest answer option ${Math.round(rate * 100)}% of the time when wrong. This suggests guessing by length.`,
        frequency: longestOptionPicks,
        icon: '📏',
        severity: rate > 0.5 ? 'high' : 'medium',
        tip: 'Read all options carefully before choosing. The longest answer isn\'t always correct.',
      });
    }
  }

  // Pattern 2: Subject weakness
  const weakSubjects: string[] = [];
  wrongBySubject.forEach((wrong, subj) => {
    const total = totalBySubject.get(subj) || 1;
    if (total >= 5 && wrong / total > 0.5) {
      weakSubjects.push(`${subj} (${Math.round((wrong / total) * 100)}% wrong)`);
    }
  });
  if (weakSubjects.length > 0) {
    patterns.push({
      id: 'weak-subjects',
      title: 'Weak Subject Areas',
      description: `Consistently struggling with: ${weakSubjects.slice(0, 3).join(', ')}`,
      frequency: weakSubjects.length,
      icon: '📚',
      severity: 'high',
      tip: 'Focus extra study time on these subjects. Try smaller, targeted quizzes.',
    });
  }

  // Pattern 3: Easy question mistakes
  if (easyTotal >= 5 && easyWrong / easyTotal > 0.2) {
    patterns.push({
      id: 'easy-mistakes',
      title: 'Careless on Easy Questions',
      description: `Getting ${Math.round((easyWrong / easyTotal) * 100)}% of easy questions wrong — likely rushing through them.`,
      frequency: easyWrong,
      icon: '⚡',
      severity: 'medium',
      tip: 'Don\'t underestimate easy questions. Read carefully even when it seems obvious.',
    });
  }

  // Pattern 4: Quiz fatigue (more mistakes in second half)
  if (firstHalfTotal >= 5 && secondHalfTotal >= 5) {
    const firstRate = firstHalfWrong / firstHalfTotal;
    const secondRate = secondHalfWrong / secondHalfTotal;
    if (secondRate > firstRate * 1.4 && secondRate > 0.3) {
      patterns.push({
        id: 'fatigue',
        title: 'End-of-Quiz Fatigue',
        description: `Error rate jumps from ${Math.round(firstRate * 100)}% to ${Math.round(secondRate * 100)}% in the second half of quizzes.`,
        frequency: secondHalfWrong - Math.round(firstRate * secondHalfTotal),
        icon: '😴',
        severity: secondRate > firstRate * 2 ? 'high' : 'medium',
        tip: 'Take a brief pause mid-quiz. Consider shorter quiz sessions to maintain focus.',
      });
    }
  }

  // Pattern 5: Rushing (quick wrong answers)
  if (quickAnswerTotal >= 3 && quickAnswerWrong / quickAnswerTotal > 0.6) {
    patterns.push({
      id: 'rushing',
      title: 'Rushing Through Questions',
      description: `${Math.round((quickAnswerWrong / quickAnswerTotal) * 100)}% wrong when answering in under 5 seconds.`,
      frequency: quickAnswerWrong,
      icon: '🏃',
      severity: 'medium',
      tip: 'Slow down! Spend at least 10-15 seconds reading each question thoroughly.',
    });
  }

  // Pattern 6: High skip rate
  if (totalQuestions >= 10 && skippedCount / totalQuestions > 0.15) {
    patterns.push({
      id: 'high-skip',
      title: 'High Skip Rate',
      description: `Skipping ${Math.round((skippedCount / totalQuestions) * 100)}% of questions. You might know more than you think!`,
      frequency: skippedCount,
      icon: '⏭️',
      severity: skippedCount / totalQuestions > 0.3 ? 'high' : 'low',
      tip: 'Try eliminating wrong options first. Even educated guesses are better than skipping.',
    });
  }

  // Pattern 7: Struggling with complex questions
  if (totalLongQuestions >= 5 && wrongOnLongQuestions / totalLongQuestions > 0.5) {
    patterns.push({
      id: 'complex-questions',
      title: 'Complex Question Struggle',
      description: `Getting ${Math.round((wrongOnLongQuestions / totalLongQuestions) * 100)}% of detailed questions wrong.`,
      frequency: wrongOnLongQuestions,
      icon: '🧩',
      severity: 'medium',
      tip: 'Break long questions into parts. Identify the key ask before looking at options.',
    });
  }

  // Sort by severity then frequency
  const sevOrder = { high: 0, medium: 1, low: 2 };
  return patterns
    .sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.frequency - a.frequency)
    .slice(0, 5);
}
