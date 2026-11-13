import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { X, GripVertical, Check } from 'lucide-react';

interface ProgressState {
  active: boolean;
  label: string;
  percent: number;
  completed: boolean;
  resultAction?: () => void;
}

interface FloatingProgressContextType {
  startProgress: (label: string, onComplete?: () => void) => void;
  updateProgress: (percent: number) => void;
  completeProgress: (resultAction?: () => void) => void;
  dismiss: () => void;
}

const FloatingProgressContext = createContext<FloatingProgressContextType>({
  startProgress: () => {},
  updateProgress: () => {},
  completeProgress: () => {},
  dismiss: () => {},
});

export const useFloatingProgress = () => useContext(FloatingProgressContext);

export function FloatingProgressProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProgressState>({ active: false, label: '', percent: 0, completed: false });
  const autoDismissRef = useRef<ReturnType<typeof setTimeout>>();
  const onCompleteRef = useRef<(() => void) | undefined>();

  const dismiss = useCallback(() => {
    setState({ active: false, label: '', percent: 0, completed: false });
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
  }, []);

  const startProgress = useCallback((label: string, onComplete?: () => void) => {
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    onCompleteRef.current = onComplete;
    setState({ active: true, label, percent: 0, completed: false });
  }, []);

  const updateProgress = useCallback((percent: number) => {
    setState(prev => prev.active ? { ...prev, percent: Math.min(100, Math.max(0, percent)) } : prev);
  }, []);

  const completeProgress = useCallback((resultAction?: () => void) => {
    setState(prev => prev.active ? { ...prev, percent: 100, completed: true, resultAction } : prev);
    onCompleteRef.current?.();
    autoDismissRef.current = setTimeout(dismiss, 5000);
  }, [dismiss]);

  useEffect(() => () => { if (autoDismissRef.current) clearTimeout(autoDismissRef.current); }, []);

  return (
    <FloatingProgressContext.Provider value={{ startProgress, updateProgress, completeProgress, dismiss }}>
      {children}
      {state.active && <FloatingPopup state={state} onDismiss={dismiss} />}
    </FloatingProgressContext.Provider>
  );
}

function FloatingPopup({ state, onDismiss }: { state: ProgressState; onDismiss: () => void }) {
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState({ x: 16, y: 80 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const popupRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const x = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - offset.current.x));
    const y = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - offset.current.y));
    setPos({ x, y });
  };

  const handlePointerUp = () => { dragging.current = false; };

  const handleClick = () => {
    if (state.completed && state.resultAction) {
      state.resultAction();
      onDismiss();
    } else {
      setMinimized(prev => !prev);
    }
  };

  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (state.percent / 100) * circumference;

  if (minimized) {
    return (
      <div
        ref={popupRef}
        style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
        className="fixed z-[calc(var(--qmp-z-sheet)-5)] select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <button
          onClick={handleClick}
          className={`relative w-12 h-12 rounded-full shadow-xl border-2 flex items-center justify-center transition-all active:scale-90 ${
            state.completed
              ? 'bg-emerald-500 border-emerald-400 text-white animate-pulse'
              : 'bg-card border-primary/40 text-primary'
          }`}
        >
          <svg className="absolute inset-0 w-12 h-12 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.15" />
            <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="3"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              strokeLinecap="round" className="transition-all duration-300" />
          </svg>
          <span className="text-[11px] font-black z-10">{state.completed ? <Check className="w-4 h-4" /> : `${Math.round(state.percent)}%`}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={popupRef}
      style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
      className="fixed z-[calc(var(--qmp-z-sheet)-5)] select-none"
    >
      <div className={`rounded-2xl shadow-2xl border-2 p-3 min-w-[200px] max-w-[260px] backdrop-blur-xl transition-all ${
        state.completed ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-card/95 border-primary/20'
      }`}>
        {/* Drag handle */}
        <div
          className="flex items-center gap-2 cursor-grab active:cursor-grabbing mb-2"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <GripVertical className="w-3.5 h-3.5 text-foreground/20 flex-shrink-0" />
          <span className="text-[10px] font-black text-foreground/50 uppercase tracking-wider flex-1 truncate">{state.label}</span>
          <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} className="text-foreground/20 hover:text-foreground/50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress circle + info */}
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 flex-shrink-0">
            <svg className="w-11 h-11 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/10" />
              <circle cx="24" cy="24" r="18" fill="none" strokeWidth="3"
                stroke={state.completed ? '#10b981' : 'hsl(var(--primary))'}
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                strokeLinecap="round" className="transition-all duration-300" />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black ${state.completed ? 'text-emerald-500' : 'text-primary'}`}>
              {state.completed ? '✓' : `${Math.round(state.percent)}%`}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-bold ${state.completed ? 'text-emerald-500' : 'text-foreground/70'}`}>
              {state.completed ? 'Complete!' : 'Processing…'}
            </p>
            {state.completed && state.resultAction && (
              <button onClick={handleClick} className="text-[10px] font-bold text-primary hover:underline mt-0.5">
                Tap to view →
              </button>
            )}
          </div>
          <button
            onClick={() => setMinimized(true)}
            className="text-[9px] font-bold text-foreground/30 hover:text-foreground/50 transition-colors px-1.5 py-1 rounded-lg border border-border"
          >
            Min
          </button>
        </div>
      </div>
    </div>
  );
}
