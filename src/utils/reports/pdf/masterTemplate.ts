/**
 * MASTER REPORT TEMPLATE — the premium quiz dashboard, built from the same page operations as every other
 * report, so the on-screen preview and the downloaded PDF are pixel-identical and work with no network.
 *
 * Structure (matches the approved reference design):
 *   • Deep-purple masthead: trophy, brand line, title, metadata row, a green "great attempt" badge and a
 *     chart motif — with a hairline under it.
 *   • A six-card statistics bar: Shown · Correct · Wrong · Skipped · Accuracy · Score.
 *   • Question cards in one or two columns, tinted by result (green / red / amber), each with a numbered
 *     question, lettered options in a 2-up grid *or* a 1-up list (decided per card, so short options never
 *     stretch and long options never squeeze), and a purple explanation box titled "Ans.N.: (B) …".
 *   • A summary card closing the last column: 2×2 mini stats and a score banner.
 *   • Footer with the report name · page x of y · the brand.
 *
 * Reading order is preserved (down the first column, then the second) while each card goes into the first
 * column that has room for it. Cards are never split and never dropped: one that cannot fit any column gets
 * a page of its own at full width.
 */
import { measureText, type FontSet } from './fontSet';
import { PAPER, wrapSpans, type Span } from './layout';
import type { Block } from './markdown';
import type { LaidOutReport, Op, Page, ReportDoc, ReportItem, ReportStyle } from './types';

/* ───────────────────────────── design tokens ───────────────────────────── */

const T = {
  purple0: '#33205A',
  purple1: '#4B2C7F',
  purple2: '#5B3A93',
  ink: '#111827',
  ink2: '#374151',
  mute: '#6B7280',
  faint: '#9CA3AF',
  white: '#FFFFFF',
  hair: 'rgba(17,24,39,0.10)',
  optBg: '#FFFFFF',
  optBd: 'rgba(17,24,39,0.09)',
  okBg: '#F0FDF4', okBd: '#BBF7D0', okInk: '#15803D', okPill: '#DCFCE7',
  noBg: '#FEF2F2', noBd: '#FECACA', noInk: '#B91C1C', noPill: '#FEE2E2',
  skBg: '#FFFBEB', skBd: '#FDE68A', skInk: '#B45309', skPill: '#FEF3C7',
  exBg: '#F5F3FF', exBd: '#DDD6FE', exInk: '#6D28D9', exText: '#4B5563', aiInk: '#0E7490',
  gold: '#F2B233',
} as const;

const M = { l: 30, r: 30, t: 30, b: 44 };
const GUT = 16;
const PAD = 13;
const RADIUS = 7;
const CARD_GAP = 10;

type Scale = number;

const STATUS = {
  correct: { bg: T.okBg, bd: T.okBd, ink: T.okInk, pill: T.okPill, label: 'Correct' },
  wrong: { bg: T.noBg, bd: T.noBd, ink: T.noInk, pill: T.noPill, label: 'Wrong' },
  skipped: { bg: T.skBg, bd: T.skBd, ink: T.skInk, pill: T.skPill, label: 'Skipped' },
  unknown: { bg: '#F8FAFC', bd: '#E2E8F0', ink: T.mute, pill: '#F1F5F9', label: 'Question' },
} as const;

const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const pct = (v: number | undefined, fallback = 0) => Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? (v as number) : fallback)));

/* ───────────────────────────── measurement ───────────────────────────── */

const wOf = (set: FontSet, s: string, bold: boolean, size: number) => measureText(s, bold, size, set);

/** Truncate to fit, with an ellipsis. Never returns a string wider than `maxW`. */
function fit(set: FontSet, s: string, maxW: number, bold: boolean, size: number): string {
  if (maxW <= 0) return '';
  if (wOf(set, s, bold, size) <= maxW) return s;
  let out = s;
  while (out.length > 1 && wOf(set, out + '…', bold, size) > maxW) out = out.slice(0, -1);
  return out.length ? out + '…' : '';
}

/** Word-wrap plain text into lines that each fit `maxW`. A cut short is marked with an ellipsis. */
function wrap(set: FontSet, s: string, maxW: number, size: number, bold = false, maxLines = 400): string[] {
  const clean = String(s ?? '').replace(/[\u200B\uFEFF]/g, '');
  if (!clean.trim()) return [];
  const spans: Span[] = [{ text: clean, bold }];
  const all = wrapSpans(spans, Math.max(12, maxW), size, set).map(line => line.map(sp => sp.text).join(''));
  if (all.length <= maxLines) return all;
  const kept = all.slice(0, maxLines);
  kept[kept.length - 1] = kept[kept.length - 1] + '…';
  return kept;
}

/* ───────────────────────────── op builders ───────────────────────────── */

const txt = (x: number, y: number, text: string, o: { bold?: boolean; size?: number; color?: string; opacity?: number } = {}): Op =>
  ({ t: 'text', x, y, text, bold: o.bold ?? false, size: o.size ?? 8, color: o.color ?? T.ink, opacity: o.opacity });

const box = (x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; sw?: number; r?: number; opacity?: number } = {}): Op =>
  ({ t: 'rect', x, y, w, h, ...o });

