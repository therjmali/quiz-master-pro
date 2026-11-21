import { memo, useMemo } from 'react';

/** More segments than this are grouped, so every block stays a readable width on a phone. */
export const MAX_SEGMENTS = 60;

export interface Segment { state: 'none' | 'part' | 'done'; fill: number; current: boolean }

/**
 * One block per question (grouped when there are more than MAX_SEGMENTS):
 * unattempted = neutral, attempted = primary, a group that is only partly answered fills proportionally.
 * Pure function so it can be unit-tested.
 */
export function buildSegments(answered: readonly boolean[], current: number, max = MAX_SEGMENTS): Segment[] {
  const n = answered.length;
  if (n === 0) return [];
  const size = n <= max ? 1 : Math.ceil(n / max);
  const out: Segment[] = [];
  for (let start = 0; start < n; start += size) {
    const end = Math.min(n, start + size);
    let done = 0;
    for (let i = start; i < end; i++) if (answered[i]) done++;
    const count = end - start;
    out.push({
      state: done === 0 ? 'none' : done === count ? 'done' : 'part',
      fill: Math.round((done / count) * 100),
      current: current >= start && current < end,
    });
  }
  return out;
}

interface Props {
  /** answered[i] is true when question i has an answer */
  answered: readonly boolean[];
  currentIndex: number;
}

function SegmentedProgress({ answered, currentIndex }: Props) {
  const segs = useMemo(() => buildSegments(answered, currentIndex), [answered, currentIndex]);
  const answeredCount = useMemo(() => answered.filter(Boolean).length, [answered]);
  return (
    <div
      className={`qh-seg-track ${segs.length > 40 ? 'is-dense' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={answered.length}
      aria-valuenow={answeredCount}
      aria-label="Questions answered"
      data-testid="quiz-progress"
    >
      {segs.map((s, i) => (
        <div
          key={i}
          data-seg={s.state}
          data-current={s.current ? 'true' : undefined}
          className={`qh-seg ${s.state === 'done' ? 'is-done' : s.state === 'part' ? 'is-part' : ''} ${s.current ? 'is-cur' : ''}`}
          style={s.state === 'part' ? ({ ['--fill' as string]: `${s.fill}%` } as React.CSSProperties) : undefined}
        />
      ))}
    </div>
  );
}

export default memo(SegmentedProgress);
