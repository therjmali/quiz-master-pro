import { useState } from 'react';
import Overlay from './ui/Overlay';
import { X, Hand } from 'lucide-react';

const GESTURES = [
  { icon: '👆', name: 'Swipe Left / Right', desc: 'Navigate between tabs (Home, Library, Create, Stats, Profile)' },
  { icon: '👆', name: 'Swipe report preview', desc: 'Switch between report types (Full, Correct, Wrong, etc.)' },
  { icon: '👆', name: 'Swipe card left', desc: 'Delete quiz (Library)' },
  { icon: '👆👆', name: 'Double-tap', desc: 'Bookmark question (Review)' },
  { icon: '✋', name: 'Double-tap + button', desc: 'Reset FAB button to default position' },
  { icon: '✊', name: 'Long press', desc: 'Quick actions menu (Library)' },
  { icon: '📳', name: 'Shake phone', desc: 'Undo last delete' },
  { icon: '🤏', name: 'Pinch', desc: 'Zoom report preview' },
  { icon: '↕️', name: 'Pull down', desc: 'Refresh data' },
  { icon: '⌨️', name: '← → keys', desc: 'Navigate screens (desktop)' },
  { icon: '⌨️', name: 'Esc key', desc: 'Close report preview (desktop)' },
];

/** Gesture Shortcuts — renders a button that opens the tutorial modal */
export default function GestureShortcutsPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger button — embedded in settings */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-card border border-border hover:border-foreground/15 transition-all active:scale-[0.98] text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0">
          <Hand className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Gesture Shortcuts</p>
          <p className="text-[10px] text-foreground/40">Learn swipe, shake, pinch & keyboard shortcuts</p>
        </div>
        <span className="text-foreground/20 text-xs">→</span>
      </button>

      {/* Panel overlay */}
      <Overlay open={open} onClose={() => setOpen(false)} kind="sheet" layer="sheet" className="max-w-sm" label="Gesture shortcuts">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <div className="flex items-center gap-2">
                <span className="text-xl">✋</span>
                <div>
                  <h3 className="text-sm font-black text-foreground">Gesture Shortcuts</h3>
                  <p className="text-[10px] text-foreground/40">Navigate faster with gestures</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="qmp-panel-close-inline">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Gesture list */}
            <div className="qmp-panel-body max-h-[50vh] space-y-1 px-5 pb-3">
              {GESTURES.map((g, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm flex-shrink-0">
                    {g.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">{g.name}</p>
                    <p className="text-[10px] text-foreground/40">{g.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-2">
              <button
                onClick={() => setOpen(false)}
                className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-black transition-all active:scale-[0.97]"
              >
                Got it! 👍
              </button>
            </div>
      </Overlay>
    </>
  );
}
