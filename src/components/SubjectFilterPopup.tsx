import { X } from 'lucide-react';
import Overlay from './ui/Overlay';

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
  return (
    <Overlay open onClose={onClose} kind="center" layer="sheet" className="max-w-sm" labelledBy="subject-filter-title" hideClose>
      <div className="qmp-panel-header">
        <h3 id="subject-filter-title" className="text-sm font-black text-foreground">Filter by Subject</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="qmp-panel-close-inline"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="qmp-panel-body p-5">
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
    </Overlay>
  );
}