const rule = (x1: number, y1: number, x2: number, y2: number, o: { w?: number; color?: string; dash?: [number, number] } = {}): Op =>
  ({ t: 'line', x1, y1, x2, y2, w: o.w ?? 0.6, color: o.color ?? T.hair, dash: o.dash });

const dot = (x: number, y: number, r: number, o: { fill?: string; stroke?: string; sw?: number; opacity?: number } = {}): Op =>
  ({ t: 'circle', x, y, r, ...o });

/** Two strokes forming a check mark — no glyph dependency, so it renders identically in every font set. */
function check(x: number, y: number, s: number, color: string, weight = 1): Op[] {
  return [
    { t: 'line', x1: x, y1: y + s * 0.52, x2: x + s * 0.38, y2: y + s * 0.9, w: weight, color },
    { t: 'line', x1: x + s * 0.38, y1: y + s * 0.9, x2: x + s, y2: y + s * 0.08, w: weight, color },
  ];
}

/** Centred rounded chip: status pills and mini labels. */
function pill(set: FontSet, x: number, y: number, label: string, o: { fill: string; ink: string; size: number; h?: number; padX?: number; withDot?: boolean }): Op[] {
  const padX = o.padX ?? 7;
  const h = o.h ?? o.size + 7;
  const dotW = o.withDot ? 6 : 0;
  const w = wOf(set, label, true, o.size) + padX * 2 + dotW;
  const ops: Op[] = [box(x, y, w, h, { fill: o.fill, r: h / 2 })];
  if (o.withDot) ops.push(dot(x + padX, y + h / 2, 2, { fill: o.ink }));
  ops.push(txt(x + padX + dotW, y + h / 2 + o.size * 0.36, label, { bold: true, size: o.size, color: o.ink }));
  return ops;
}

/** Three ascending bars — the template's chart motif, drawn as shapes so it stays crisp at any zoom. */
function bars(x: number, baselineY: number, h: number, color: string): Op[] {
  const w = 2.6, gap = 2.8;
  return [0.4, 0.68, 1].map((f, i) => box(x + i * (w + gap), baselineY - h * f, w, h * f, { fill: color, r: 1 }));
}

/* ───────────────────────────── masthead ───────────────────────────── */

function masthead(doc: ReportDoc, style: ReportStyle, set: FontSet, pageW: number): { ops: Op[]; h: number } {
  const s = doc.summary;
  const ops: Op[] = [];
  const x0 = M.l;
  const w = pageW - M.l - M.r;
  const h = 94;

  // gradient built from stacked bands (a vector PDF has no gradients, and this reads the same)
  ops.push(box(x0, M.t, w, h, { fill: T.purple1, r: 11 }));
  ops.push(box(x0, M.t, w, h * 0.55, { fill: T.purple0, r: 11, opacity: 0.85 }));
  ops.push(box(x0, M.t, w * 0.46, h, { fill: T.purple2, r: 11, opacity: 0.30 }));

  // trophy in a soft plate
  const tx = x0 + 18, ty = M.t + 21;
  ops.push(box(tx - 5, ty - 5, 25, 25, { fill: 'rgba(255,255,255,0.12)', stroke: 'rgba(255,255,255,0.18)', sw: 0.5, r: 7 }));
  ops.push(box(tx + 2, ty, 11, 9.2, { fill: T.gold, r: 2.4 }));
  ops.push(box(tx + 6, ty + 9.2, 3, 3.2, { fill: T.gold }));
  ops.push(box(tx + 3.4, ty + 12.4, 8.2, 2, { fill: T.gold, r: 1 }));
  ops.push(dot(tx - 0.4, ty + 3.6, 2.4, { stroke: T.gold, sw: 1 }));
  ops.push(dot(tx + 15.4, ty + 3.6, 2.4, { stroke: T.gold, sw: 1 }));

  const bx = tx + 28;
  const kindLabel = doc.kind === 'exam' ? 'EXAM PAPER' : doc.kind === 'revision' ? 'REVISION SHEET' : doc.kind === 'notes' ? 'STUDY NOTES' : 'MASTER REPORT';
  ops.push(txt(bx, M.t + 19, `${style.brand.toUpperCase()}   ·   ${kindLabel}`, { bold: true, size: 6.2, color: 'rgba(255,255,255,0.72)' }));
  ops.push(txt(bx, M.t + 39, fit(set, doc.title || 'Report', w * 0.54, true, 14.5), { bold: true, size: 14.5, color: T.white }));

  const meta = (doc.meta ?? []).filter(Boolean).slice(0, 4);
  if (meta.length) {
    let mx = bx;
    meta.forEach((m, i) => {
      if (i > 0) {
        ops.push(dot(mx + 3, M.t + 50.5, 1.1, { fill: 'rgba(255,255,255,0.34)' }));
        mx += 9;
      }
      ops.push(txt(mx, M.t + 53, fit(set, m, w * 0.54, false, 6.4), { size: 6.4, color: 'rgba(255,255,255,0.66)' }));
      mx += wOf(set, m, false, 6.4) + 2;
    });
  }

  const shown = s?.shown ?? doc.items?.length ?? 0;
  const facts = [
    `${shown} question${shown === 1 ? '' : 's'}`,
    s?.timeSec ? `${Math.floor(s.timeSec / 60)}m ${pct(s.timeSec % 60)}s` : null,
  ].filter(Boolean).join('   ·   ');
  if (facts) ops.push(txt(bx, M.t + 66, fit(set, facts, w * 0.54, false, 5.8), { size: 5.8, color: 'rgba(255,255,255,0.44)' }));

  // verdict badge
  const verdict = !s ? 'Report ready' : s.accuracy >= 75 ? 'Great attempt!' : s.accuracy >= 45 ? 'Good effort!' : 'Keep going!';
  const badgeW = 128, badgeH = 28, badgeX = x0 + w - badgeW - 16, badgeY = M.t + 17;
  ops.push(box(badgeX, badgeY, badgeW, badgeH, { fill: 'rgba(255,255,255,0.13)', stroke: 'rgba(255,255,255,0.22)', sw: 0.6, r: badgeH / 2 }));
  ops.push(dot(badgeX + 15, badgeY + badgeH / 2, 6.6, { fill: '#22C55E' }));
  ops.push(...check(badgeX + 11.6, badgeY + badgeH / 2 - 3.4, 6.4, T.white, 1.1));
  ops.push(txt(badgeX + 27, badgeY + 12, verdict, { bold: true, size: 6.8, color: T.white }));
  ops.push(txt(badgeX + 27, badgeY + 20, s ? `${pct(s.accuracy)}% accuracy` : 'Saved on device', { size: 5.6, color: 'rgba(255,255,255,0.68)' }));
  ops.push(...bars(badgeX + badgeW - 24, badgeY + badgeH - 10, 12, T.gold));

  ops.push(rule(x0, M.t + h + 10, x0 + w, M.t + h + 10, { w: 0.5 }));
  return { ops, h: h + 20 };
}

