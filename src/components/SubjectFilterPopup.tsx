import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SubjectOption {
  name: string;
  count: number;
  avg: number;
}

interface Props {
  subjects: SubjectOption[];
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}

export default function SubjectFilterPopup({ subjects, value, onChange, onClose }: Props) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start pt-16 sm:pt-24 justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-3xl p-5 w-full max-w-sm max-h-[70vh] overflow-y-auto shadow-2xl animate-fade-in mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-foreground">Filter by Subject</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-all"
          >
            <X className="w-4 h-4 text-foreground/50" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { onChange('all'); onClose(); }}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
              value === 'all'
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-foreground/[0.03] border-border text-foreground/50'
            }`}
          >
            📋 All Subjects
          </button>
          {subjects.map(s => (
            <button
              key={s.name}
              onClick={() => { onChange(s.name); onClose(); }}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                value === s.name
                  ? 'bg-primary/15 border-primary/30 text-primary'
                  : 'bg-foreground/[0.03] border-border text-foreground/50'
              }`}
            >
              {s.name} <span className="text-[9px] opacity-60">({s.count}) · {s.avg}%</span>
            </button>
          ))}
        </div>
        {value !== 'all' && (
          <button
            onClick={() => { onChange('all'); onClose(); }}
            className="mt-4 w-full text-center text-xs font-bold text-destructive/70 hover:text-destructive transition-colors py-2"
          >
            Clear Subject Filter
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
