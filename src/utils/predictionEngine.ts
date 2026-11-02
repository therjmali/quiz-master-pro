import { QuizResult } from '../types/quiz';

export interface SubjectPrediction {
  subject: string;
  predicted: number; // 0-100
  trend: number;     // positive = improving, negative = declining
  dataPoints: number;
  needsAttention: boolean;
}

export interface ExamReadiness {
  overallPredicted: number; // 0-100
  confidence: 'low' | 'medium' | 'high';
  subjects: SubjectPrediction[];
  totalQuizzesUsed: number;
  suggestion: string;
}

/**
 * Calculate weighted moving average — more recent quizzes get higher weight.
 */
export function calculateMovingAverage(history: QuizResult[], windowSize = 10): number {
  if (!history.length) return 0;
  const recent = history.slice(0, Math.min(windowSize, history.length));
  let weightedSum = 0;
  let totalWeight = 0;
  recent.forEach((r, i) => {
    const weight = recent.length - i; // Most recent = highest weight
    weightedSum += r.percentage * weight;
    totalWeight += weight;
  });
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/**
 * For a given subject, compute accuracy over time and project a linear trend.
 */
export function subjectTrendForecast(history: QuizResult[], subject: string): SubjectPrediction {
  const relevant = history.filter(r => r.subject?.toLowerCase() === subject.toLowerCase());

  if (relevant.length === 0) {
    return { subject, predicted: 50, trend: 0, dataPoints: 0, needsAttention: false };
  }

  // Compute per-quiz accuracy for this subject
  const dataPoints = relevant.map((r, i) => ({
    x: i,
    y: r.accuracy,
  }));

  // Simple linear regression
  const n = dataPoints.length;
  const sumX = dataPoints.reduce((s, d) => s + d.x, 0);
  const sumY = dataPoints.reduce((s, d) => s + d.y, 0);
  const sumXY = dataPoints.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = dataPoints.reduce((s, d) => s + d.x * d.x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  let slope = 0;
  let intercept = sumY / n;

  if (denominator !== 0 && n >= 2) {
    slope = (n * sumXY - sumX * sumY) / denominator;
    intercept = (sumY - slope * sumX) / n;
  }

  // Project one step forward
  const predicted = Math.max(0, Math.min(100, Math.round(intercept + slope * n)));
  const trend = Math.round(slope * 10) / 10; // trend per quiz

  return {
    subject,
    predicted,
    trend,
    dataPoints: n,
    needsAttention: predicted < 60 || trend < -2,
  };
}

/**
 * Compute overall exam readiness prediction from history.
 */
export function computeExamReadiness(history: QuizResult[]): ExamReadiness | null {
  if (history.length < 2) return null;

  // Sort by most recent first
  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);

  const overallPredicted = calculateMovingAverage(sorted, 10);

  // Determine confidence based on data volume and consistency
  const variance = sorted.slice(0, 10).reduce((sum, r) => {
    return sum + Math.pow(r.percentage - overallPredicted, 2);
  }, 0) / Math.min(sorted.length, 10);
  const stdDev = Math.sqrt(variance);

  let confidence: 'low' | 'medium' | 'high';
  if (sorted.length >= 10 && stdDev < 15) confidence = 'high';
  else if (sorted.length >= 5) confidence = 'medium';
  else confidence = 'low';

  // Subject-wise predictions
  const subjectSet = new Set<string>();
  sorted.forEach(r => { if (r.subject?.trim()) subjectSet.add(r.subject.trim()); });

  const subjects = Array.from(subjectSet)
    .map(s => subjectTrendForecast(sorted, s))
    .filter(s => s.dataPoints >= 1)
    .sort((a, b) => a.predicted - b.predicted);

  // Generate suggestion
  const weakest = subjects.find(s => s.needsAttention);
  let suggestion: string;
  if (weakest) {
    const gap = 70 - weakest.predicted;
    suggestion = `Focus on ${weakest.subject} — practice for 20-30 min daily to improve by ~${Math.max(5, gap)}%.`;
  } else if (overallPredicted >= 80) {
    suggestion = 'Great performance! Keep reviewing to maintain your edge.';
  } else if (overallPredicted >= 60) {
    suggestion = 'Solid progress! Target your weaker areas to push above 80%.';
  } else {
    suggestion = 'Build consistency — try taking a short quiz every day to improve retention.';
  }

  return {
    overallPredicted,
    confidence,
    subjects,
    totalQuizzesUsed: Math.min(sorted.length, 10),
    suggestion,
  };
}
