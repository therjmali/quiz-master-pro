import { useState, useMemo } from 'react';
import { usePersistedState } from './usePersistedState';
import { QuizResult } from '../types/quiz';

export type SortOption = 'newest' | 'oldest' | 'highest' | 'lowest' | 'most_questions' | 'fastest';
export type TimeRange = 'any' | 'today' | 'week' | 'month';
export type ScoreRange = 'any' | '90_100' | '70_89' | '50_69' | 'below_50';
export type AttemptFilter = 'any' | 'main' | 'practice';

export interface HistoryFilters {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  difficultyFilter: string;
  setDifficultyFilter: (v: string) => void;
  scoreFilter: ScoreRange;
  setScoreFilter: (v: ScoreRange) => void;
  timeFilter: TimeRange;
  setTimeFilter: (v: TimeRange) => void;
  subjectFilter: string;
  setSubjectFilter: (v: string) => void;
  attemptFilter: AttemptFilter;
  setAttemptFilter: (v: AttemptFilter) => void;
  sortBy: SortOption;
  setSortBy: (v: SortOption) => void;
  filteredHistory: QuizResult[];
  activeFilterCount: number;
  clearAll: () => void;
}

export function useHistoryFilters(history: QuizResult[]): HistoryFilters {
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = usePersistedState('hist_difficulty', 'any');
  const [scoreFilter, setScoreFilter] = usePersistedState<ScoreRange>('hist_score', 'any');
  const [timeFilter, setTimeFilter] = usePersistedState<TimeRange>('hist_time', 'any');
  const [subjectFilter, setSubjectFilter] = usePersistedState('hist_subject', 'any');
  const [attemptFilter, setAttemptFilter] = usePersistedState<AttemptFilter>('hist_attempt', 'any');
  const [sortBy, setSortBy] = usePersistedState<SortOption>('hist_sort', 'newest');

  const clearAll = () => {
    setSearchTerm('');
    setDifficultyFilter('any');
    setScoreFilter('any');
    setTimeFilter('any');
    setSubjectFilter('any');
    setAttemptFilter('any');
    setSortBy('newest');
  };

  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;

    let result = history.filter(r => {
      // Search
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        const titleMatch = r.quizTitle?.toLowerCase().includes(s);
        const subjMatch = r.subject?.toLowerCase().includes(s);
        const qMatch = r.quizData?.[0]?.question?.toLowerCase().includes(s);
        if (!titleMatch && !subjMatch && !qMatch) return false;
      }

      // Difficulty
      if (difficultyFilter !== 'any') {
        const d = (r.difficulty || 'mixed').toLowerCase();
        if (d !== difficultyFilter) return false;
      }

      // Subject
      if (subjectFilter !== 'any') {
        if ((r.subject || '') !== subjectFilter) return false;
      }

      // Attempt type
      if (attemptFilter !== 'any') {
        const rType = r.attemptType || 'main';
        if (rType !== attemptFilter) return false;
      }

      // Score range
      if (scoreFilter !== 'any') {
        const p = r.percentage;
        if (scoreFilter === '90_100' && p < 90) return false;
        if (scoreFilter === '70_89' && (p < 70 || p > 89)) return false;
        if (scoreFilter === '50_69' && (p < 50 || p > 69)) return false;
        if (scoreFilter === 'below_50' && p >= 50) return false;
      }

      // Time range
      if (timeFilter !== 'any') {
        if (timeFilter === 'today' && new Date().toDateString() !== new Date(r.timestamp).toDateString()) return false;
        if (timeFilter === 'week' && (now - r.timestamp) > 7 * dayMs) return false;
        if (timeFilter === 'month' && (now - r.timestamp) > 30 * dayMs) return false;
      }

      return true;
    });

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return a.timestamp - b.timestamp;
        case 'highest': return b.percentage - a.percentage;
        case 'lowest': return a.percentage - b.percentage;
        case 'most_questions': return b.totalQuestions - a.totalQuestions;
        case 'fastest': return a.timeTaken - b.timeTaken;
        default: return b.timestamp - a.timestamp; // newest
      }
    });

    return result;
  }, [history, searchTerm, difficultyFilter, scoreFilter, timeFilter, subjectFilter, attemptFilter, sortBy]);

  const activeFilterCount = [
    searchTerm.trim() !== '',
    difficultyFilter !== 'any',
    scoreFilter !== 'any',
    timeFilter !== 'any',
    subjectFilter !== 'any',
    attemptFilter !== 'any',
    sortBy !== 'newest',
  ].filter(Boolean).length;

  return {
    searchTerm, setSearchTerm,
    difficultyFilter, setDifficultyFilter,
    scoreFilter, setScoreFilter,
    timeFilter, setTimeFilter,
    subjectFilter, setSubjectFilter,
    attemptFilter, setAttemptFilter,
    sortBy, setSortBy,
    filteredHistory,
    activeFilterCount,
    clearAll,
  };
}
