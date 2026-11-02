import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import AiRationaleText from '../AiRationaleText';
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight, Shuffle, Bot, X, BookOpen, BarChart2, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import FlashcardStats from './FlashcardStats';
import { QuizResult, QuizQuestion } from '../../types/quiz';
import { getMergedBadge } from '../../utils/difficultyBadge';

/* ── Types ── */
type SourceFilter = 'incorrect' | 'skipped' | 'correct' | 'all' | 'random20';
type DiffFilter = 'all' | 'hard' | 'medium' | 'easy';
type TimeFilter = 'all' | '7d' | '30d' | 'today' | 'this_week' | 'this_month' | 'custom';
type SortMode = 'default' | 'mostWrong';

interface FlashcardMeta {
  quizTitle?: string;
  quizDate: number;
  subject?: string;
  userAnswer: string | null;
  wasCorrect: boolean;
  wrongCount: number;
  practiceCount: number;
  questionType?: string;
}

type EnrichedCard = QuizQuestion & FlashcardMeta;

import { recordSession } from '../../utils/flashcardSessions';
import { hapticTap } from '../../utils/haptics';
import { addWrongQuestionsToSR, loadSRItems, removeSRItem, reviewSRItem } from '../../utils/spacedRepetition';
import { getQuizDetailsFromIDB } from '../../hooks/useHistorySync';
import { idbGet } from '../../utils/indexedDB';
import { getHistory } from '../../utils/historyStore';

/* ── Persistence helpers ── */
const PROGRESS_KEY = 'qmp_flashcard_progress';
const SR_KEY = 'qmp_flashcard_sr'; // Spaced repetition intervals per card

function hashQuestion(q: string): string {
  let h = 0;
  for (let i = 0; i < q.length; i++) {
    h = ((h << 5) - h + q.charCodeAt(i)) | 0;
  }
  return 'q' + Math.abs(h).toString(36);
}

interface FlashcardSR {
  interval: number; // days
  nextReview: number; // timestamp ms
  lastReviewed: number;
}

function loadProgress(): Record<string, 'known' | 'review'> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch { return {}; }
}

function saveProgress(p: Record<string, 'known' | 'review'>) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
}

function loadSR(): Record<string, FlashcardSR> {
  try { return JSON.parse(localStorage.getItem(SR_KEY) || '{}'); } catch { return {}; }
}

function saveSR(sr: Record<string, FlashcardSR>) {
  localStorage.setItem(SR_KEY, JSON.stringify(sr));
}

const SR_INTERVALS = [1, 3, 7, 14, 30, 60]; // days progression

function advanceSRInterval(current: number): number {
  const idx = SR_INTERVALS.indexOf(current);
  if (idx === -1 || idx >= SR_INTERVALS.length - 1) return SR_INTERVALS[SR_INTERVALS.length - 1];
  return SR_INTERVALS[idx + 1];
}

function formatNextReview(ts: number): string {
  const now = Date.now();
  const diff = ts - now;
  if (diff <= 0) return 'Due now';
  const days = Math.ceil(diff / 86400000);
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `${days}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ── Props ── */
interface Props {
  history: QuizResult[];
  onBack: () => void;
  initialProgressFilter?: 'all' | 'known' | 'review' | 'unmarked';
}

/* ── Filter Chip ── */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 text-[11px] font-bold px-3 py-2 rounded-xl border whitespace-nowrap transition-all active:scale-95 ${
        active
          ? 'bg-primary/20 border-primary/40 text-primary shadow-sm'
          : 'bg-card border-border text-foreground/50 hover:border-foreground/20'
      }`}
    >
      {label}
    </button>
  );
}

/* ── Select Dropdown ── */
function FilterSelect({ value, options, onChange, label }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="flex-shrink-0 relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none text-[11px] font-bold px-3 py-2 pr-6 rounded-xl border bg-card border-border text-foreground/70 cursor-pointer focus:outline-none focus:border-primary/40 transition-all"
        title={label}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/30 text-[8px] pointer-events-none">▾</span>
    </div>
  );
}

