// ═══════════════════════════════════════════════════════
//  Study Tracker Data Model — shared across Analytics
// ═══════════════════════════════════════════════════════

export interface SubTopic {
  id: string;
  name: string;
  completed: boolean;
  status: 'incomplete' | 'in_process' | 'complete';
  completedDate?: string;   // YYYY-MM-DD
  completedTime?: string;   // HH:mm
  difficulty: 'Easy' | 'Medium' | 'Hard';
  timeSpent: number;        // minutes
  important: boolean;
  notes?: string;
  tags?: string[];
}

export interface Unit {
  id: string;
  name: string;
  subTopics: SubTopic[];
}

export interface Subject {
  id: string;
  name: string;
  shortName: string;
  color: string;
  examDate?: string;
  units: Unit[];
}

export interface StudySession {
  startTime: string;  // HH:mm
  endTime: string;
  subject?: string;
  notes?: string;
}

export interface DailyLog {
  date: string;       // YYYY-MM-DD
  hoursStudied: number;
  topicsCompleted: number;
  mood?: 'Sad' | 'Tired' | 'Neutral' | 'Happy' | 'Motivated';
  notes?: string;
  sessions: StudySession[];
}

export interface StudyGoals {
  dailyHours: number;
  dailyTopics: number;
  weeklyHours: number;
  weeklyTopics: number;
  monthlyHours: number;
  monthlyTopics: number;
}

export interface StudyFilterState {
  timeRange: 'all' | 'today' | 'week' | 'month' | 'custom';
  from: string;   // YYYY-MM-DD resolved
  to: string;     // YYYY-MM-DD resolved
  subject: string; // 'all' or subject id
  difficulty: 'All' | 'Easy' | 'Medium' | 'Hard';
}

export const MOOD_EMOJI: Record<string, string> = {
  Sad: '😢',
  Tired: '😴',
  Neutral: '😐',
  Happy: '😄',
  Motivated: '🔥',
};

export const MOOD_LIST = ['Sad', 'Tired', 'Neutral', 'Happy', 'Motivated'] as const;

export const DIFFICULTY_COLORS = {
  Easy: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25', hex: '#10b981' },
  Medium: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25', hex: '#f59e0b' },
  Hard: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/25', hex: '#ef4444' },
};

export const SUBJECT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];