/** Header for pages 2+: a slim line instead of the full masthead, so questions get the space. */
function slimHeader(doc: ReportDoc, style: ReportStyle, set: FontSet, pageW: number): { ops: Op[]; h: number } {
  const w = pageW - M.l - M.r;
  const title = fit(set, doc.title, w * 0.56, true, 6.2);
  return {
    ops: [
      txt(M.l, M.t + 6, style.brand.toUpperCase(), { bold: true, size: 6, color: T.purple1 }),
      txt(M.l + w - wOf(set, title, true, 6.2), M.t + 6, title, { bold: true, size: 6.2, color: T.faint }),
      rule(M.l, M.t + 12, M.l + w, M.t + 12, { w: 0.5 }),
    ],
    h: 12,
  };
}

/* ───────────────────────────── stats bar ───────────────────────────── */

function statsBar(doc: ReportDoc, set: FontSet, pageW: number, y: number): { ops: Op[]; h: number } {
  const s = doc.summary;
  const ops: Op[] = [];
  const w = pageW - M.l - M.r;
  const gap = 6;
  const h = 30;
  const shown = s?.shown ?? doc.items?.length ?? 0;
  const cells = [
    { v: String(shown), l: 'Shown', c: T.purple1, icon: 'bars' },
    { v: String(s?.correct ?? 0), l: 'Correct', c: T.okInk, icon: 'ok' },
    { v: String(s?.wrong ?? 0), l: 'Wrong', c: T.noInk, icon: 'no' },
    { v: String(s?.skipped ?? 0), l: 'Skipped', c: T.skInk, icon: 'skip' },
    { v: `${pct(s?.accuracy)}%`, l: 'Accuracy', c: T.purple1, icon: 'ring' },
    { v: `${pct(s?.scorePct ?? s?.maxScore)}%`, l: 'Score', c: T.purple1, icon: 'star' },
  ];
  const cw = (w - gap * (cells.length - 1)) / cells.length;
  const textX = 24; // icon block occupies the first 20pt, so the number never collides with it

  cells.forEach((cell, i) => {
    const x = M.l + i * (cw + gap);
    ops.push(box(x, y, cw, h, { fill: T.white, stroke: T.hair, sw: 0.45, r: 6 }));
    const ix = x + 8, iy = y + h / 2;
    switch (cell.icon) {
      case 'ok':
        ops.push(dot(ix + 3, iy, 4.9, { stroke: cell.c, sw: 0.8 }));
        ops.push(...check(ix + 0.9, iy - 2.8, 4.4, cell.c, 0.9));
        break;
      case 'no':
        ops.push(dot(ix + 3, iy, 4.9, { stroke: cell.c, sw: 0.8 }));
        ops.push({ t: 'line', x1: ix + 1.2, y1: iy - 1.8, x2: ix + 4.8, y2: iy + 1.8, w: 0.9, color: cell.c });
        ops.push({ t: 'line', x1: ix + 4.8, y1: iy - 1.8, x2: ix + 1.2, y2: iy + 1.8, w: 0.9, color: cell.c });
        break;
      case 'skip':
        ops.push(dot(ix + 3, iy, 4.9, { stroke: cell.c, sw: 0.8 }));
        ops.push({ t: 'line', x1: ix + 1.4, y1: iy, x2: ix + 4.6, y2: iy, w: 0.9, color: cell.c });
        break;
      case 'ring':
        ops.push(dot(ix + 3, iy, 4.6, { stroke: cell.c, sw: 1.1 }));
        ops.push(dot(ix + 3, iy, 1.9, { fill: cell.c }));
        break;
      case 'star':
        ops.push(dot(ix + 3, iy, 4.6, { fill: cell.c, opacity: 0.14 }));
        ops.push(dot(ix + 3, iy, 2, { fill: cell.c }));
        break;
      default:
        ops.push(...bars(ix + 0.6, iy + 4.2, 8.4, cell.c));
    }
    ops.push(txt(x + textX, y + 13.4, fit(set, cell.v, cw - textX - 5, true, 9.4), { bold: true, size: 9.4, color: T.ink }));
    ops.push(txt(x + textX, y + 22.6, fit(set, cell.l, cw - textX - 5, false, 5.6), { size: 5.6, color: T.faint }));
  });
  return { ops, h };
}

