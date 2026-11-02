import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Flag, Settings2, Square, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useImageZoom } from './ImageWithZoom';

interface Props {
  isFlagged: boolean;
  onToggleFlag: () => void;
  onEditSettings?: () => void;
  onPause: () => void;
  onFinish: () => void;
  // Image zoom
  hasImage: boolean;
  imgZoom: ReturnType<typeof useImageZoom>;
}

export default function QuizHeaderMobileMenu({
  isFlagged, onToggleFlag, onEditSettings, onPause, onFinish,
  hasImage, imgZoom,
}: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  return (
    <div className="relative sm:hidden" ref={menuRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="More options"
        className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-all active:scale-90 ${
          open
            ? 'bg-primary/15 border-primary/30 text-primary'
            : isFlagged
            ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
            : 'bg-foreground/5 border-foreground/10 text-foreground/30'
        }`}
      >
        <MoreVertical className="w-4 h-4" />
        {/* Active indicator dot */}
        {isFlagged && !open && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-11 z-50 w-52 bg-card border border-border rounded-2xl shadow-xl shadow-black/30 overflow-hidden animate-fade-in">
          {/* Flag */}
          <button
            onClick={() => { onToggleFlag(); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors active:bg-foreground/5 ${
              isFlagged ? 'text-amber-400' : 'text-foreground/60'
            }`}
          >
            <Flag className="w-4 h-4" />
            {isFlagged ? 'Remove Flag' : 'Flag for Review'}
            {isFlagged && (
              <span className="ml-auto w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Finish */}
          <button
            onClick={() => { onFinish(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-foreground/60 transition-colors active:bg-foreground/5"
          >
            <Square className="w-4 h-4" />
            Finish Quiz
          </button>

          {/* Edit Settings */}
          {onEditSettings && (
            <>
              <div className="h-px bg-border" />
              <button
                onClick={() => { onPause(); onEditSettings(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-foreground/60 transition-colors active:bg-foreground/5"
              >
                <Settings2 className="w-4 h-4" />
                Edit Settings
              </button>
            </>
          )}

          {/* Image Zoom */}
          {hasImage && (
            <>
              <div className="h-px bg-border" />
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest mb-2">Image Zoom</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => imgZoom.zoomOut()}
                    disabled={imgZoom.atMin}
                    className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground/5 border border-foreground/10 text-foreground/40 disabled:opacity-25 transition-all active:scale-90"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="flex-1 text-center text-xs font-bold text-foreground/50 tabular-nums">
                    {Math.round(imgZoom.scale * 100)}%
                  </span>
                  <button
                    onClick={() => imgZoom.zoomIn()}
                    disabled={imgZoom.atMax}
                    className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground/5 border border-foreground/10 text-foreground/40 disabled:opacity-25 transition-all active:scale-90"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => imgZoom.resetZoom()}
                    className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground/5 border border-foreground/10 text-foreground/40 transition-all active:scale-90"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
