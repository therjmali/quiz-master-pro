import { useState, useEffect, useRef } from 'react';
import { Clock, Flag, Settings2, LogOut, Pause, Play, Bookmark, Pencil, ZoomIn, MoreHorizontal, ChevronDown } from 'lucide-react';
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
  /** Question navigator (palette) open state — the title block toggles it. */
  navOpen?: boolean;
  onToggleNav?: () => void;
  /** Incremented each time auto-save fires */
  saveSignal?: number;
}

const diffDot = (d?: string) =>
  d === 'easy' ? '🟢' : d === 'hard' ? '🔴' : '🟡';

/** Progress ring used when there is no per-question countdown. */
function ProgressRing({ pct }: { pct: number }) {
  const r = 19; const c = 2 * Math.PI * r;
  return (
    <div className="qh-ring" role="img" aria-label={`${Math.round(pct)} percent answered`}>
      <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4.5" stroke="currentColor" className="text-foreground/10" />
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4.5" strokeLinecap="round" stroke="hsl(var(--primary))"
          strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, Math.max(0, pct))) / 100}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span className="qh-ring-label" aria-hidden="true">{Math.round(pct)}<small>%</small></span>
    </div>
  );
}

export default function PremiumHeader({
  currentIndex, totalQuestions, answeredCount, settings, isLiveMode: _isLiveMode,
  timeLeft, perQTotal, accumulatedTime,
  totalTimeLeft, totalTimerColor, totalTimerBg, totalTimerPct,
  isFlagged, onToggleFlag,
  isBookmarked, onToggleBookmark,
  isPaused, onTogglePause,
  onPause, onFinish: _onFinish, onExit, onEditSettings, onEditQuestion,
  currentDifficulty, navOpen = false, onToggleNav,
  saveSignal = 0,
}: Props) {
  const [showSaved, setShowSaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const zoom = useZoom();
  const isDefault = zoom === ZOOM_DEFAULT;

  useEffect(() => {
    if (saveSignal <= 0) return;
    setShowSaved(true);
    const id = setTimeout(() => setShowSaved(false), 1800);
    return () => clearTimeout(id);
  }, [saveSignal]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const perQ = settings.timerMode === 'per-question';
  const answeredPct = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  const posPct = totalQuestions > 1 ? (currentIndex / (totalQuestions - 1)) * 100 : 0;
  const left = totalQuestions - answeredCount;
  const closeAnd = (fn?: () => void) => () => { setMenuOpen(false); fn?.(); };

  return (
    <div className="qh premium-quiz-header flex-shrink-0 sticky top-0 z-30">
      <div className="qh-row">
        {/* ── Lead: ring + question + stats (tap = question navigator) ── */}
        <button
          type="button"
          onClick={onToggleNav}
          aria-expanded={navOpen}
          aria-controls="qnav-grid"
          aria-label={`Question ${currentIndex + 1} of ${totalQuestions}. ${answeredCount} answered. ${navOpen ? 'Hide' : 'Show'} question navigator`}
          className="qh-lead"
        >
          {perQ ? <CountdownCircle timeLeft={timeLeft} totalTime={perQTotal} /> : <ProgressRing pct={answeredPct} />}
          <span className="qh-text">
            <span className="qh-title">
              Q{currentIndex + 1}<span className="qh-of">/{totalQuestions}</span>
              <span className="qh-dot" title={currentDifficulty || 'medium'} aria-hidden="true">{diffDot(currentDifficulty)}</span>
              {showSaved && <span className="qh-saved" aria-hidden="true">💾</span>}
            </span>
            <span className="qh-sub"><span className="qh-s-wide">{answeredCount} answered · {left} left</span><span className="qh-s-narrow">{answeredCount}✓ · {left} left</span></span>
          </span>
          <ChevronDown className={`qh-chev ${navOpen ? 'is-open' : ''}`} aria-hidden="true" />
        </button>

        {/* ── Timer pill ── */}
        {settings.timerMode === 'total' ? (
          <div className={`qh-pill ${totalTimerBg} ${totalTimerPct < 0.25 ? 'animate-pulse' : ''}`} role="timer" aria-label="Total time left">
            <Clock className={`w-3.5 h-3.5 flex-shrink-0 ${totalTimerColor}`} aria-hidden="true" />
            <span className={`font-mono font-black ${totalTimerColor} tabular-nums`}>{formatTimeColon(totalTimeLeft)}</span>
          </div>
        ) : (
          <div className="qh-pill qh-pill-elapsed" aria-label="Time elapsed">
            <Clock className="w-3.5 h-3.5 text-emerald-400/70 flex-shrink-0" aria-hidden="true" />
            <span className="font-mono font-bold text-emerald-400 tabular-nums">{formatTimeColon(accumulatedTime)}</span>
          </div>
        )}

        {/* ── Actions: bookmark · pause · exit stay outside; everything else lives in the ⋯ menu (same in every orientation) ── */}
        <div className="qh-actions">
          <button onClick={onToggleBookmark} aria-label={isBookmarked ? 'Remove Bookmark' : 'Bookmark'} aria-pressed={isBookmarked}
            className={`qh-btn ${isBookmarked ? 'is-mark' : ''}`}><Bookmark className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} /></button>
          <button onClick={onTogglePause} aria-label={isPaused ? 'Resume quiz' : 'Pause quiz'} aria-pressed={isPaused}
            className={`qh-btn ${isPaused ? 'is-resume' : 'is-pause'}`}>{isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}</button>

          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(o => !o)} aria-label="More options" aria-haspopup="menu" aria-expanded={menuOpen}
              className={`qh-btn ${menuOpen ? 'is-open' : ''} ${isFlagged && !menuOpen ? 'has-flag' : ''}`}>
              <MoreHorizontal className="w-4 h-4" />
              {isFlagged && <span className="qh-flagdot" aria-hidden="true" />}
            </button>
            {menuOpen && (
              <div role="menu" className="qh-menu">
                <button role="menuitem" className={`qh-menu-item ${isFlagged ? 'is-on' : ''}`} onClick={closeAnd(onToggleFlag)}>
                  <Flag className="w-4 h-4" fill={isFlagged ? 'currentColor' : 'none'} />{isFlagged ? 'Remove flag' : 'Flag for review'}
                </button>
                {onEditQuestion && (
                  <button role="menuitem" className="qh-menu-item" onClick={closeAnd(onEditQuestion)}><Pencil className="w-4 h-4" />Edit question</button>
                )}
                {onEditSettings && (
                  <button role="menuitem" className="qh-menu-item" onClick={closeAnd(() => { onPause(); onEditSettings(); })}><Settings2 className="w-4 h-4" />Quiz settings</button>
                )}
                <button role="menuitem" className="qh-menu-item" onClick={closeAnd(() => window.dispatchEvent(new Event('qmp:zoom-panel')))}>
                  <ZoomIn className="w-4 h-4" />Interface zoom <span className={`ml-auto text-xs font-black ${isDefault ? 'text-foreground/40' : 'text-amber-500'}`}>{zoom}%</span>
                </button>
              </div>
            )}
          </div>

          <button onClick={() => { onPause(); onExit(); }} aria-label="Exit quiz" className="qh-btn is-exit"><LogOut className="w-4 h-4" /></button>
        </div>
      </div>

      {/* ── Progress track: answered fill + position marker ── */}
      <div className="qh-track" role="progressbar" aria-valuemin={0} aria-valuemax={totalQuestions} aria-valuenow={answeredCount} aria-label="Questions answered">
        <div className="qh-fill" style={{ width: `${answeredPct}%` }} />
        <div className="qh-marker" style={{ left: `calc(5px + (100% - 10px) * ${posPct / 100})` }} />
      </div>
    </div>
  );
}