/* ───────────────────────────── question card ───────────────────────────── */

const optionH = (lines: number, f: number, sc: Scale) => Math.max(15 * sc, lines * f * 1.3 + 7 * sc);

function questionCard(it: ReportItem, style: ReportStyle, set: FontSet, colW: number, sc: Scale, maxH = Infinity, attempt = 0): { ops: Op[]; h: number } {
  const st = STATUS[it.status] ?? STATUS.unknown;
  const ops: Op[] = [];
  const innerW = colW - PAD * 2;
  const fQ = 7.7 * sc, fOpt = 6.9 * sc, fAns = 7 * sc, fEx = 6.5 * sc, fPill = 5.3 * sc;
  const showAnswers = style.answers === 'inline';

  /* head: number badge + question text + status pill */
  const pillH = fPill + 7 * sc;
  const pillW = wOf(set, st.label, true, fPill) + 20;
  const numW = 15 * sc;
  const textX = PAD + numW + 6;
  const textW = colW - PAD - pillW - 6 - textX;
  const qLines = wrap(set, (it.question || '').trim() || '(no question text)', textW, fQ, true, 60);
  const headTop = PAD * 0.55;

  ops.push(box(PAD, headTop, numW, numW, { fill: T.white, stroke: st.bd, sw: 0.9, r: 3.6 }));
  const nStr = String(it.n);
  ops.push(txt(PAD + (numW - wOf(set, nStr, true, fQ)) / 2, headTop + numW / 2 + fQ * 0.36, nStr, { bold: true, size: fQ, color: st.ink }));
  // one line sits level with the badge; several lines start at its top edge and grow downwards
  const firstBaseline = qLines.length <= 1 ? headTop + numW / 2 + fQ * 0.36 : headTop + fQ * 0.95;
  qLines.forEach((ln, i) => ops.push(txt(textX, firstBaseline + i * fQ * 1.32, ln, { bold: true, size: fQ, color: T.ink })));
  ops.push(...pill(set, colW - PAD - pillW, headTop, st.label, { fill: st.pill, ink: st.ink, size: fPill, h: pillH, withDot: true }));

  const headBottom = Math.max(
    headTop + numW,
    firstBaseline + (qLines.length - 1) * fQ * 1.32 + fQ * 0.34,
    headTop + pillH,
  );
  let y = headBottom + 9 * sc;

  /* options: 2-up when every option is short enough, else 1-up */
  const opts = it.options ?? [];
  const idxOf = (t: string) => opts.findIndex(o => o.trim() === String(t ?? '').trim());
  const short = opts.length > 0 && opts.length <= 4 && opts.every(o => wOf(set, o, false, fOpt) < (innerW - 9) / 2 - 34);
  const twoUp = short && opts.length >= 2;
  const cellW = twoUp ? (innerW - 9) / 2 : innerW;

  const drawOption = (i: number, x: number, yy: number, w: number, h: number) => {
    const lines = wrap(set, opts[i] || '—', w - 34, fOpt, false, 24);
    ops.push(box(x, yy, w, h, { fill: T.optBg, stroke: T.optBd, sw: 0.5, r: 4.5 }));
    const bs = 11 * sc;
    const byy = yy + (h - bs) / 2;
    ops.push(dot(x + 6.5 + bs / 2, byy + bs / 2, bs / 2, { fill: '#F1F2F5', stroke: '#E3E6EB', sw: 0.5 }));
    const L = LETTER(i);
    ops.push(txt(x + 6.5 + bs / 2 - wOf(set, L, true, fOpt * 0.82) / 2, byy + bs / 2 + fOpt * 0.29, L, { bold: true, size: fOpt * 0.82, color: T.ink2 }));
    lines.forEach((ln, li) => ops.push(txt(x + 6.5 + bs + 5, byy + bs / 2 + fOpt * 0.30 - ((lines.length - 1) * fOpt * 1.3) / 2 + li * fOpt * 1.3, ln, { size: fOpt, color: T.ink2 })));
  };

  if (twoUp) {
    for (let i = 0; i < opts.length; i += 2) {
      const hA = optionH(wrap(set, opts[i] || '—', cellW - 34, fOpt, false, 24).length, fOpt, sc);
      const hB = i + 1 < opts.length ? optionH(wrap(set, opts[i + 1] || '—', cellW - 34, fOpt, false, 24).length, fOpt, sc) : 0;
      const h = Math.max(hA, hB);
      drawOption(i, PAD, y, cellW, h);
      if (i + 1 < opts.length) drawOption(i + 1, PAD + cellW + 9, y, cellW, h);
      y += h + 5 * sc;
    }
  } else {
    for (let i = 0; i < opts.length; i++) {
      const h = optionH(wrap(set, opts[i] || '—', cellW - 34, fOpt, false, 24).length, fOpt, sc);
      drawOption(i, PAD, y, cellW, h);
      y += h + 5 * sc;
    }
  }
  y += 2 * sc;

  /* explanation box */
  if (showAnswers) {
    const answerText = (it.correct ?? []).map(c => { const i = idxOf(c); return i >= 0 ? `(${LETTER(i)}) ${c}` : String(c); }).join(', ');
    const title = `Ans.${it.n}.: ${answerText || '—'}`;
    const innerX = PAD + 10;
    const bodyW = innerW - 22;
    const titleLines = wrap(set, title, bodyW, fAns, true, 12);

    const bodies: { label?: string; color: string; lines: string[] }[] = [];
    const addBody = (label: string, color: string, raw: string) => {
      String(raw ?? '').replace(/\r/g, '').split('\n').map(t => t.trim()).filter(Boolean).slice(0, 24).forEach((p, pi) => {
        bodies.push({ label: pi === 0 ? label : undefined, color, lines: wrap(set, p, bodyW - 5, fEx, false, 120) });
      });
    };
    if (it.book?.trim()) addBody('Explanation', T.exInk, it.book.trim());
    if (it.ai?.trim()) addBody('AI explanation', T.aiInk, it.ai.trim());

    const userLine = style.showUserAnswer && it.status !== 'unknown'
      ? (it.status === 'skipped'
        ? 'Your answer: not attempted'
        : `Your answer: ${it.user ? (idxOf(it.user) >= 0 ? `(${LETTER(idxOf(it.user))}) ` : '') + it.user : '—'}`)
      : '';

    let need = titleLines.length * fAns * 1.32 + 5 * sc;
    if (userLine) need += fEx * 1.55;
    for (const b of bodies) need += (b.label ? fEx * 1.45 : 0) + b.lines.length * fEx * 1.32 + 1.5 * sc;
    const boxH = Math.max(need + 7 * sc, 22 * sc);

    ops.push(box(PAD, y, innerW, boxH, { fill: T.exBg, stroke: T.exBd, sw: 0.5, r: 5.5 }));
    ops.push(box(PAD, y + 4.5, 2.2, boxH - 9, { fill: st.ink, r: 1.1 }));

    let cy = y + 6.5 * sc;
    titleLines.forEach((ln, i) => ops.push(txt(innerX, cy + fAns * 0.92 + i * fAns * 1.32, ln, { bold: true, size: fAns, color: st.ink })));
    cy += titleLines.length * fAns * 1.32 + 2.5 * sc;
    if (userLine) {
      ops.push(txt(innerX, cy + fEx * 0.92, fit(set, userLine, bodyW, false, fEx), { size: fEx, color: T.exText }));
      cy += fEx * 1.55;
    }
    for (const b of bodies) {
      if (b.label) {
        ops.push(dot(innerX + 2, cy + fEx * 0.42, 1.2, { fill: b.color }));
        ops.push(txt(innerX + 5.5, cy + fEx * 0.92, b.label, { bold: true, size: fEx, color: b.color }));
        cy += fEx * 1.45;
      }
      b.lines.forEach((ln, i) => ops.push(txt(innerX + 5.5, cy + fEx * 0.92 + i * fEx * 1.32, ln, { size: fEx, color: T.exText })));
      cy += b.lines.length * fEx * 1.32 + 1.5 * sc;
    }
    y += boxH;
  }

  const cardH = Math.max(y + PAD, 46 * sc);
  // Too tall for any column? Try tighter type before spending a whole page on one question.
  if (cardH > maxH && attempt < 2) return questionCard(it, style, set, colW, sc * 0.82, maxH, attempt + 1);
  return { ops: [box(0, 0, colW, cardH, { fill: st.bg, stroke: st.bd, sw: 0.8, r: RADIUS }), ...ops], h: cardH };
}

