/**
 * Black & white output for the exam paper: converts every colour in the drawing operations to black or grey.
 * Dark colours (the green answer, the purple / teal labels, the brand band) become solid black so the paper
 * prints crisp on any printer; light colours (chip fills, rules) keep their lightness as a grey.
 */
import type { Op } from './types';

const HEX = /^#([0-9a-f]{6})$/i;

export function monoColor(c: string | undefined): string | undefined {
  if (!c) return c;
  const m = HEX.exec(c.trim());
  if (!m) return c;
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  if (lum < 100) return '#111111';
  const g = Math.round(lum).toString(16).padStart(2, '0');
  return `#${g}${g}${g}`;
}

export function toMono(ops: Op[]): Op[] {
  return ops.map(o => {
    switch (o.t) {
      case 'text': return { ...o, color: monoColor(o.color) as string };
      case 'line': return { ...o, color: monoColor(o.color) as string };
      case 'rect': return { ...o, fill: monoColor(o.fill), stroke: monoColor(o.stroke) };
      case 'circle': return { ...o, fill: monoColor(o.fill), stroke: monoColor(o.stroke) };
    }
  });
}
