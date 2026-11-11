/**
 * Layout engine for the offline report format (Elite-Quiz-Bot style): numbered questions, lettered options, a dashed
 * rule, a bold "Ans.N. : (X) text" line, optional rationale, in one or two columns, with a footer on every page.
 * Output is a list of drawing operations per page, drawn by BOTH the PDF writer and the on-screen preview, so what you
 * preview is exactly what you download. Pure (no DOM / pdf-lib): unit-tested with fake fonts.
 */
import { measureText, type FontSet } from './fontSet';
import { parseInline, type Block } from './markdown';
import type { LaidOutReport, Op, Page, ReportDoc, ReportItem, ReportStyle } from './types';

export interface Span { text: string; bold: boolean; color?: string; size?: number }
interface TextRow { kind: 'text'; spans: Span[]; x: number; size: number; lh: number; bar?: string }
interface RuleRow { kind: 'rule'; h: number; color: string; dash?: [number, number] }
interface GapRow { kind: 'gap'; h: number }
type Row = TextRow | RuleRow | GapRow;
interface Group { rows: Row[]; keep: boolean; keepNext?: boolean }

export const PAPER = { a4: { w: 595.28, h: 841.89 }, letter: { w: 612, h: 792 } } as const;
const BASE = { sm: 8.6, md: 9.8, lg: 11.4 } as const;
const MARGIN = { l: 36, r: 36, t: 42, b: 52 };
const GUTTER = 24;
const LH = 1.4;

export const C = {
  ink: '#111827', text: '#1f2937', muted: '#6b7280', faint: '#9ca3af', rule: '#cbd2dc', accent: '#4f46e5',
  good: '#0f6b3f', bad: '#b42318', warn: '#b45309', book: '#6d28d9', ai: '#0e7490', divider: '#e5e7eb', chip: '#f8fafc', chipLine: '#e2e8f0',
};

/* ───────────────────────────── wrapping ───────────────────────────── */

/** Wraps styled spans into lines that fit `maxW`; continuation lines are shortened by `hang` (hanging indent). */
export function wrapSpans(spans: Span[], maxW: number, size: number, set: FontSet, hang = 0): Span[][] {
  const lines: Span[][] = [];
  let line: Span[] = [];
  let width = 0;
  const limit = () => maxW - (lines.length > 0 ? hang : 0);
  const push = (s: Span, text: string) => {
    const last = line[line.length - 1];
    if (last && last.bold === s.bold && last.color === s.color && last.size === s.size) last.text += text; else line.push({ ...s, text });
  };
  const newLine = () => { while (line.length && /^\s*$/.test(line[line.length - 1].text)) line.pop(); if (line.length) { const l = line[line.length - 1]; l.text = l.text.replace(/\s+$/, ''); } lines.push(line); line = []; width = 0; };
  for (const s of spans) {
    const sz = s.size ?? size;
    for (const part of s.text.replace(/\t/g, '  ').split(/(\n)/)) {
      if (part === '\n') { newLine(); continue; }
      for (const tok of part.split(/(\s+)/)) {
        if (tok === '') continue;
        const isSpace = /^\s+$/.test(tok);
        if (isSpace && width === 0) continue; // no leading spaces on a line
        const w = measureText(tok, s.bold, sz, set);
        if (!isSpace && width + w > limit() && width > 0) newLine();
        if (!isSpace && w > limit()) { // a single token longer than the line: split by characters
          let chunk = '';
          for (const ch of tok) {
            if (measureText(chunk + ch, s.bold, sz, set) > limit() && chunk) { push(s, chunk); newLine(); chunk = ''; }
            chunk += ch;
          }
          if (chunk) { push(s, chunk); width += measureText(chunk, s.bold, sz, set); }
          continue;
        }
        push(s, tok); width += w;
      }
    }
  }
  if (line.length || lines.length === 0) newLine();
  return lines;
}

const rowsFor = (spans: Span[], o: { colW: number; size: number; set: FontSet; indent?: number; hang?: number; lh?: number; bar?: string }): TextRow[] => {
  const indent = o.indent ?? 0;
  return wrapSpans(spans, o.colW - indent, o.size, o.set, o.hang ?? 0).map((l, i): TextRow => ({
    kind: 'text', spans: l, x: indent + (i > 0 ? (o.hang ?? 0) : 0), size: o.size, lh: o.size * (o.lh ?? LH), bar: o.bar,
  }));
};
const gap = (h: number): GapRow => ({ kind: 'gap', h });
const rowH = (r: Row) => (r.kind === 'text' ? r.lh : r.h);
const sumH = (rows: Row[]) => rows.reduce((a, r) => a + rowH(r), 0);