/* ───────────────────────────── summary card ───────────────────────────── */

function summaryCard(doc: ReportDoc, set: FontSet, colW: number, sc: Scale, avail = Infinity): { ops: Op[]; h: number } | null {
  const s = doc.summary;
  const ops: Op[] = [];
  const innerW = colW - PAD * 2;
  // The banner absorbs any squeeze first: a summary that fits the column beats a page holding nothing else.
  const tight = avail < 150 * sc;
  const title = (tight ? 30 : 36) * sc + 8;
  const mini = (tight ? 15.5 : 20) * sc;
  const gap = (tight ? 3.5 : 5) * sc;
  const minBanner = (tight ? 24 : 30) * sc;
  let banner = (tight ? 30 : 44) * sc;
  let h = title + 2 * (mini + gap) + banner + 6 * sc;
  if (h > avail) {
    banner = Math.max(minBanner, banner - (h - avail));
    h = title + 2 * (mini + gap) + banner + 6 * sc;
  }
  if (h > avail) return null;

  ops.push(box(0, 0, colW, h, { fill: T.purple1, r: RADIUS }));
  ops.push(box(0, 0, colW, h * 0.48, { fill: T.purple0, r: RADIUS, opacity: 0.5 }));

  // title with a small trophy
  const ty = (tight ? 9 : 12) * sc;
  ops.push(box(PAD, ty, 10, 8, { fill: T.gold, r: 2 }));
  ops.push(box(PAD + 3.4, ty + 8, 3.2, 3, { fill: T.gold }));
  ops.push(box(PAD + 1.4, ty + 11, 7.2, 1.9, { fill: T.gold, r: 0.9 }));
  ops.push(txt(PAD + 15, ty + 7.4, 'Quiz Summary', { bold: true, size: 9 * sc, color: T.white }));
  ops.push(txt(PAD + 15, ty + 15, s?.scope === 'profile' ? 'Across all quizzes' : 'This attempt', { size: 5.6, color: 'rgba(255,255,255,0.52)' }));

  const cells = [
    { v: String(s?.correct ?? 0), l: 'Correct', c: '#6EE7B7' },
    { v: String(s?.wrong ?? 0), l: 'Wrong', c: '#FCA5A5' },
    { v: String(s?.skipped ?? 0), l: 'Skipped', c: '#FCD34D' },
    { v: `${pct(s?.accuracy)}%`, l: 'Accuracy', c: '#C4B5FD' },
  ];
  const cw = (innerW - gap) / 2;
  const miniTop = title;
  cells.forEach((c, i) => {
    const cx = PAD + (i % 2) * (cw + gap);
    const cy = miniTop + Math.floor(i / 2) * (mini + gap);
    ops.push(box(cx, cy, cw, mini, { fill: 'rgba(255,255,255,0.10)', stroke: 'rgba(255,255,255,0.14)', sw: 0.4, r: 4 }));
    ops.push(dot(cx + 8, cy + mini / 2, 2.1, { fill: c.c }));
    ops.push(txt(cx + 13, cy + mini / 2 + 2, fit(set, c.l, cw - 46, false, 5.8), { size: 5.8, color: 'rgba(255,255,255,0.66)' }));
    ops.push(txt(cx + cw - wOf(set, c.v, true, 7.4) - 7, cy + mini / 2 + 2.4, c.v, { bold: true, size: 7.4, color: c.c }));
  });

  const by = miniTop + 2 * (mini + gap);
  const score = pct(s?.scorePct ?? s?.maxScore);
  const big = Math.min(15 * sc, Math.max(8, banner * 0.36));
  ops.push(box(PAD, by, innerW, banner, { fill: 'rgba(0,0,0,0.20)', stroke: 'rgba(255,255,255,0.10)', sw: 0.4, r: 4 }));
  ops.push(txt(PAD + 9, by + big * 0.72, 'Score', { size: 5.6, color: 'rgba(255,255,255,0.52)' }));
  ops.push(txt(PAD + 9, by + big * 0.72 + big + 1.5, `${score}%`, { bold: true, size: big, color: T.white }));
  if (banner >= 38 * sc) ops.push(txt(PAD + 9, by + banner - 5.5, score >= 60 ? 'Nice work — keep going!' : 'Practice more, score higher!', { size: 5.2, color: 'rgba(255,255,255,0.54)' }));
  const chartH = Math.min(banner - 12, 17 * sc);
  if (chartH > 6) ops.push(...bars(PAD + innerW - 32, by + banner - 6, chartH, T.gold));

  return { ops, h };
}

