import { useState, useMemo } from 'react';
import { Star, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { QuizResult } from '../../types/quiz';

interface Props {
  history: QuizResult[];
}

const FEEDBACK_OPTIONS = [
  { emoji: '😍', label: 'Too Easy', value: 'too_easy' },
  { emoji: '😊', label: 'Just Right', value: 'just_right' },
  { emoji: '😤', label: 'Too Hard', value: 'too_hard' },
  { emoji: '🤔', label: 'Confusing', value: 'confusing' },
  { emoji: '🔥', label: 'Great Quiz', value: 'great' },
];

const RATING_KEY = 'qmp_quiz_ratings';

function loadRatings(): Record<string, { stars: number; feedback?: string; ts: number }> {
  try { return JSON.parse(localStorage.getItem(RATING_KEY) || '{}'); } catch { return {}; }
}

function saveRating(quizTs: number, stars: number, feedback?: string) {
  const all = loadRatings();
  all[String(quizTs)] = { stars, feedback, ts: Date.now() };
  // Keep last 100
  const keys = Object.keys(all);
  if (keys.length > 100) {
    const sorted = keys.sort((a, b) => all[a].ts - all[b].ts);
    sorted.slice(0, keys.length - 100).forEach(k => delete all[k]);
  }
  localStorage.setItem(RATING_KEY, JSON.stringify(all));
}

export default function PerformanceRatingCard({ history }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedStars, setSelectedStars] = useState(0);
  const [selectedFeedback, setSelectedFeedback] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const lastQuiz = history[0];
  const savedRatings = useMemo(() => loadRatings(), []);
  const alreadyRated = lastQuiz ? !!savedRatings[String(lastQuiz.timestamp)] : false;
  const existingRating = lastQuiz ? savedRatings[String(lastQuiz.timestamp)] : null;

  // Compute average rating across all rated quizzes
  const avgRating = useMemo(() => {
    const vals = Object.values(savedRatings);
    if (!vals.length) return 0;
    return Math.round((vals.reduce((a, v) => a + v.stars, 0) / vals.length) * 10) / 10;
  }, [savedRatings]);

  const ratedCount = Object.keys(savedRatings).length;

  if (!lastQuiz) return null;

  const handleSubmit = () => {
    if (selectedStars === 0) { toast.error('Select a star rating'); return; }
    saveRating(lastQuiz.timestamp, selectedStars, selectedFeedback || undefined);
    setSubmitted(true);
    toast.success('⭐ Rating saved! Thanks for your feedback');
  };

  const pct = lastQuiz.percentage;
  const scoreEmoji = pct >= 90 ? '🏆' : pct >= 70 ? '🌟' : pct >= 50 ? '👍' : '📚';

  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      {/* Collapse header */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-3 p-4 text-left transition-all active:bg-foreground/5"
      >
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <Star className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Performance Rating</p>
          <div className="flex items-center gap-2 mt-0.5">
            {avgRating > 0 ? (
              <>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`w-3 h-3 ${avgRating >= s ? 'fill-amber-400 text-amber-400' : 'text-foreground/15'}`} />
                  ))}
                </div>
                <span className="text-[10px] text-foreground/40 font-semibold">
                  {avgRating} avg · {ratedCount} rated
                </span>
              </>
            ) : (
              <span className="text-[10px] text-foreground/40">Rate your last quiz</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg">{scoreEmoji}</span>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-foreground/30" />
            : <ChevronDown className="w-4 h-4 text-foreground/30" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border animate-fade-in">
          {/* Last quiz summary */}
          <div className="flex items-center gap-3 py-3">
            <div className={`text-2xl font-black leading-none ${pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
              {pct}%
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground truncate">
                {lastQuiz.quizTitle || `Quiz · ${lastQuiz.totalQuestions} Questions`}
              </p>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-foreground/40">
                <span className="flex items-center gap-1"><ThumbsUp className="w-2.5 h-2.5 text-emerald-400" />{lastQuiz.correct}</span>
                <span className="flex items-center gap-1"><ThumbsDown className="w-2.5 h-2.5 text-red-400" />{lastQuiz.wrong}</span>
                <span className="flex items-center gap-1"><Minus className="w-2.5 h-2.5 text-amber-400" />{lastQuiz.skipped}</span>
              </div>
            </div>
          </div>

          {/* Rating section */}
          {alreadyRated || submitted ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3">
              <span className="text-lg">✅</span>
              <div>
                <p className="text-xs font-bold text-emerald-400">Rated!</p>
                <div className="flex gap-0.5 mt-0.5">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`w-3.5 h-3.5 ${(existingRating?.stars || selectedStars) >= s ? 'fill-amber-400 text-amber-400' : 'text-foreground/15'}`} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Star rating */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-bold text-foreground/40 flex-shrink-0 uppercase tracking-wider">How was it?</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setSelectedStars(star)}
                      className="p-1 transition-all active:scale-90 hover:scale-110"
                    >
                      <Star className={`w-6 h-6 transition-colors ${selectedStars >= star ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]' : 'text-foreground/15 hover:text-foreground/25'}`} />
                    </button>
                  ))}
                </div>
                {selectedStars > 0 && (
                  <span className="text-[10px] font-bold text-amber-400/70">
                    {['', 'Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'][selectedStars]}
                  </span>
                )}
              </div>

              {/* Quick feedback pills */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {FEEDBACK_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedFeedback(prev => prev === opt.value ? null : opt.value)}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all active:scale-95 ${
                      selectedFeedback === opt.value
                        ? 'bg-primary/15 border-primary/30 text-foreground'
                        : 'bg-card border-border text-foreground/40 hover:border-foreground/20'
                    }`}
                  >
                    <span>{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={selectedStars === 0}
                className="w-full bg-primary/10 hover:bg-primary/20 border border-primary/25 text-primary text-xs font-bold py-2.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-30"
              >
                Submit Rating ⭐
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
