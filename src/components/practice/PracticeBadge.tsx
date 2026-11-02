import { getPracticeLabel } from '../../utils/practiceNaming';

interface Props {
  attemptNumber: number;
  timestamp?: number;
  size?: 'sm' | 'md';
}

export default function PracticeBadge({ attemptNumber, timestamp, size = 'sm' }: Props) {
  const label = getPracticeLabel(attemptNumber, timestamp);
  const isSm = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold border rounded-lg leading-none ${
        isSm
          ? 'text-[9px] px-1.5 py-0.5'
          : 'text-[11px] px-2.5 py-1'
      } bg-amber-500/15 text-amber-400 border-amber-500/25`}
    >
      <span className={isSm ? 'text-[9px]' : 'text-xs'}>🏋️</span>
      {label}
    </span>
  );
}
