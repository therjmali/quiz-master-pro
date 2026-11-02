/**
 * ReportOrderControls — compact 2-option segmented control.
 * Blue-themed to match all popup triggers.
 */
import { ReportOrder } from '../types/quiz';

interface Props {
  value: ReportOrder;
  onChange: (v: ReportOrder) => void;
}

const OPTIONS: {
  value: ReportOrder;
  icon: string;
  label: string;
  desc: string;
  activeCls: string;
}[] = [
  {
    value: 'original',
    icon: '📖',
    label: 'Original',
    desc: 'As originally pasted — matches your physical book',
    activeCls: 'bg-blue-500/20 border-blue-500/30 text-blue-600 dark:text-blue-300 shadow-sm',
  },
  {
    value: 'attempt',
    icon: '🎯',
    label: 'Attempt',
    desc: 'As presented during your quiz attempt',
    activeCls: 'bg-orange-500/20 border-orange-500/30 text-orange-600 dark:text-orange-300 shadow-sm',
  },
];

export default function ReportOrderControls({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 bg-blue-500/10 border border-blue-500/20 rounded-xl p-1 flex-shrink-0">
      {OPTIONS.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)} title={opt.desc}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
            value === opt.value
              ? opt.activeCls
              : 'border-transparent text-foreground/35 hover:text-foreground/65 hover:bg-foreground/5'
          }`}>
          <span className="text-sm leading-none">{opt.icon}</span>
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
