/**
 * Vector icons for the report. The bundled PDF fonts have no emoji, so the status / difficulty / check / book
 * icons are drawn with plain shapes. The same ops are drawn by the PDF writer and the on-screen preview.
 */
import type { Op } from './types';
import type { CardStatus, Level } from './cardModel';

export type Decor =
  | { k: 'status'; status: CardStatus; cx: number; r: number }
  | { k: 'diff'; level: Level; cx: number; r: number }
  | { k: 'mark'; mark: 'ok' | 'no'; cx: number; r: number }
  | { k: 'book' | 'robot'; cx: number; r: number };

export const ICON_COLORS = {
  correct: '#16a34a', wrong: '#dc2626', skipped: '#ca8a04',
  easy: '#22c55e', medium: '#eab308', hard: '#ef4444',
  bookFill: '#ede9fe', bookLine: '#6d28d9', robotFill: '#cffafe', robotLine: '#0e7490',
};

const circle = (cx: number, cy: number, r: number, fill: string): Op => ({ t: 'circle', x: cx, y: cy, r, fill });
const seg = (x1: number, y1: number, x2: number, y2: number, w: number, color: string): Op => ({ t: 'line', x1, y1, x2, y2, w, color, cap: 'round' });

const check = (cx: number, cy: number, r: number, w: number, color: string): Op[] => [
  seg(cx - 0.5 * r, cy + 0.02 * r, cx - 0.12 * r, cy + 0.42 * r, w, color),
  seg(cx - 0.12 * r, cy + 0.42 * r, cx + 0.55 * r, cy - 0.4 * r, w, color),
];
const cross = (cx: number, cy: number, r: number, w: number, color: string): Op[] => [
  seg(cx - 0.42 * r, cy - 0.42 * r, cx + 0.42 * r, cy + 0.42 * r, w, color),
  seg(cx + 0.42 * r, cy - 0.42 * r, cx - 0.42 * r, cy + 0.42 * r, w, color),
];

/** Drawing ops for one decoration, centred at (x0 + cx, cy). */
export function decorOps(d: Decor, x0: number, cy: number): Op[] {
  const cx = x0 + d.cx, r = d.r;
  switch (d.k) {
    case 'status': {
      const fill = ICON_COLORS[d.status];
      const w = Math.max(0.9, r * 0.26);
      if (d.status === 'correct') return [circle(cx, cy, r, fill), ...check(cx, cy, r, w, '#ffffff')];
      if (d.status === 'wrong') return [circle(cx, cy, r, fill), ...cross(cx, cy, r, w, '#ffffff')];
      // skipped: two forward chevrons (⏭)
      const chev = (ox: number): Op[] => [seg(cx + ox - 0.22 * r, cy - 0.42 * r, cx + ox + 0.18 * r, cy, w, '#ffffff'), seg(cx + ox + 0.18 * r, cy, cx + ox - 0.22 * r, cy + 0.42 * r, w, '#ffffff')];
      return [circle(cx, cy, r, fill), ...chev(-0.22 * r), ...chev(0.3 * r)];
    }
    case 'diff':
      return [circle(cx, cy, r, ICON_COLORS[d.level])];
    case 'mark':
      return d.mark === 'ok' ? check(cx, cy, r, Math.max(1.3, r * 0.3), ICON_COLORS.correct) : cross(cx, cy, r, Math.max(1.3, r * 0.3), ICON_COLORS.wrong);
    case 'book': {
      const h = r * 1.5, pw = r * 0.95, top = cy - h / 2;
      return [
        { t: 'rect', x: cx - pw - 0.4, y: top, w: pw, h, fill: ICON_COLORS.bookFill, stroke: ICON_COLORS.bookLine, sw: 0.7, r: 1.2 },
        { t: 'rect', x: cx + 0.4, y: top, w: pw, h, fill: ICON_COLORS.bookFill, stroke: ICON_COLORS.bookLine, sw: 0.7, r: 1.2 },
        seg(cx - pw * 0.8, cy - h * 0.18, cx - pw * 0.2, cy - h * 0.18, 0.6, ICON_COLORS.bookLine),
        seg(cx - pw * 0.8, cy + h * 0.08, cx - pw * 0.2, cy + h * 0.08, 0.6, ICON_COLORS.bookLine),
        seg(cx + pw * 0.2, cy - h * 0.18, cx + pw * 0.8, cy - h * 0.18, 0.6, ICON_COLORS.bookLine),
        seg(cx + pw * 0.2, cy + h * 0.08, cx + pw * 0.8, cy + h * 0.08, 0.6, ICON_COLORS.bookLine),
      ];
    }
    case 'robot': {
      const s = r * 1.5;
      return [
        seg(cx, cy - s * 0.5, cx, cy - s * 0.75, 0.7, ICON_COLORS.robotLine),
        circle(cx, cy - s * 0.8, s * 0.1, ICON_COLORS.robotLine),
        { t: 'rect', x: cx - s * 0.65, y: cy - s * 0.5, w: s * 1.3, h: s * 1.05, fill: ICON_COLORS.robotFill, stroke: ICON_COLORS.robotLine, sw: 0.8, r: s * 0.24 },
        circle(cx - s * 0.25, cy - s * 0.1, s * 0.12, ICON_COLORS.robotLine),
        circle(cx + s * 0.25, cy - s * 0.1, s * 0.12, ICON_COLORS.robotLine),
        seg(cx - s * 0.22, cy + s * 0.28, cx + s * 0.22, cy + s * 0.28, 0.7, ICON_COLORS.robotLine),
      ];
    }
  }
}
