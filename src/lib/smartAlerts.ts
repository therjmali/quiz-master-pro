// ═══════════════════════════════════════════════════════════════
// Smart Alerts Engine for Quiz Master Pro
// Proactive, intelligent study nudges and streak guards
// ═══════════════════════════════════════════════════════════════

import type { TodoItem } from '../hooks/useTodos';
import { getDueCount } from '../utils/spacedRepetition';
import { getExamDates } from '../utils/examDates';

export interface SmartAlert {
  id: string;
  type: 'srs_due' | 'exam_urgent' | 'streak_risk' | 'neglected_subject' | 'overdue_tasks' | 'milestone' | 'daily_target';
  emoji: string;
  title: string;
  subtitle: string;
  priority: 'high' | 'medium' | 'low';
  color: 'destructive' | 'chart-4' | 'primary' | 'secondary' | 'accent';
  actionLabel: string;
  actionTab: string;
  dismissKey: string;
}

interface SmartAlertInput {
  todos: TodoItem[];
  streakDays: number;
  todayQuestionsDone: number;
  targetQuestions?: number;
  totalQuestionsSolved?: number;
}

function getLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function generateSmartAlerts(input: SmartAlertInput): SmartAlert[] {
  const { todos, streakDays, todayQuestionsDone, targetQuestions = 50, totalQuestionsSolved = 0 } = input;
  const alerts: SmartAlert[] = [];
  const today = getLocalDateStr();
  const now = Date.now();

  // 1. Spaced Repetition Reviews Due
  let srsDue = 0;
  try {
    srsDue = getDueCount();
  } catch {
    srsDue = 0;
  }

  if (srsDue > 0) {
    alerts.push({
      id: 'smart-srs-due',
      type: 'srs_due',
      emoji: '🧠',
      title: `${srsDue} Flashcard & Review${srsDue > 1 ? 's' : ''} due today`,
      subtitle: 'Spaced repetition protects memory retention — review now!',
      priority: srsDue >= 10 ? 'high' : 'medium',
      color: srsDue >= 10 ? 'destructive' : 'chart-4',
      actionLabel: 'Review →',
      actionTab: 'flashcards',
      dismissKey: `srs-due-${today}`,
    });
  }

  // 2. Exam Urgency (<30 days away)
  try {
    const exams = getExamDates();
    exams.forEach(exam => {
      if (!exam.date) return;
      const daysLeft = Math.ceil((new Date(exam.date).getTime() - now) / 86400000);
      if (daysLeft <= 0 || daysLeft > 30) return;
      alerts.push({
        id: `smart-exam-${exam.id}`,
        type: 'exam_urgent',
        emoji: '🎯',
        title: `${exam.title || exam.label} in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
        subtitle: `Target pace: 50 MCQs / day for NORCET & nursing preparation.`,
        priority: daysLeft <= 7 ? 'high' : 'medium',
        color: daysLeft <= 7 ? 'destructive' : 'chart-4',
        actionLabel: 'Practice →',
        actionTab: 'practice-dashboard',
        dismissKey: `exam-${exam.id}-${today}`,
      });
    });
  } catch {
    // ignore
  }

  // 3. Streak Risk (no practice today + active streak > 1)
  if (todayQuestionsDone === 0 && streakDays > 1) {
    alerts.push({
      id: 'smart-streak-risk',
      type: 'streak_risk',
      emoji: '🔥',
      title: `Keep your ${streakDays}-day streak burning!`,
      subtitle: 'Solve at least 1 question today to maintain your progress.',
      priority: 'high',
      color: 'chart-4',
      actionLabel: 'Solve Now →',
      actionTab: 'practice-dashboard',
      dismissKey: `streak-risk-${today}`,
    });
  }

  // 4. Overdue Tasks
  const overdueTodos = todos.filter(t => !t.completed && t.dueDate < today);
  if (overdueTodos.length > 0) {
    alerts.push({
      id: 'smart-overdue-tasks',
      type: 'overdue_tasks',
      emoji: '📋',
      title: `${overdueTodos.length} overdue task${overdueTodos.length > 1 ? 's' : ''} need attention`,
      subtitle: 'Clear your study to-dos to stay ahead of schedule.',
      priority: overdueTodos.length >= 3 ? 'high' : 'medium',
      color: 'destructive',
      actionLabel: 'View →',
      actionTab: 'todos',
      dismissKey: `overdue-${today}`,
    });
  }

  // 5. Milestone approaching (100, 250, 500, 1000, 2000, 5000)
  const milestones = [100, 250, 500, 1000, 2500, 5000];
  for (const m of milestones) {
    const remaining = m - totalQuestionsSolved;
    if (remaining > 0 && remaining <= 20) {
      alerts.push({
        id: `smart-milestone-${m}`,
        type: 'milestone',
        emoji: '⭐',
        title: `${remaining} more question${remaining > 1 ? 's' : ''} to reach ${m}!`,
        subtitle: `You've solved ${totalQuestionsSolved} questions so far — keep going!`,
        priority: 'low',
        color: 'secondary',
        actionLabel: 'Practice →',
        actionTab: 'practice-dashboard',
        dismissKey: `milestone-${m}-${today}`,
      });
      break;
    }
  }

  // 6. Daily target reminder (if afternoon and under target)
  const hour = new Date().getHours();
  if (hour >= 14 && todayQuestionsDone < targetQuestions) {
    const left = targetQuestions - todayQuestionsDone;
    alerts.push({
      id: 'smart-daily-target',
      type: 'daily_target',
      emoji: '⚡',
      title: `${left} question${left > 1 ? 's' : ''} remaining for today's goal`,
      subtitle: `${todayQuestionsDone} of ${targetQuestions} completed. A quick 10-minute quiz will get you there!`,
      priority: 'medium',
      color: 'chart-4',
      actionLabel: 'Quick Quiz →',
      actionTab: 'practice-dashboard',
      dismissKey: `daily-target-${today}`,
    });
  }

  // Sort by priority, limit to 4
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return alerts.slice(0, 4);
}
