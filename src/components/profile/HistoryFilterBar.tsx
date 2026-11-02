import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import SearchInput from '../shared/SearchInput';
import { QuizResult } from '../../types/quiz';
import { HistoryFilters, SortOption, ScoreRange, TimeRange, AttemptFilter } from '../../hooks/useHistoryFilters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';

interface Props { filters: HistoryFilters; history: QuizResult[]; }

function FilterSelect({ value, onValueChange, options }: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full h-auto py-1.5 px-2.5 bg-card border-border text-foreground text-xs rounded-lg focus:ring-primary focus:ring-1 focus:border-primary">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} className="text-xs cursor-pointer">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function HistoryFilterBar({ filters, history }: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const {
    searchTerm, setSearchTerm, difficultyFilter, setDifficultyFilter,
    scoreFilter, setScoreFilter, timeFilter, setTimeFilter,
    subjectFilter, setSubjectFilter, attemptFilter, setAttemptFilter,
    sortBy, setSortBy,
    activeFilterCount, clearAll, filteredHistory,
  } = filters;

  const subjects = Array.from(new Set(history.map(r => r.subject).filter(Boolean))) as string[];

  return (
    <div className="mb-4 space-y-2">
      {/* Search row */}
      <div className="flex gap-2">
        <SearchInput size="sm" className="flex-1" value={searchTerm} onChange={setSearchTerm} placeholder="Search by title, subject, question…" />
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
            activeFilterCount > 0
              ? 'bg-primary/15 border-primary/35 text-primary'
              : 'bg-foreground/5 border-border text-foreground/60 hover:border-foreground/20'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-primary text-primary-foreground text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Expanded filter controls */}
      {showFilters && (
        <div className="bg-foreground/5 border border-border rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[9px] text-foreground/40 font-bold uppercase tracking-wider mb-1.5">Difficulty</label>
              <FilterSelect value={difficultyFilter} onValueChange={setDifficultyFilter}
                options={[{ value: 'any', label: 'Any' },{ value: 'easy', label: '🟢 Easy' },{ value: 'medium', label: '🟡 Medium' },{ value: 'hard', label: '🔴 Hard' },{ value: 'mixed', label: '🎲 Mixed' },{ value: 'all', label: 'All' }]} />
            </div>
            <div>
              <label className="block text-[9px] text-foreground/40 font-bold uppercase tracking-wider mb-1.5">Score Range</label>
              <FilterSelect value={scoreFilter} onValueChange={v => setScoreFilter(v as ScoreRange)}
                options={[{ value: 'any', label: 'Any score' },{ value: '90_100', label: '90–100%' },{ value: '70_89', label: '70–89%' },{ value: '50_69', label: '50–69%' },{ value: 'below_50', label: 'Below 50%' }]} />
            </div>
            <div>
              <label className="block text-[9px] text-foreground/40 font-bold uppercase tracking-wider mb-1.5">Time Period</label>
              <FilterSelect value={timeFilter} onValueChange={v => setTimeFilter(v as TimeRange)}
                options={[{ value: 'any', label: 'Any time' },{ value: 'today', label: 'Today' },{ value: 'week', label: 'This week' },{ value: 'month', label: 'This month' }]} />
            </div>
            {subjects.length > 0 && (
              <div>
                <label className="block text-[9px] text-foreground/40 font-bold uppercase tracking-wider mb-1.5">Subject</label>
                <FilterSelect value={subjectFilter} onValueChange={setSubjectFilter}
                  options={[{ value: 'any', label: 'Any subject' }, ...subjects.map(s => ({ value: s, label: s }))]} />
              </div>
            )}
            <div>
              <label className="block text-[9px] text-foreground/40 font-bold uppercase tracking-wider mb-1.5">Attempt Type</label>
              <FilterSelect value={attemptFilter} onValueChange={v => setAttemptFilter(v as AttemptFilter)}
                options={[{ value: 'any', label: 'All Attempts' }, { value: 'main', label: '🏠 Main Quiz' }, { value: 'practice', label: '🔁 Practice' }]} />
            </div>
            <div className="col-span-2">
              <label className="block text-[9px] text-foreground/40 font-bold uppercase tracking-wider mb-1.5">Sort by</label>
              <FilterSelect value={sortBy} onValueChange={v => setSortBy(v as SortOption)}
                options={[{ value: 'newest', label: 'Newest first' },{ value: 'oldest', label: 'Oldest first' },{ value: 'highest', label: 'Highest score' },{ value: 'lowest', label: 'Lowest score' },{ value: 'most_questions', label: 'Most questions' },{ value: 'fastest', label: 'Fastest time' }]} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-[10px] text-foreground/40 font-bold">{filteredHistory.length} of {history.length} results</span>
            {activeFilterCount > 0 && (
              <button onClick={clearAll} className="text-[10px] text-destructive font-bold flex items-center gap-1 transition-colors">
                <X className="w-3 h-3" /> Clear filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