/** Answer key card — used instead of per-question explanations when `answers === 'key'`. */
function answerKeyCard(items: ReportItem[], set: FontSet, colW: number, sc: Scale): { ops: Op[]; h: number } {
  const ops: Op[] = [];
  const innerW = colW - PAD * 2;
  const f = 6.8 * sc;
  const rows = items.map(it => {
    const ans = (it.correct ?? []).map(c => {
      const i = (it.options ?? []).findIndex(o => o.trim() === String(c).trim());
      return i >= 0 ? `(${LETTER(i)})` : String(c);
    }).join(', ') || '—';
    const q = it.question.trim() || '(no question)';
    return { n: `${it.n}.`, q, ans };
  });
  const ansW = Math.max(...rows.map(r => wOf(set, r.ans, true, f)), 20) + 6;
  const qW = innerW - 22 - ansW;
  const laid = rows.map(r => ({ ...r, lines: wrap(set, r.q, qW, f, false, 4) }));
  const h = PAD * 1.4 + laid.reduce((a, r) => a + Math.max(r.lines.length * f * 1.32, f + 2), 0) + laid.length * 2.6 + PAD * 0.6;

  ops.push(box(0, 0, colW, h, { fill: T.white, stroke: T.hair, sw: 0.45, r: RADIUS }));
  ops.push(txt(PAD, PAD * 1.1 + f * 0.7, 'Answer Key', { bold: true, size: 8.6 * sc, color: T.purple1 }));
  let y = PAD * 1.1 + f + 8 * sc;
  const st = STATUS.unknown;
  laid.forEach(r => {
    const lh = Math.max(r.lines.length * f * 1.32, f + 2);
    ops.push(txt(PAD, y + f * 0.9, r.n, { bold: true, size: f, color: st.ink }));
    r.lines.forEach((ln, i) => ops.push(txt(PAD + 18, y + f * 0.9 + i * f * 1.32, ln, { size: f, color: T.ink2 })));
    ops.push(txt(colW - PAD - wOf(set, r.ans, true, f), y + f * 0.9, r.ans, { bold: true, size: f, color: T.okInk }));
    y += lh + 2.6;
  });
  return { ops, h };
}

