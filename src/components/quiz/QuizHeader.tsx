import { Clock, Flag, Settings2, Square, Pause, Play, LogOut, Plus, Minus } from 'lucide-react';
import { formatTimeColon } from '../../utils/scoring';
import { QuizSettings } from '../../types/quiz';
import CountdownCircle from './CountdownCircle';
import { useImageZoom } from './ImageWithZoom';
import QuizHeaderMobileMenu from './QuizHeaderMobileMenu';

interface Props {
  currentIndex: number;
  totalQuestions: number;
  answeredCount: number;
  difficulty: string;
  isLiveMode: boolean;
  adaptiveDifficulty?: string;
  settings: QuizSettings;
  // Timer
  timeLeft: number;
  perQTotal: number;
  accumulatedTime: number;
  totalTimeLeft: number;
  totalTimerColor: string;
  totalTimerBg: string;
  totalTimerPct: number;
  // Score
  liveScore: { correct: number; wrong: number; net: number } | null;
  // Flags
  isFlagged: boolean;
  onToggleFlag: () => void;
  // Controls
  isPaused: boolean;
  onTogglePause: () => void;
  onPause: () => void;
  onFinish: () => void;
  onExit: () => void;
  onEditSettings?: () => void;
  // Image zoom
  hasImage: boolean;
  imgZoom: ReturnType<typeof useImageZoom>;
}

const diffDot = (d: string) => d === 'easy' ? '🟢' : d === 'hard' ? '🔴' : '🟡';

export default function QuizHeader({
  currentIndex, totalQuestions, answeredCount, difficulty, isLiveMode,
  adaptiveDifficulty, settings, timeLeft, perQTotal, accumulatedTime,
  totalTimeLeft, totalTimerColor, totalTimerBg, totalTimerPct,
  liveScore, isFlagged, onToggleFlag, isPaused, onTogglePause,
  onPause, onFinish, onExit, onEditSettings, hasImage, imgZoom,
}: Props) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-2 sm:px-5 py-2.5 border-b border-foreground/[0.06] gap-1.5">
      {/* Left: Q number + difficulty dot */}
      <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
        {settings.timerMode === 'per-question' && (
          <CountdownCircle timeLeft={timeLeft} totalTime={perQTotal} />
        )}
        <span className="text-sm font-black text-foreground leading-none tracking-tight whitespace-nowrap">
          Q{currentIndex + 1}
          <span className="text-foreground/25 font-semibold text-xs">/{totalQuestions}</span>
        </span>
        <span className="text-xs leading-none flex-shrink-0" title={difficulty} aria-label={`Difficulty: ${difficulty}`}>
          {diffDot(difficulty)}
        </span>
        {adaptiveDifficulty && (
          <span
            className="text-xs leading-none flex-shrink-0 hidden xs:inline"
            title={`Adaptive: ${adaptiveDifficulty}`}
            aria-label={`Adaptive difficulty: ${adaptiveDifficulty}`}
          >
            {adaptiveDifficulty === 'hard' ? '📈' : adaptiveDifficulty === 'easy' ? '📉' : '📊'}
          </span>
        )}
      </div>

      {/* Right: score + timer + controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Score / answered count — compact */}
        {liveScore ? (
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-foreground/5 bg-background/30 text-[11px] font-black">
            <span className="text-emerald-400">+{(liveScore.correct * settings.marksPerQuestion).toFixed(
              settings.marksPerQuestion % 1 !== 0 ? 1 : 0
            )}</span>
            {settings.negativeMarking && liveScore.wrong > 0 && (
              <span className="text-red-400">−{(liveScore.wrong * settings.negativeMarks).toFixed(2)}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg border border-foreground/5 bg-background/30 text-[11px] font-bold">
            <span className="text-foreground/70 font-black">{answeredCount}</span>
            <span className="text-foreground/20">/</span>
            <span className="text-foreground/40">{totalQuestions}</span>
          </div>
        )}

        {/* Timer */}
        {settings.timerMode === 'total' ? (
          <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs ${totalTimerBg} ${totalTimerPct < 0.25 ? 'animate-pulse' : ''}`}>
            <Clock className={`w-3 h-3 flex-shrink-0 ${totalTimerColor}`} aria-hidden="true" />
            <span className={`font-mono font-black ${totalTimerColor} tabular-nums`} aria-label={`Time remaining: ${formatTimeColon(totalTimeLeft)}`}>
              {formatTimeColon(totalTimeLeft)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-foreground/5 bg-background/30 text-xs">
            <Clock className="w-3 h-3 text-foreground/20 flex-shrink-0" aria-hidden="true" />
            <span className="font-mono font-bold text-emerald-300 tabular-nums" aria-label={`Elapsed time: ${formatTimeColon(accumulatedTime)}`}>
              {formatTimeColon(accumulatedTime)}
            </span>
          </div>
        )}

        {/* ── Desktop controls ── */}
        {hasImage && (
          <div className="hidden sm:flex items-center gap-0.5">
            <button onClick={imgZoom.zoomOut} disabled={imgZoom.atMin} aria-label="Zoom out"
              className="prem-icon-btn !w-8 !h-8 !rounded-lg disabled:opacity-25 disabled:cursor-not-allowed">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button onClick={imgZoom.resetZoom} aria-label="Reset zoom"
              className="prem-icon-btn !w-8 !h-8 !rounded-lg">
              <span className="text-[9px] font-bold tabular-nums">{Math.round(imgZoom.scale * 100)}%</span>
            </button>
            <button onClick={imgZoom.zoomIn} disabled={imgZoom.atMax} aria-label="Zoom in"
              className="prem-icon-btn !w-8 !h-8 !rounded-lg disabled:opacity-25 disabled:cursor-not-allowed">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Flag — desktop */}
        <button
          onClick={onToggleFlag}
          aria-label={isFlagged ? 'Remove flag' : 'Flag for review'}
          className={`hidden sm:flex prem-icon-btn !w-8 !h-8 !rounded-lg ${
            isFlagged ? '!bg-amber-500/20 !border-amber-500/40 !text-amber-400' : ''
          }`}
        >
          <Flag className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        {/* Settings — desktop */}
        {onEditSettings && (
          <button
            onClick={() => { onPause(); onEditSettings(); }}
            aria-label="Edit quiz settings"
            className="hidden sm:flex prem-icon-btn !w-8 !h-8 !rounded-lg"
          >
            <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}

        {/* Finish — desktop, icon only */}
        <button
          onClick={onFinish}
          aria-label="Finish quiz"
          className="hidden sm:flex prem-icon-btn !w-8 !h-8 !rounded-lg"
        >
          <Square className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        {/* Mobile overflow menu */}
        <QuizHeaderMobileMenu
          isFlagged={isFlagged}
          onToggleFlag={onToggleFlag}
          onEditSettings={onEditSettings}
          onPause={onPause}
          onFinish={onFinish}
          hasImage={hasImage}
          imgZoom={imgZoom}
        />

        {/* Pause/Resume — icon only */}
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
          className="prem-icon-btn !w-8 !h-8 !rounded-lg !border-red-500/20 !bg-red-500/10 !text-red-400"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
