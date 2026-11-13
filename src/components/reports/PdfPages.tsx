import { memo, useEffect, useRef, useState } from 'react';
import { segmentText, type FontSet } from '../../utils/reports/pdf/fontSet';
import type { Op, Page } from '../../utils/reports/pdf/types';
import type { FaceKey } from '../../utils/reports/pdf/reportFonts';
import { browserFontSource } from '../../utils/reports/pdf/browserFonts';

const registered = new Map<string, Promise<void>>();
/** Makes the bundled report fonts available to SVG text, so the preview shows exactly what the PDF will. */
export function ensureFontFaces(keys: string[]): Promise<void[]> {
  return Promise.all(keys.map(k => {
    let p = registered.get(k);
    if (!p) {
      p = browserFontSource.load(k as FaceKey).then(async bytes => {
        const ff = new FontFace(`rjr-${k}`, bytes.buffer as ArrayBuffer);
        await ff.load();
        document.fonts.add(ff);
      });
      p.catch(() => registered.delete(k));
      registered.set(k, p);
    }
    return p;
  }));
}

function OpView({ op, set }: { op: Op; set: FontSet }) {
  if (op.t === 'rect') return <rect x={op.x} y={op.y} width={op.w} height={op.h} rx={op.r} fill={op.fill ?? 'none'} fillOpacity={op.opacity} stroke={op.stroke} strokeWidth={op.sw} />;
  if (op.t === 'line') return <line x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={op.color} strokeWidth={op.w} strokeDasharray={op.dash?.join(' ')} />;
  if (op.t === 'circle') return <circle cx={op.x} cy={op.y} r={op.r} fill={op.fill ?? 'none'} fillOpacity={op.opacity} stroke={op.stroke} strokeWidth={op.sw} />;
  let x = op.x;
  return (
    <>
      {segmentText(op.text, op.bold, set).map((seg, i) => {
        const el = <text key={i} x={x} y={op.y} fontSize={op.size} fill={op.color} fillOpacity={op.opacity} style={{ fontFamily: `rjr-${seg.face.id}, Inter, sans-serif`, whiteSpace: 'pre' }}>{seg.text}</text>;
        x += seg.face.width(seg.text, op.size);
        return el;
      })}
    </>
  );
}

interface PageProps { page: Page; set: FontSet; width: number; index: number; onVisible: (i: number) => void }

/** One A4/Letter page. Heavy SVG content is only mounted while the page is near the viewport. */
export const PageView = memo(function PageView({ page, set, width, index, onVisible }: PageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(index < 2);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const near = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setNear(true); }), { rootMargin: '1200px 0px' });
    const vis = new IntersectionObserver(es => es.forEach(e => { if (e.intersectionRatio > 0.45) onVisible(index); }), { threshold: [0.45, 0.6] });
    near.observe(el); vis.observe(el);
    return () => { near.disconnect(); vis.disconnect(); };
  }, [index, onVisible]);
  const h = (width * page.height) / page.width;
  return (
    <div ref={ref} data-page={page.number} className="mx-auto mb-4 bg-white shadow-[0_6px_28px_rgba(0,0,0,0.22)] rounded-[3px] overflow-hidden" style={{ width, height: h }}>
      {near && (
        <svg viewBox={`0 0 ${page.width} ${page.height}`} width={width} height={h} role="img" aria-label={`Page ${page.number}`}>
          <rect width={page.width} height={page.height} fill="#ffffff" />
          {page.ops.map((op, i) => <OpView key={i} op={op} set={set} />)}
        </svg>
      )}
    </div>
  );
});