/* ───────────────────────────── groups ───────────────────────────── */

const letter = (i: number) => String.fromCharCode(65 + (i % 26));
const trimGapEdges = (rows: Row[]) => { while (rows.length && rows[0].kind === 'gap') rows.shift(); return rows; };

function itemGroups(it: ReportItem, ctx: { colW: number; size: number; set: FontSet; style: ReportStyle; multiSource: boolean; maxKeep: number }): Group[] {
  const { colW, size, set, style } = ctx;
  const rows: Row[] = [];
  rows.push(...rowsFor([{ text: `Q${it.n}.`, bold: true, color: C.ink }, { text: ' ' + (it.question.trim() || '(no question text)'), bold: false, color: C.text }], { colW, size, set }));
  rows.push(gap(size * 0.35));
  const hangW = measureText('(A) ', false, size, set);
  it.options.forEach((opt, i) => {
    rows.push(...rowsFor([{ text: `(${letter(i)})`, bold: true, color: C.ink }, { text: ' ' + opt, bold: false, color: C.text }], { colW, size, set, indent: 3, hang: hangW }));
  });

  const idxOf = (txt: string) => it.options.findIndex(o => o.trim() === txt.trim());
  const answerText = it.correct.map(c => { const i = idxOf(c); return i >= 0 ? `(${letter(i)}) ${c}` : c; }).join(',  ');
  if (style.answers === 'inline') {
    rows.push(gap(size * 0.4), { kind: 'rule', h: 1, color: C.rule, dash: [3, 3] }, gap(size * 0.4));
    const ansLabel = `Ans.${it.n}. : `;
    rows.push(...rowsFor([{ text: ansLabel, bold: true, color: C.ink }, { text: answerText || '-', bold: true, color: C.good }], { colW, size, set, hang: measureText(ansLabel, true, size, set) }));
    if (style.showUserAnswer && it.status !== 'unknown') {
      const ui = it.user ? idxOf(it.user) : -1;
      const label = it.status === 'skipped' ? 'Not attempted' : `Your answer: ${ui >= 0 ? `(${letter(ui)}) ` : ''}${it.user ?? ''}`;
      const color = it.status === 'correct' ? C.good : it.status === 'wrong' ? C.bad : C.warn;
      const mark = it.status === 'correct' ? '  - Correct' : it.status === 'wrong' ? '  - Incorrect' : '';
      rows.push(gap(size * 0.2), ...rowsFor([{ text: label + mark, bold: false, color, size: size * 0.92 }], { colW, size, set }));
    }
  }
  if (ctx.multiSource && it.source) rows.push(gap(size * 0.2), ...rowsFor([{ text: it.source, bold: false, color: C.faint, size: size * 0.82 }], { colW, size, set }));

  const groups: Group[] = [{ rows, keep: true }];
  if (style.answers === 'inline') {
    const rat = rationaleRows(it, ctx);
    if (rat.length) {
      // Keep a short explanation together with its question; only long ones may flow into the next column.
      if (sumH(rows) + sumH(rat) <= ctx.maxKeep) groups[0] = { rows: [...rows, ...rat], keep: true };
      else groups.push({ rows: rat, keep: false });
    }
  }
  groups.push({ rows: [gap(size * 1.1)], keep: false });
  return groups;
}

function rationaleRows(it: ReportItem, ctx: { colW: number; size: number; set: FontSet }): Row[] {
  const { colW, size, set } = ctx;
  const rows: Row[] = [];
  const add = (label: string, color: string, body: string) => {
    const paras = body.replace(/\r/g, '').split('\n').map(p => p.trim()).filter(Boolean);
    paras.forEach((p, i) => {
      const spans: Span[] = i === 0 ? [{ text: label, bold: true, color, size: size * 0.92 }, { text: ' ' + p, bold: false, color: C.muted, size: size * 0.92 }] : [{ text: p, bold: false, color: C.muted, size: size * 0.92 }];
      rows.push(gap(i === 0 ? size * 0.3 : size * 0.12), ...rowsFor(spans, { colW, size: size * 0.92, set, indent: i === 0 ? 0 : 6, hang: 0, lh: 1.36 }));
    });
  };
  if (it.book?.trim()) add('Explanation:', C.book, it.book);
  if (it.ai?.trim()) add('AI explanation:', C.ai, it.ai);
  return rows;
}