/* ───────────────────────────── markdown blocks ───────────────────────────── */

function blockCard(b: Block, set: FontSet, colW: number, sc: Scale): { ops: Op[]; h: number } {
  const innerW = colW - PAD * 2;
  if (b.type === 'hr') return { ops: [rule(0, 2, colW, 2, { color: T.hair })], h: 6 };

  const heading = b.type === 'h1' || b.type === 'h2' || b.type === 'h3';
  const size = (b.type === 'h1' ? 11.4 : b.type === 'h2' ? 9.6 : b.type === 'h3' ? 8.2 : 7.1) * sc;
  const indent = b.type === 'li' ? 10 + Math.min(3, b.level) * 9 : b.type === 'quote' ? 12 : 4;
  const prefix = b.type === 'li' ? `${b.marker}  ` : '';
  const lines = wrap(set, prefix + b.text, innerW - indent * 2, size, heading, 60);
  const bodyH = Math.max(lines.length * size * 1.36, size * 1.2);
  const top = PAD * 0.8;
  const h = bodyH + top + PAD * 0.7 + (heading ? 2 : 0);
  const ops: Op[] = [];

  if (b.type === 'quote') ops.push(box(PAD * 0.45, top - 2, 2, bodyH + 2, { fill: T.exBd, r: 1 }));
  lines.forEach((ln, i) => ops.push(txt(PAD + indent, top + size * 0.95 + i * size * 1.36, ln, { bold: heading, size, color: heading ? T.purple1 : T.ink2 })));
  if (b.type === 'h1' || b.type === 'h2') ops.push(rule(PAD + 2, h - 4, Math.min(colW - PAD, PAD + 2 + innerW * 0.3), h - 4, { w: 0.7, color: T.okBd }));

  return { ops: [box(0, 0, colW, h, { fill: T.white, stroke: T.hair, sw: 0.45, r: RADIUS }), ...ops], h };
}

/* ───────────────────────────── flow ───────────────────────────── */

function shift(op: Op, dx: number, dy: number): Op {
  switch (op.t) {
    case 'text': return { ...op, x: op.x + dx, y: op.y + dy };
    case 'line': return { ...op, x1: op.x1 + dx, y1: op.y1 + dy, x2: op.x2 + dx, y2: op.y2 + dy };
    case 'rect': return { ...op, x: op.x + dx, y: op.y + dy };
    case 'circle': return { ...op, x: op.x + dx, y: op.y + dy };
    default: return op;
  }
}

interface Card { ops: Op[]; h: number }

