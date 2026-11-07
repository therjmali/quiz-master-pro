import { useState, useEffect, useCallback } from 'react';
import { Clock, Flag, Settings2, LogOut, Pause, Play, Bookmark, Pencil, ZoomIn } from 'lucide-react';
import { formatTimeColon } from '../../utils/scoring';
import { QuizSettings } from '../../types/quiz';
import CountdownCircle from './CountdownCircle';
import { useZoom, ZOOM_DEFAULT } from '../../platform/zoom';

interface Props {
  currentIndex: number;
  totalQuestions: number;
  answeredCount: number;
  settings: QuizSettings;
  isLiveMode: boolean;
  // Timer
  timeLeft: number;
  perQTotal: number;
  accumulatedTime: number;
  totalTimeLeft: number;
  totalTimerColor: string;
  totalTimerBg: string;
  totalTimerPct: number;
  // Flags
  isFlagged: boolean;
  onToggleFlag: () => void;
  // Bookmark
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  // Controls
  isPaused: boolean;
  onTogglePause: () => void;
  onPause: () => void;
  onFinish: () => void;
  onExit: () => void;
  onEditSettings?: () => void;
  onEditQuestion?: () => void;
  currentDifficulty?: string;
  /** Incremented each time auto-save fires */
  saveSignal?: number;
}

const diffDot = (d?: string) =>
  d === 'easy' ? '🟢' : d === 'hard' ? '🔴' : '🟡';

export default function PremiumHeader({
  currentIndex, totalQuestions, answeredCount, settings, isLiveMode,
  timeLeft, perQTotal, accumulatedTime,
  totalTimeLeft, totalTimerColor, totalTimerBg, totalTimerPct,
  isFlagged, onToggleFlag,
  isBookmarked, onToggleBookmark,
  isPaused, onTogglePause,
  onPause, onFinish, onExit, onEditSettings, onEditQuestion,
  currentDifficulty,
  saveSignal = 0,
}: Props) {
  const [showSaved, setShowSaved] = useState(false);
  const zoom = useZoom();
  const isDefault = zoom === ZOOM_DEFAULT;

  useEffect(() => {
    if (saveSignal <= 0) return;
    setShowSaved(true);
    const id = setTimeout(() => setShowSaved(false), 1800);
    return () => clearTimeout(id);
  }, [saveSignal]);

  return (
    <div className="premium-quiz-header flex-shrink-0 sticky top-0 z-30">
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 gap-1.5">
        {/* ── Left: Q number + difficulty dot ── */}
        <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
          {settings.timerMode === 'per-question' && (
            <CountdownCircle timeLeft={timeLeft} totalTime={perQTotal} />
          )}
          <span className="text-sm font-black text-foreground leading-none tracking-tight whitespace-nowrap">
            Q{currentIndex + 1}
            <span className="text-foreground/25 font-semibold text-xs">/{totalQuestions}</span>
          </span>
          <span
            className="text-xs leading-none flex-shrink-0"
            title={currentDifficulty || 'medium'}
            aria-label={`Difficulty: ${currentDifficulty || 'medium'}`}
          >
            {diffDot(currentDifficulty)}
          </span>
          {showSaved && (
            <span className="text-[9px] font-bold text-emerald-400/80 animate-pulse whitespace-nowrap hidden xs:inline">
              💾
            </span>
          )}

          {/* Zoom level badge — tap to open the zoom panel */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('qmp:zoom-panel'))}
            className={`zoom-pct-badge inline-flex ${isDefault ? 'zoom-pct-default' : ''}`}
            title={`Zoom ${zoom}% — tap to adjust`}
            aria-label={`Interface zoom ${zoom} percent. Tap to adjust`}
          >
            <ZoomIn className="w-3 h-3 mr-1" aria-hidden="true" />
            {zoom}
          </button>
        </div>

        {/* ── Right: timer + action icons ── */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Timer */}
          {settings.timerMode === 'total' ? (
            <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs ${totalTimerBg} ${totalTimerPct < 0.25 ? 'animate-pulse' : ''}`}>
              <Clock className={`w-3 h-3 flex-shrink-0 ${totalTimerColor}`} aria-hidden="true" />
              <span className={`font-mono font-black ${totalTimerColor} tabular-nums`}>
                {formatTimeColon(totalTimeLeft)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.04] text-xs">
              <Clock className="w-3 h-3 text-emerald-400/60 flex-shrink-0" aria-hidden="true" />
              <span className="font-mono font-bold text-emerald-400 tabular-nums">
                {formatTimeColon(accumulatedTime)}
              </span>
            </div>
          )}

          {/* Flag */}
          <button
            onClick={onToggleFlag}
            aria-label={isFlagged ? 'Unflag' : 'Flag for review'}
            className={`prem-icon-btn !w-8 !h-8 !rounded-lg ${
              isFlagged
                ? '!bg-amber-500/20 !border-amber-500/40 !text-amber-400'
                : ''
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
          </button>

          {/* Bookmark */}
          <button
            onClick={onToggleBookmark}
            aria-label={isBookmarked ? 'Remove Bookmark' : 'Bookmark'}
            className={`prem-icon-btn !w-8 !h-8 !rounded-lg ${
              isBookmarked
                ? '!bg-violet-500/20 !border-violet-500/40 !text-violet-400'
                : ''
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" fill={isBookmarked ? 'currentColor' : 'none'} />
          </button>

          {/* Edit Question */}
          {onEditQuestion && (
            <button
              onClick={onEditQuestion}
              aria-label="Edit question"
              className="prem-icon-btn !w-8 !h-8 !rounded-lg hidden xs:flex"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Settings */}
          {onEditSettings && (
            <button
              onClick={() => { onPause(); onEditSettings(); }}
              aria-label="Edit quiz settings"
              className="prem-icon-btn !w-8 !h-8 !rounded-lg hidden xs:flex"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Pause / Resume — icon only */}
          <button
            onClick={onTogglePause}
            aria-label={isPaused ? 'Resume quiz' : 'Pause quiz'}
            className={`prem-icon-btn !w-8 !h-8 !rounded-lg ${
              isPaused
                ? '!bg-emerald-500/20 !border-emerald-500/40 !text-emerald-400'
                : '!bg-amber-500/8 !border-amber-500/20 !text-amber-400/60'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          {/* Exit — icon only */}
          <button
            onClick={() => { onPause(); onExit(); }}
            aria-label="Exit quiz"
            className="prem-icon-btn !w-8 !h-8 !rounded-lg !border-red-500/20 !bg-red-500/8 !text-red-400"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