/* ── Flash Card Component ── */
function FlashCard({ card, isFlipped, onFlip, progress, srInfo, cardNumber, totalCards }: {
  card: EnrichedCard;
  isFlipped: boolean;
  onFlip: () => void;
  progress: 'known' | 'review' | undefined;
  srInfo?: FlashcardSR;
  cardNumber: number;
  totalCards: number;
}) {
  const badge = getMergedBadge(card.difficulty, card.questionType);

  return (
    <button onClick={onFlip} className="w-full text-left" style={{ perspective: '1000px' }}>
      <div
        className="relative w-full min-h-[380px] sm:min-h-[420px] transition-transform duration-500"
        style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-2xl bg-card border border-border p-5 sm:p-7 flex flex-col"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Top badges */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className={`text-[9px] font-black px-2 py-1 rounded-lg ${badge.classes}`}>
              {badge.emoji} {badge.label}
            </span>
            {card.subject && (
              <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                {card.subject}
              </span>
            )}
            {card.wrongCount > 0 && (
              <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                ✗ {card.wrongCount}×
              </span>
            )}
            {card.practiceCount > 0 && (
              <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-foreground/5 text-foreground/40 border border-border">
                🔄 {card.practiceCount}
              </span>
            )}
            {progress && (
              <span className={`text-[9px] font-black px-2 py-1 rounded-lg border ${
                progress === 'known' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
              }`}>
                {progress === 'known' ? '✓ Known' : '↻ Review'}
                {srInfo && <span className="ml-1 opacity-70 font-bold">· {formatNextReview(srInfo.nextReview)}</span>}
              </span>
            )}
            <span className="text-[10px] font-black text-foreground/20 tabular-nums ml-auto">#{cardNumber}</span>
          </div>

          {/* Question */}
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-black text-foreground/25 uppercase tracking-widest mb-3">QUESTION</span>
            <p className="text-base sm:text-lg font-bold text-foreground leading-relaxed max-w-lg">{card.question}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-1.5">
              {(card.shuffledOpts || card.options).map((opt, i) => (
                <span key={i} className="text-[10px] text-foreground/40 bg-foreground/5 border border-border px-2.5 py-1.5 rounded-lg">
                  ({String.fromCharCode(97 + i)}) {opt}
                </span>
              ))}
            </div>
          </div>

          {/* Source info */}
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <p className="text-[9px] text-foreground/25 truncate max-w-[60%]">
              📝 {card.quizTitle || 'Quiz'} · {new Date(card.quizDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </p>
            <p className="text-[9px] text-foreground/20">Tap to flip →</p>
          </div>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 rounded-2xl bg-card border-2 border-emerald-500/25 p-5 sm:p-7 flex flex-col"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest mb-3">✓ ANSWER</span>
            <p className="text-lg sm:text-xl font-black text-emerald-400 leading-relaxed mb-4">{card.correctAnswer}</p>
            {card.rationale && (
              <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl px-4 py-3 max-w-lg w-full text-left">
                <p className="text-[9px] font-black text-amber-400/60 uppercase tracking-widest mb-1.5">📖 Rationale</p>
                <AiRationaleText text={card.rationale} className="text-sm text-foreground/50" />
              </div>
            )}
            {card.wrongCount > 1 && (
              <p className="text-[10px] text-red-400/60 mt-3 font-bold">
                ⚠️ You got this wrong {card.wrongCount} time{card.wrongCount > 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-emerald-500/15 text-center">
            <p className="text-[9px] text-foreground/20">Tap to see question ←</p>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ── Main Screen ── */
export default function FlashcardScreen({ history: rawHistory, onBack, initialProgressFilter }: Props) {
  // ── Enrich stripped history records with full quizData from IDB ──
  const [enrichedHistory, setEnrichedHistory] = useState<QuizResult[]>(rawHistory);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    const stripped = rawHistory.filter(r => (!r.quizData || r.quizData.length === 0) && (r.totalQuestions > 0 || r.correct > 0 || r.wrong > 0));
    if (stripped.length === 0) {
      // All records already have full data
      setEnrichedHistory(rawHistory);
      return;
    }

    let cancelled = false;
    setEnriching(true);

    (async () => {
      try {
        // Try loading full history from IDB primary store first
        const fullHistory = await getHistory();
        if (cancelled) return;

        // Build a map of records that have full quizData
        const fullMap = new Map<number, QuizResult>();
        for (const r of fullHistory) {
          if (Array.isArray(r.quizData) && r.quizData.length > 0) {
            fullMap.set(r.timestamp, r);
          }
        }

        // For records still missing quizData, try individual IDB detail keys
        const stillMissing = rawHistory.filter(r =>
          (!r.quizData || r.quizData.length === 0) && !fullMap.has(r.timestamp) &&
          (r.totalQuestions > 0 || r.correct > 0 || r.wrong > 0)
        );

        if (stillMissing.length > 0) {
          const keys = stillMissing.flatMap(r => {
            const k: string[] = [];
            if (r.id) k.push(r.id);
            if (r.timestamp) k.push(String(r.timestamp));
            return k;
          });
          const detailMap = await getQuizDetailsFromIDB([...new Set(keys)]);
          detailMap.forEach((v, k) => {
            if (Array.isArray(v.quizData) && v.quizData.length > 0) {
              // Find matching record and add to fullMap
              const match = rawHistory.find(r => (r.id && r.id === k) || String(r.timestamp) === k);
              if (match) fullMap.set(match.timestamp, { ...match, quizData: v.quizData, userAnswers: v.userAnswers || [] });
            }
          });
        }

        // Also try legacy bulk key
        if (!cancelled) {
          try {
            const bulkFull = await idbGet<QuizResult[]>('qmp_history_full');
            if (Array.isArray(bulkFull)) {
              for (const r of bulkFull) {
                if (Array.isArray(r.quizData) && r.quizData.length > 0 && !fullMap.has(r.timestamp)) {
                  fullMap.set(r.timestamp, r);
                }
              }
            }
          } catch { /* */ }
        }

        if (cancelled) return;

        // Merge: use full-data version where available
        const merged = rawHistory.map(r => fullMap.get(r.timestamp) || r);
        setEnrichedHistory(merged);
      } catch {
        setEnrichedHistory(rawHistory);
      } finally {
        if (!cancelled) setEnriching(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rawHistory]);

  const history = enrichedHistory;
  // ── Filter state ──
  const [source, setSource] = useState<SourceFilter>(initialProgressFilter && initialProgressFilter !== 'all' ? 'all' : 'incorrect');
  const [subject, setSubject] = useState('all');
  const [diff, setDiff] = useState<DiffFilter>('all');
  const [qType, setQType] = useState('all');
  const [time, setTime] = useState<TimeFilter>('all');
  const [aiImportant, setAiImportant] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [progressFilter, setProgressFilter] = useState<'all' | 'known' | 'review' | 'unmarked'>(initialProgressFilter || 'all');

  // ── Custom date range ──
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // ── Card state ──
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [progress, setProgress] = useState<Record<string, 'known' | 'review'>>(loadProgress);
  const [srData, setSrData] = useState<Record<string, FlashcardSR>>(loadSR);
  const [showStats, setShowStats] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [dueFilter, setDueFilter] = useState(false);
  const sessionStartRef = useRef(Date.now());
  const sessionActionsRef = useRef({ reviewed: 0, known: 0, review: 0 });

  // ── Swipe refs ──
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // ── Extract unique subjects & question types ──
  const subjects = useMemo(() => {
    const s = new Set<string>();
    history.forEach(r => { if (r.subject) s.add(r.subject); });
    return Array.from(s).sort();
  }, [history]);

  const questionTypes = useMemo(() => {
    const s = new Set<string>();
    history.filter(r => r.quizData?.length > 0).forEach(r => r.quizData.forEach(q => { if (q.questionType) s.add(q.questionType); }));
    return Array.from(s).sort();
  }, [history]);

  // ── Build enriched cards ──
  const allCards = useMemo(() => {
    let timeCutoffStart = 0;
    let timeCutoffEnd = Infinity;
    const now = new Date();
    if (time === 'today') {
      timeCutoffStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    } else if (time === '7d') {
      timeCutoffStart = Date.now() - 7 * 86400000;
    } else if (time === '30d') {
      timeCutoffStart = Date.now() - 30 * 86400000;
    } else if (time === 'this_week') {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0);
      timeCutoffStart = d.getTime();
    } else if (time === 'this_month') {
      timeCutoffStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (time === 'custom' && customFrom) {
      const [y, m, d] = customFrom.split('-').map(Number);
      timeCutoffStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      if (customTo) {
        const [y2, m2, d2] = customTo.split('-').map(Number);
        timeCutoffEnd = new Date(y2, m2 - 1, d2, 23, 59, 59, 999).getTime();
      } else {
        // Single date mode
        timeCutoffEnd = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      }
    }

    // Count wrong occurrences & practice count per question
    const wrongCounts = new Map<string, number>();
    const practiceCounts = new Map<string, number>();
    history.filter(r => r.quizData?.length > 0).forEach(r => {
      r.quizData.forEach((q, i) => {
        const key = hashQuestion(q.question);
        practiceCounts.set(key, (practiceCounts.get(key) || 0) + 1);
        if (r.userAnswers[i] !== null && r.userAnswers[i] !== q.correctAnswer) {
          wrongCounts.set(key, (wrongCounts.get(key) || 0) + 1);
        }
      });
    });

    // Calculate per-question accuracy
    const qAccuracy = new Map<string, { correct: number; total: number }>();
    history.filter(r => r.quizData?.length > 0).forEach(r => {
      r.quizData.forEach((q, i) => {
        if (r.userAnswers[i] !== null) {
          const key = hashQuestion(q.question);
          const prev = qAccuracy.get(key) || { correct: 0, total: 0 };
          prev.total++;
          if (r.userAnswers[i] === q.correctAnswer) prev.correct++;
          qAccuracy.set(key, prev);
        }
      });
    });

    const overallAccuracy = history.length > 0
      ? history.reduce((a, r) => a + r.accuracy, 0) / history.length
      : 50;

    const seen = new Set<string>();
    const cards: EnrichedCard[] = [];

    const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);

    for (const r of sorted) {
      if (time !== 'all' && (r.timestamp < timeCutoffStart || r.timestamp > timeCutoffEnd)) continue;
      if (subject !== 'all' && r.subject !== subject) continue;

      if (!r.quizData?.length) continue;
      for (let i = 0; i < r.quizData.length; i++) {
        const q = r.quizData[i];
        const key = hashQuestion(q.question);
        if (seen.has(key)) continue;

        const wasCorrect = r.userAnswers[i] === q.correctAnswer;
        const wasSkipped = r.userAnswers[i] === null;

        // Source filter
        if (source === 'incorrect' && (wasCorrect || wasSkipped)) continue;
        if (source === 'skipped' && !wasSkipped) continue;
        if (source === 'correct' && !wasCorrect) continue;

        // Difficulty filter
        if (diff !== 'all' && q.difficulty !== diff) continue;

        // Question type filter
        if (qType !== 'all' && q.questionType !== qType) continue;

        // Progress filter
        if (progressFilter === 'unmarked' && progress[key]) continue;
        if (progressFilter === 'known' && progress[key] !== 'known') continue;
        if (progressFilter === 'review' && progress[key] !== 'review') continue;

        seen.add(key);
        cards.push({
          ...q,
          quizTitle: r.quizTitle,
          quizDate: r.timestamp,
          subject: r.subject,
          userAnswer: r.userAnswers[i],
          wasCorrect,
          wrongCount: wrongCounts.get(key) || 0,
          practiceCount: (practiceCounts.get(key) || 1) - 1, // -1 because first encounter isn't "practice"
          questionType: q.questionType,
        });
      }
    }

    // Sort: Most Wrong
    if (sortMode === 'mostWrong') {
      cards.sort((a, b) => b.wrongCount - a.wrongCount);
    }

    // AI Important: sort by wrongCount desc, then below-average accuracy
    if (aiImportant) {
      cards.sort((a, b) => {
        const aAcc = qAccuracy.get(hashQuestion(a.question));
        const bAcc = qAccuracy.get(hashQuestion(b.question));
        const aScore = a.wrongCount * 10 + (aAcc && aAcc.total > 0 ? (overallAccuracy - (aAcc.correct / aAcc.total) * 100) : 0);
        const bScore = b.wrongCount * 10 + (bAcc && bAcc.total > 0 ? (overallAccuracy - (bAcc.correct / bAcc.total) * 100) : 0);
        return bScore - aScore;
      });
    }

    // Due Today filter
    if (dueFilter) {
      const now = Date.now();
      const srSnap = loadSR();
      const dueCards = cards.filter(c => {
        const key = hashQuestion(c.question);
        const sr = srSnap[key];
        if (!sr) return true; // Never reviewed = due
        return sr.nextReview <= now;
      });
      return dueCards;
    }

    // Random 20
    if (source === 'random20') {
      const shuffled = [...cards].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, 20);
    }

    return cards;
  }, [history, source, subject, diff, qType, time, customFrom, customTo, aiImportant, sortMode, progressFilter, progress, dueFilter]);

  // Reset index when filters change
  useEffect(() => {
    setCurrentIdx(0);
    setIsFlipped(false);
  }, [source, subject, diff, qType, time, aiImportant, sortMode, progressFilter, dueFilter]);

  const total = allCards.length;
  const current = allCards[currentIdx];
  const currentHash = current ? hashQuestion(current.question) : '';

  // Stats
  const knownCount = useMemo(() => allCards.filter(c => progress[hashQuestion(c.question)] === 'known').length, [allCards, progress]);
  const reviewCount = useMemo(() => allCards.filter(c => progress[hashQuestion(c.question)] === 'review').length, [allCards, progress]);
  const accuracyEst = total > 0 ? Math.round((knownCount / total) * 100) : 0;

  const handleNext = useCallback(() => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIdx(i => Math.min(i + 1, total - 1)), 150);
  }, [total]);

  const handlePrev = useCallback(() => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIdx(i => Math.max(0, i - 1)), 150);
  }, []);

  const markCard = useCallback((status: 'known' | 'review') => {
    if (!current) return;
    hapticTap();
    const p = { ...progress, [currentHash]: status };
    setProgress(p);
    saveProgress(p);
    // Update flashcard spaced repetition data
    const sr = { ...srData };
    const existing = sr[currentHash];
    const now = Date.now();
    if (status === 'known') {
      const currentInterval = existing?.interval || 0;
      const nextInterval = currentInterval === 0 ? 1 : advanceSRInterval(currentInterval);
      sr[currentHash] = { interval: nextInterval, nextReview: now + nextInterval * 86400000, lastReviewed: now };
    } else {
      // Review = reset to 1 day
      sr[currentHash] = { interval: 1, nextReview: now + 86400000, lastReviewed: now };
    }
    setSrData(sr);
    saveSR(sr);

    // ── Sync with dashboard SR system ──
    try {
      const srItems = loadSRItems();
      const existingSR = srItems.find(item => item.question === current.question);
      if (status === 'review') {
        // Add to dashboard SR if not already there
        if (!existingSR) {
          addWrongQuestionsToSR([{
            question: current.question,
            options: current.options,
            correctAnswer: current.correctAnswer,
            difficulty: current.difficulty,
          }]);
        } else {
          // Reset interval via review
          reviewSRItem(existingSR.id, 1);
        }
      } else {
        // Known — advance or remove from SR
        if (existingSR) {
          reviewSRItem(existingSR.id, 5); // perfect recall
        }
      }
    } catch {}

    sessionActionsRef.current.reviewed++;
    if (status === 'known') sessionActionsRef.current.known++;
    else sessionActionsRef.current.review++;
    if (currentIdx < total - 1) handleNext();
  }, [current, currentHash, progress, srData, currentIdx, total, handleNext]);

  const handleShuffle = () => {
    setCurrentIdx(0);
    setIsFlipped(false);
  };

  // ── Swipe handlers ──
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    if (dx > 0) markCard('known');
    else markCard('review');
  };

  // Record session when leaving flashcards
  useEffect(() => {
    return () => {
      const actions = sessionActionsRef.current;
      if (actions.reviewed > 0) {
        const subjects = new Set<string>();
        allCards.forEach(c => { if (c.subject) subjects.add(c.subject); });
        const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
        const masteryPct = actions.reviewed > 0 ? Math.round((actions.known / actions.reviewed) * 100) : 0;
        recordSession({
          timestamp: Date.now(),
          cardsReviewed: actions.reviewed,
          markedKnown: actions.known,
          markedReview: actions.review,
          subjects: Array.from(subjects),
          durationSeconds,
          masteryPct,
        });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Empty state ──
  if (enriching) {
    return (
      <div className="animate-fade-in pb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-foreground/40 hover:text-foreground transition-colors mb-4 px-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="rounded-2xl bg-card border border-border p-10 flex flex-col items-center text-center">
          <span className="text-4xl mb-4 animate-pulse">🃏</span>
          <h3 className="text-base font-black text-foreground mb-2">Loading Flashcards…</h3>
          <p className="text-sm text-foreground/40 max-w-xs">Retrieving full question data from storage.</p>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="animate-fade-in pb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-foreground/40 hover:text-foreground transition-colors mb-4 px-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="rounded-2xl bg-card border border-border p-10 flex flex-col items-center text-center">
          <span className="text-4xl mb-4">🃏</span>
          <h3 className="text-base font-black text-foreground mb-2">No Flashcards Yet</h3>
          <p className="text-sm text-foreground/40 max-w-xs">Complete some quizzes first — flashcards are generated from your quiz history.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-foreground/40 hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-foreground/30">
            {total > 0 ? `${currentIdx + 1}/${total}` : '0/0'}
          </span>
          <button onClick={() => setShowStats(true)} className="flex items-center gap-1 text-[10px] font-bold text-foreground/30 hover:text-foreground/60 bg-card border border-border px-2.5 py-1.5 rounded-lg transition-all active:scale-95">
            <BarChart2 className="w-3 h-3" /> Stats
          </button>
          <button onClick={handleShuffle} className="flex items-center gap-1 text-[10px] font-bold text-foreground/30 hover:text-foreground/60 bg-card border border-border px-2.5 py-1.5 rounded-lg transition-all active:scale-95">
            <Shuffle className="w-3 h-3" /> Shuffle
          </button>
          {(knownCount > 0 || reviewCount > 0) && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-1 text-[10px] font-bold text-red-400/60 hover:text-red-400 bg-card border border-border px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
            >
              <RotateCw className="w-3 h-3" /> Reset All
            </button>
          )}
        </div>
      </div>

      {/* Stats View */}
      {showStats && (
        <FlashcardStats
          allCards={allCards}
          progress={progress}
          knownCount={knownCount}
          reviewCount={reviewCount}
          total={total}
          onBack={() => setShowStats(false)}
        />
      )}

      {showStats ? null : <>
      {/* Title */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🃏</span>
        <div>
          <h2 className="text-lg font-black text-foreground">Flashcards</h2>
          <p className="text-[11px] text-foreground/40">Swipe right = Know It · Swipe left = Review</p>
        </div>
      </div>

      {/* ── Filter Bar Row 1: Source chips ── */}
      <div className="overflow-x-auto no-scrollbar -mx-1 px-1 mb-2">
        <div className="flex items-center gap-1.5 pb-1">
          {([
            { key: 'incorrect' as const, label: '❌ Incorrect' },
            { key: 'correct' as const, label: '✅ Correct' },
            { key: 'skipped' as const, label: '⏭️ Skipped' },
            { key: 'all' as const, label: '📚 All' },
            { key: 'random20' as const, label: '🔀 Random 20' },
          ] as const).map(s => (
            <Chip key={s.key} label={s.label} active={source === s.key} onClick={() => setSource(s.key)} />
          ))}
        </div>
      </div>

      {/* ── Filter Bar Row 2: Difficulty chips ── */}
      <div className="overflow-x-auto no-scrollbar -mx-1 px-1 mb-2">
        <div className="flex items-center gap-1.5 pb-1">
          {([
            { key: 'all' as const, label: 'All Levels' },
            { key: 'hard' as const, label: '🔴 Hard' },
            { key: 'medium' as const, label: '🟡 Medium' },
            { key: 'easy' as const, label: '🟢 Easy' },
          ] as const).map(d => (
            <Chip key={d.key} label={d.label} active={diff === d.key} onClick={() => setDiff(d.key)} />
          ))}

          {/* Progress filters */}
          <Chip label="📋 All Progress" active={progressFilter === 'all'} onClick={() => setProgressFilter('all')} />
          <Chip label="✓ Known" active={progressFilter === 'known'} onClick={() => setProgressFilter(p => p === 'known' ? 'all' : 'known')} />
          <Chip label="↻ Review" active={progressFilter === 'review'} onClick={() => setProgressFilter(p => p === 'review' ? 'all' : 'review')} />
          <Chip label="⬜ Unmarked" active={progressFilter === 'unmarked'} onClick={() => setProgressFilter(p => p === 'unmarked' ? 'all' : 'unmarked')} />

          {/* Sort: Most Wrong */}
          <Chip
            label="🔥 Most Wrong"
            active={sortMode === 'mostWrong'}
            onClick={() => setSortMode(s => s === 'mostWrong' ? 'default' : 'mostWrong')}
          />

          {/* Due Today */}
          <Chip
            label="📅 Due Today"
            active={dueFilter}
            onClick={() => setDueFilter(d => !d)}
          />
        </div>
      </div>

      {/* Row 3: dropdowns + AI toggle */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
        {subjects.length > 0 && (
          <FilterSelect
            label="Subject"
            value={subject}
            onChange={setSubject}
            options={[{ value: 'all', label: '📖 All Subjects' }, ...subjects.map(s => ({ value: s, label: s }))]}
          />
        )}
        {questionTypes.length > 0 && (
          <FilterSelect
            label="Question Type"
            value={qType}
            onChange={setQType}
            options={[{ value: 'all', label: '🏷️ All Types' }, ...questionTypes.map(t => ({ value: t, label: t }))]}
          />
        )}
        <FilterSelect
          label="Time"
          value={time}
          onChange={v => setTime(v as TimeFilter)}
          options={[
            { value: 'all', label: '⏳ All Time' },
            { value: 'today', label: '📅 Today' },
            { value: 'this_week', label: '📆 This Week' },
            { value: '7d', label: '📆 Last 7 Days' },
            { value: 'this_month', label: '🗓️ This Month' },
            { value: '30d', label: '🗓️ Last 30 Days' },
            { value: 'custom', label: '🎯 Custom Date' },
          ]}
        />
        <button
          onClick={() => setAiImportant(v => !v)}
          className={`flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border whitespace-nowrap transition-all active:scale-95 ${
            aiImportant
              ? 'bg-purple-500/20 border-purple-500/40 text-purple-400'
              : 'bg-card border-border text-foreground/50'
          }`}
        >
          <Bot className="w-3.5 h-3.5" /> AI Priority
        </button>
      </div>

      {/* Custom date range inputs */}
      {time === 'custom' && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] font-bold text-foreground/40 uppercase">From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="text-[11px] font-bold bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary/40" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] font-bold text-foreground/40 uppercase">To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="text-[11px] font-bold bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary/40" />
          </div>
          <p className="text-[9px] text-foreground/25 font-bold">Leave "To" empty for single date</p>
        </div>
      )}

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Total', value: total, color: 'text-foreground' },
          { label: 'Known', value: knownCount, color: 'text-emerald-400' },
          { label: 'Review', value: reviewCount, color: 'text-orange-400' },
          { label: 'Mastery', value: `${accuracyEst}%`, color: 'text-primary' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-2.5 text-center">
            <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
            <div className="text-[8px] text-foreground/30 uppercase tracking-widest font-bold">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Due Review Countdown ── */}
      {(() => {
        const srSnap = srData;
        const now = Date.now();
        const dueNow = allCards.filter(c => {
          const sr = srSnap[hashQuestion(c.question)];
          return sr && sr.nextReview <= now;
        }).length;
        const upcoming = allCards.filter(c => {
          const sr = srSnap[hashQuestion(c.question)];
          return sr && sr.nextReview > now && sr.nextReview <= now + 86400000;
        }).length;
        if (dueNow === 0 && upcoming === 0) return null;
        return (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-violet-500/8 border border-violet-500/20 rounded-xl animate-fade-in">
            <span className="text-sm">📅</span>
            <div className="flex-1 flex items-center gap-2 text-[11px] font-bold">
              {dueNow > 0 && <span className="text-violet-400">{dueNow} due now</span>}
              {dueNow > 0 && upcoming > 0 && <span className="text-foreground/15">·</span>}
              {upcoming > 0 && <span className="text-foreground/40">{upcoming} due tomorrow</span>}
            </div>
          </div>
        );
      })()}

      {/* ── Progress Bar ── */}
      {total > 0 && (
        <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden mb-4">
          <div className="h-full bg-primary/60 rounded-full transition-all duration-300" style={{ width: `${((currentIdx + 1) / total) * 100}%` }} />
        </div>
      )}

      {/* ── Card or Empty ── */}
      {total === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-10 flex flex-col items-center text-center">
          <span className="text-3xl mb-3">🔍</span>
          <h3 className="text-sm font-black text-foreground mb-1">No cards match filters</h3>
          <p className="text-xs text-foreground/40 max-w-xs">Try changing your source, difficulty, or time filters.</p>
        </div>
      ) : current && (
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <FlashCard
            card={current}
            isFlipped={isFlipped}
            onFlip={() => setIsFlipped(f => !f)}
            progress={progress[currentHash]}
            srInfo={srData[currentHash]}
            cardNumber={currentIdx + 1}
            totalCards={total}
          />
        </div>
      )}

      {/* ── Navigation Dots ── */}
      {total > 0 && total <= 30 && (
        <div className="flex items-center justify-center gap-1 mt-3 flex-wrap">
          {allCards.map((_, i) => {
            const h = hashQuestion(allCards[i].question);
            const p = progress[h];
            return (
              <button key={i} onClick={() => { setIsFlipped(false); setTimeout(() => setCurrentIdx(i), 100); }}
                className={`rounded-full transition-all ${
                  i === currentIdx ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'
                } ${
                  i === currentIdx ? 'bg-primary scale-125' :
                  p === 'known' ? 'bg-emerald-500/60' :
                  p === 'review' ? 'bg-orange-500/60' :
                  'bg-foreground/15'
                }`}
              />
            );
          })}
        </div>
      )}

      {/* ── Navigation ── */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-2 mt-4">
          <button onClick={handlePrev} disabled={currentIdx === 0}
            className="flex items-center gap-1.5 bg-card border border-border text-foreground/60 font-bold text-sm px-4 py-3 rounded-xl hover:bg-foreground/5 disabled:opacity-25 transition-all active:scale-[0.97]">
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>

          <div className="flex gap-2">
            <button onClick={() => markCard('review')}
              className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/25 text-orange-400 font-bold text-xs px-3 py-3 rounded-xl hover:bg-orange-500/15 transition-all active:scale-[0.97]">
              ↻ Review
            </button>
            <button onClick={() => setIsFlipped(f => !f)}
              className="flex items-center gap-1.5 bg-foreground/5 border border-border text-foreground/50 font-bold text-xs px-3 py-3 rounded-xl hover:bg-foreground/10 transition-all active:scale-[0.97]">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            {/* Reset single card — always visible */}
            {current && (
              <button onClick={() => {
                const p = { ...progress };
                delete p[currentHash];
                setProgress(p);
                saveProgress(p);
                const sr = { ...srData };
                delete sr[currentHash];
                setSrData(sr);
                saveSR(sr);
                hapticTap();
                toast.success('Card reset to unmarked');
              }}
                className={`flex items-center gap-1.5 font-bold text-xs px-2.5 py-3 rounded-xl transition-all active:scale-[0.97] ${
                  progress[currentHash]
                    ? progress[currentHash] === 'known'
                      ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400/70 hover:bg-emerald-500/20'
                      : 'bg-orange-500/10 border border-orange-500/25 text-orange-400/70 hover:bg-orange-500/20'
                    : 'bg-foreground/5 border border-border text-foreground/25 hover:text-foreground/50 hover:bg-foreground/10'
                }`}
                title="Reset this card"
              >
                <RotateCw className="w-3 h-3" />
              </button>
            )}
            <button onClick={() => markCard('known')}
              className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold text-xs px-3 py-3 rounded-xl hover:bg-emerald-500/15 transition-all active:scale-[0.97]">
              ✓ Know It
            </button>
          </div>

          <button onClick={handleNext} disabled={currentIdx >= total - 1}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground font-bold text-sm px-4 py-3 rounded-xl hover:brightness-110 disabled:opacity-25 transition-all active:scale-[0.97]">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Completion ── */}
      {total > 0 && currentIdx === total - 1 && isFlipped && (
        <div className="mt-4 bg-primary/10 border border-primary/25 rounded-xl p-4 text-center animate-fade-in">
          <p className="text-sm font-bold text-foreground">🎉 You've reviewed all {total} flashcards!</p>
          <p className="text-xs text-foreground/40 mt-1">{knownCount} known · {reviewCount} to review · {total - knownCount - reviewCount} unmarked</p>
          <button onClick={() => { setSource('random20'); }} className="mt-3 text-xs font-bold text-primary hover:text-primary/80 transition-colors">
            🔀 Random 20 cards
          </button>
        </div>
      )}

      {/* Swipe hint */}
      {total > 0 && currentIdx === 0 && !isFlipped && (
        <p className="text-center text-[10px] text-foreground/20 mt-3">
          👈 Swipe left = Still Learning · Swipe right = Know It 👉
        </p>
      )}
      </>}

      {/* Reset All Confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Reset All Flashcard Progress?</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/60">
              This will reset {knownCount + reviewCount} marked cards back to unmarked. Your quiz history is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground/60">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => {
                setProgress({});
                saveProgress({});
                setSrData({});
                saveSR({});
                toast.success('All flashcard progress reset ✓');
              }}
            >
              Reset All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