export function layoutMasterReport(doc: ReportDoc, style: ReportStyle, set: FontSet): LaidOutReport {
  const paper = PAPER[style.paper] ?? PAPER.a4;
  const sc: Scale = style.fontSize === 'sm' ? 0.94 : style.fontSize === 'lg' ? 1.09 : 1;
  const cols = style.columns === 2 ? 2 : 1;
  const contentW = paper.w - M.l - M.r;
  const colW = (contentW - GUT * (cols - 1)) / cols;
  const colBottom = paper.h - M.b;

  const pages: Page[] = [];
  /** How far down each column of each page content reaches — the flow uses this, never op scanning. */
  const fills: number[][] = [];
  /** Where the content area of each page starts (below the masthead / slim header). */
  const tops: number[] = [];

  const addPage = (header: 'full' | 'slim' | 'none'): number => {
    const page: Page = { width: paper.w, height: paper.h, number: pages.length + 1, ops: [] };
    pages.push(page);
    let top = M.t;
    if (style.header && header === 'full') {
      const hd = masthead(doc, style, set, paper.w);
      page.ops.push(...hd.ops);
      const st = statsBar(doc, set, paper.w, M.t + hd.h);
      page.ops.push(...st.ops);
      top = M.t + hd.h + st.h + 14;
    } else if (style.header && header === 'slim') {
      const hd = slimHeader(doc, style, set, paper.w);
      page.ops.push(...hd.ops);
      top = M.t + hd.h + 10;
    }
    fills.push(new Array(cols).fill(top));
    tops.push(top);
    return pages.length - 1;
  };

  const place = (card: Card, col: number, top: number) => {
    const x = M.l + col * (colW + GUT);
    for (const op of card.ops) pages[pages.length - 1].ops.push(shift(op, x, top));
  };

  const placeFullWidth = (card: Card, top: number) => {
    for (const op of card.ops) pages[pages.length - 1].ops.push(shift(op, M.l, top));
  };

  const firstColumnWithRoom = (h: number): number => {
    const f = fills[fills.length - 1];
    for (let c = 0; c < cols; c++) if (colBottom - f[c] >= h) return c;
    return -1;
  };

  let pageIdx = addPage('full');

  /* questions */
  const items = doc.items ?? [];
  const maxCard = colBottom - M.t - 20;
  const queue: Card[] = items.map(it => questionCard(it, style, set, colW, sc, maxCard));
  let guard = 0;
  while (queue.length && guard++ < 4000) {
    const card = queue[0];
    const col = firstColumnWithRoom(card.h);
    if (col >= 0) {
      place(card, col, fills[pageIdx][col]);
      fills[pageIdx][col] += card.h + CARD_GAP;
      queue.shift();
      continue;
    }
    // no column has room: is the page just full, or is this card taller than a whole empty column?
    const emptyColumn = colBottom - tops[pageIdx];
    if (card.h > emptyColumn) {
      // taller than an empty column — give it a page of its own, laid out at full width
      pageIdx = addPage('slim');
      const hero = questionCard(items[items.length - queue.length], style, set, contentW, sc);
      placeFullWidth(hero, fills[pageIdx][0]);
      for (let c = 0; c < cols; c++) fills[pageIdx][c] = fills[pageIdx][0] + hero.h + CARD_GAP;
      queue.shift();
      continue;
    }
    pageIdx = addPage('slim');
  }

  /* answer key (only when explanations are suppressed) */
  if (style.answers === 'key' && items.length) {
    const key = answerKeyCard(items, set, colW, sc);
    const col = firstColumnWithRoom(key.h);
    if (col >= 0) {
      place(key, col, fills[pageIdx][col]);
      fills[pageIdx][col] += key.h + CARD_GAP;
    } else {
      pageIdx = addPage('slim');
      const wide = answerKeyCard(items, set, contentW, sc);
      placeFullWidth(wide, fills[pageIdx][0]);
      fills[pageIdx][0] += wide.h + CARD_GAP;
    }
  }

  /* summary card closes the roomiest column of the last page (shrinking a little if it must) */
  if (doc.summary) {
    const free = (): number => Math.max(...fills[pageIdx].map(f => colBottom - f));
    const roomiest = (): number => {
      const f = fills[pageIdx];
      let best = cols - 1;
      for (let c = cols - 1; c >= 0; c--) if (colBottom - f[c] > colBottom - f[best]) best = c;
      return best;
    };
    let card = summaryCard(doc, set, colW, sc, free());
    if (!card) {
      pageIdx = addPage('slim');
      card = summaryCard(doc, set, colW, sc, free());
    }
    if (card) {
      const col = roomiest();
      place(card, col, fills[pageIdx][col] + 2);
      fills[pageIdx][col] += card.h + CARD_GAP;
    }
  }

  /* markdown body: full-width stacked cards (notes, revision sheets, mixed sources) */
  const blocks = doc.blocks ?? [];
  if (blocks.length) {
    const cards = blocks.map(b => blockCard(b, set, contentW, sc));
    // start under the two-column area so no card overlaps a question card
    let y = Math.max(...fills[pageIdx]);
    if (y > colBottom - 60) { pageIdx = addPage('slim'); y = fills[pageIdx][0]; }
    for (const card of cards) {
      if (y + card.h > colBottom) {
        pageIdx = addPage('slim');
        y = fills[pageIdx][0];
      }
      placeFullWidth(card, y);
      y += card.h + 7;
    }
    for (let c = 0; c < cols; c++) fills[pageIdx][c] = Math.max(fills[pageIdx][c], y);
  }

  /* chrome — column divider + footer on every page */
  const total = pages.length;
  pages.forEach((page, i) => {
    if (cols === 2) {
      const x = M.l + colW + GUT / 2;
      page.ops.push(rule(x, tops[i] - 8, x, colBottom - 2, { w: 0.4, color: 'rgba(17,24,39,0.055)' }));
    }
    const fy = paper.h - M.b + 24;
    page.ops.push(rule(M.l, fy - 12, paper.w - M.r, fy - 12, { w: 0.5 }));
    page.ops.push(...bars(M.l, fy + 2.4, 7.2, T.purple1));
    page.ops.push(txt(M.l + 13, fy + 2, fit(set, doc.title, contentW * 0.46, true, 6.4), { bold: true, size: 6.4, color: T.ink2 }));
    const label = `Page ${page.number} of ${total}`;
    page.ops.push(txt(paper.w / 2 - wOf(set, label, false, 6.4) / 2, fy + 2, label, { size: 6.4, color: T.mute }));
    const brandW = wOf(set, style.brand, true, 6.6);
    page.ops.push(txt(paper.w - M.r - brandW, fy + 2, style.brand, { bold: true, size: 6.6, color: T.purple1 }));
    page.ops.push(txt(paper.w - M.r - wOf(set, 'Saved on device', false, 4.7), fy + 8.4, 'Saved on device', { size: 4.7, color: T.faint }));
  });

  return { pages, style, title: doc.title };
}