function keyGroups(items: ReportItem[], ctx: { colW: number; size: number; set: FontSet; style: ReportStyle }): Group[] {
  const { colW, size, set } = ctx;
  const groups: Group[] = [];
  groups.push({ rows: [gap(size * 0.8), ...rowsFor([{ text: 'Answer Key', bold: true, color: C.ink, size: size * 1.5 }], { colW, size: size * 1.5, set }), gap(size * 0.5)], keep: true, keepNext: true });
  const idxOf = (it: ReportItem, txt: string) => it.options.findIndex(o => o.trim() === txt.trim());
  const spans: Span[] = [];
  items.forEach(it => {
    const l = it.correct.map(c => { const i = idxOf(it, c); return i >= 0 ? letter(i) : '?'; }).join('/');
    spans.push({ text: `${it.n}-`, bold: false, color: C.muted }, { text: l, bold: true, color: C.good }, { text: '    ', bold: false });
  });
  groups.push({ rows: rowsFor(spans, { colW, size, set, lh: 1.9 }), keep: false });
  const withRat = items.filter(it => (it.book?.trim() || it.ai?.trim()));
  if (withRat.length) {
    groups.push({ rows: [gap(size * 1.2), ...rowsFor([{ text: 'Explanations', bold: true, color: C.ink, size: size * 1.5 }], { colW, size: size * 1.5, set }), gap(size * 0.4)], keep: true, keepNext: true });
    for (const it of withRat) {
      const rat = rationaleRows(it, { colW, size, set });
      const head = rowsFor([{ text: `Q${it.n}.`, bold: true, color: C.ink }, { text: ' ' + it.correct.map(c => { const i = idxOf(it, c); return i >= 0 ? `(${letter(i)}) ${c}` : c; }).join(', '), bold: true, color: C.good }], { colW, size, set, hang: measureText(`Q${it.n}. `, true, size, set) });
      groups.push({ rows: [...head, ...rat, gap(size * 0.9)], keep: false });
    }
  }
  return groups;
}

function blockGroups(blocks: Block[], ctx: { colW: number; size: number; set: FontSet }): Group[] {
  const { colW, size, set } = ctx;
  const groups: Group[] = [];
  const spansOf = (text: string, color: string, bold = false, sz?: number): Span[] => parseInline(text).map(s => ({ text: s.text, bold: bold || s.bold, color, size: sz }));
  for (const b of blocks) {
    if (b.type === 'hr') { groups.push({ rows: [gap(size * 0.5), { kind: 'rule', h: 1, color: C.rule }, gap(size * 0.7)], keep: true }); continue; }
    if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3') {
      const sz = size * (b.type === 'h1' ? 1.7 : b.type === 'h2' ? 1.38 : 1.12);
      groups.push({ rows: [gap(size * (b.type === 'h3' ? 0.7 : 1.1)), ...rowsFor(spansOf(b.text, b.type === 'h3' ? '#374151' : C.ink, true, sz), { colW, size: sz, set, lh: 1.3 }), gap(size * 0.35)], keep: true, keepNext: true });
    } else if (b.type === 'li') {
      const indent = 8 + b.level * 12;
      const mw = measureText(b.marker + ' ', false, size, set);
      groups.push({ rows: [...rowsFor([{ text: b.marker + ' ', bold: false, color: C.accent }, ...spansOf(b.text, C.text)], { colW, size, set, indent, hang: mw }), gap(size * 0.3)], keep: true });
    } else if (b.type === 'quote') {
      groups.push({ rows: [...rowsFor(spansOf(b.text, '#4b5563'), { colW, size, set, indent: 10, bar: C.accent }), gap(size * 0.5)], keep: true });
    } else {
      groups.push({ rows: [...rowsFor(spansOf(b.text, C.text), { colW, size, set }), gap(size * 0.55)], keep: false });
    }
  }
  return groups;
}

/* ───────────────────────────── header ───────────────────────────── */

function headerOps(doc: ReportDoc, style: ReportStyle, set: FontSet, pageW: number): { ops: Op[]; height: number } {
  const ops: Op[] = [];
  const x0 = MARGIN.l, w = pageW - MARGIN.l - MARGIN.r;
  ops.push({ t: 'rect', x: 0, y: 0, w: pageW, h: 7, fill: C.accent });
  let y = 26;
  ops.push({ t: 'text', x: x0, y: y + 6, text: `${style.brand.toUpperCase()}  ·  ${doc.kind === 'exam' ? 'EXAM PAPER' : doc.kind === 'revision' ? 'REVISION SHEET' : doc.kind === 'notes' ? 'STUDY NOTES' : 'QUIZ REPORT'}`, bold: true, size: 7.5, color: C.accent });
  y += 14;
  const titleLines = wrapSpans([{ text: doc.title, bold: true }], w, 19, set).slice(0, 2);
  for (const l of titleLines) { ops.push({ t: 'text', x: x0, y: y + 15, text: l.map(s => s.text).join(''), bold: true, size: 19, color: C.ink }); y += 23; }
  if (doc.subtitle) { ops.push({ t: 'text', x: x0, y: y + 8, text: doc.subtitle, bold: false, size: 10, color: C.muted }); y += 15; }
  if (doc.meta.length) {
    for (const l of wrapSpans([{ text: doc.meta.join('   ·   '), bold: false }], w, 8.6, set)) { ops.push({ t: 'text', x: x0, y: y + 8, text: l.map(s => s.text).join(''), bold: false, size: 8.6, color: C.faint }); y += 12; }
  }
  const s = doc.summary;
  if (s && doc.items) {
    y += 6;
    const chips: { v: string; l: string; c: string }[] = [
      { v: String(doc.items.length), l: doc.kind === 'all' ? 'QUESTIONS' : 'SHOWN', c: C.ink },
      { v: String(s.correct), l: 'CORRECT', c: C.good }, { v: String(s.wrong), l: 'WRONG', c: C.bad }, { v: String(s.skipped), l: 'SKIPPED', c: C.warn },
      { v: `${s.accuracy}%`, l: 'ACCURACY', c: C.accent },
    ];
    if (s.scorePct !== undefined) chips.push({ v: `${s.scorePct}%`, l: 'SCORE', c: C.accent });
    const gapW = 6, cw = (w - gapW * (chips.length - 1)) / chips.length;
    chips.forEach((c, i) => {
      const cx = x0 + i * (cw + gapW);
      ops.push({ t: 'rect', x: cx, y, w: cw, h: 34, fill: C.chip, stroke: C.chipLine, sw: 0.6, r: 5 });
      ops.push({ t: 'text', x: cx + 8, y: y + 17, text: c.v, bold: true, size: 13, color: c.c });
      ops.push({ t: 'text', x: cx + 8, y: y + 28, text: c.l, bold: true, size: 6.4, color: C.faint });
    });
    y += 34;
  }
  y += 10;
  ops.push({ t: 'line', x1: x0, y1: y, x2: x0 + w, y2: y, w: 0.8, color: C.divider });
  return { ops, height: y + 8 };
}

/* ───────────────────────────── flow ───────────────────────────── */

export function layoutReport(doc: ReportDoc, style: ReportStyle, set: FontSet): LaidOutReport {
  const paper = PAPER[style.paper] ?? PAPER.a4;
  const cols = style.columns === 1 ? 1 : 2;
  const size = BASE[style.fontSize] ?? BASE.md;
  const contentW = paper.w - MARGIN.l - MARGIN.r;
  const colW = (contentW - GUTTER * (cols - 1)) / cols;
  const colBottom = paper.h - MARGIN.b;

  const multiSource = new Set((doc.items ?? []).map(i => i.source).filter(Boolean)).size > 1;
  const ctx = { colW, size, set, style, multiSource, maxKeep: (colBottom - MARGIN.t) * 0.42 };
  const groups: Group[] = [];
  if (doc.items) {
    for (const it of doc.items) groups.push(...itemGroups(it, ctx));
    if (style.answers === 'key' && doc.items.length) groups.push(...keyGroups(doc.items, ctx));
  }
  if (doc.blocks) groups.push(...blockGroups(doc.blocks, ctx));

  const pages: Page[] = [];
  const colTops: number[] = [];
  const newPage = (): Page => { const p: Page = { width: paper.w, height: paper.h, number: pages.length + 1, ops: [] }; pages.push(p); return p; };
  let page = newPage();
  let headerH = MARGIN.t;
  if (style.header) { const h = headerOps(doc, style, set, paper.w); page.ops.push(...h.ops); headerH = h.height + 4; }
  colTops.push(headerH);
  let col = 0, y = headerH;
  const atTop = () => y === colTops[pages.length - 1];

  const nextSlot = () => {
    if (cols === 2 && col === 0) { col = 1; y = colTops[pages.length - 1]; return; }
    page = newPage(); colTops.push(MARGIN.t); col = 0; y = MARGIN.t;
  };
  const draw = (rows: Row[]) => {
    const x0 = MARGIN.l + col * (colW + GUTTER);
    for (const r of rows) {
      if (r.kind === 'text') {
        let x = x0 + r.x;
        const base = y + (r.lh - r.size) / 2 + r.size * 0.8;
        if (r.bar) page.ops.push({ t: 'rect', x: x0 + 2, y: y + 1, w: 2.2, h: r.lh - 2, fill: r.bar });
        for (const s of r.spans) {
          if (s.text === '') continue;
          const sz = s.size ?? r.size;
          page.ops.push({ t: 'text', x, y: base, text: s.text, bold: s.bold, size: sz, color: s.color ?? C.text });
          x += measureText(s.text, s.bold, sz, set);
        }
      } else if (r.kind === 'rule') {
        page.ops.push({ t: 'line', x1: x0, y1: y + r.h / 2, x2: x0 + colW, y2: y + r.h / 2, w: 0.7, color: r.color, dash: r.dash });
      }
      y += rowH(r);
    }
  };

  const minRows = (rows: Row[], n: number): number => { let h = 0, c = 0; for (const r of rows) { h += rowH(r); if (r.kind === 'text' && ++c >= n) break; } return h; };

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    let rows = g.rows.slice();
    if (atTop()) rows = trimGapEdges(rows);
    if (!rows.length) continue;
    const next = groups[gi + 1];
    let guard = 0;
    while (rows.length && guard++ < 500) {
      const h = sumH(rows);
      const remaining = colBottom - y;
      const fullH = colBottom - colTops[pages.length - 1];
      const nextNeeds = g.keepNext && next ? minRows(next.rows, 2) : 0;
      if (h + nextNeeds <= remaining) { draw(rows); rows = []; break; }
      if (g.keep && h + nextNeeds <= fullH && !atTop()) { nextSlot(); rows = trimGapEdges(rows); continue; }
      // split by rows, keeping at least 2 text rows on each side (no widows / orphans)
      const texts = rows.filter(r => r.kind === 'text').length;
      let used = 0, cut = 0, seen = 0;
      for (let i = 0; i < rows.length; i++) {
        const rh = rowH(rows[i]);
        if (used + rh > remaining) break;
        used += rh; cut = i + 1; if (rows[i].kind === 'text') seen++;
      }
      const tail = texts - seen;
      if (seen >= 2 && (tail >= 2 || tail === 0) && cut > 0 && cut < rows.length) {
        draw(rows.slice(0, cut)); rows = trimGapEdges(rows.slice(cut)); nextSlot(); continue;
      }
      if (!atTop()) { nextSlot(); rows = trimGapEdges(rows); continue; }
      // already at the top of an empty column and still too tall: force-cut so we always make progress
      const force = Math.max(1, cut);
      draw(rows.slice(0, force)); rows = trimGapEdges(rows.slice(force)); if (rows.length) nextSlot();
    }
  }

  // chrome: column divider + footer on every page
  const total = pages.length;
  pages.forEach((p, i) => {
    if (cols === 2) { const x = MARGIN.l + colW + GUTTER / 2; p.ops.push({ t: 'line', x1: x, y1: colTops[i], x2: x, y2: colBottom, w: 0.6, color: C.divider }); }
    p.ops.push({ t: 'line', x1: MARGIN.l, y1: paper.h - MARGIN.b + 12, x2: paper.w - MARGIN.r, y2: paper.h - MARGIN.b + 12, w: 0.5, color: C.divider });
    const fy = paper.h - MARGIN.b + 27;
    const label = `Page ${p.number} of ${total}`;
    p.ops.push({ t: 'text', x: MARGIN.l, y: fy, text: truncate(doc.title, 46, set), bold: false, size: 7.6, color: C.faint });
    p.ops.push({ t: 'text', x: paper.w / 2 - measureText(label, false, 8, set) / 2, y: fy, text: label, bold: false, size: 8, color: C.muted });
    p.ops.push({ t: 'text', x: paper.w - MARGIN.r - measureText(style.brand, true, 8, set), y: fy, text: style.brand, bold: true, size: 8, color: C.muted });
  });
  return { pages, style, title: doc.title };
}

function truncate(s: string, max: number, set: FontSet): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  void set;
  return t.slice(0, max - 1).trimEnd() + '…';
}
