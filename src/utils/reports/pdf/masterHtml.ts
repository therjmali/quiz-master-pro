/**
 * MASTER REPORT — self-contained HTML edition.
 *
 * The same premium dashboard as `masterTemplate.ts` (which draws the vector PDF), expressed as one HTML file with
 * its CSS inlined and every icon an inline SVG: no fonts, scripts, images or network access, so it opens anywhere
 * — including offline on a phone — and prints or exports to PDF exactly as it looks on screen.
 *
 * Geometry follows the approved reference: 1000px content column on white, 2-column 16px grid, 12px radii,
 * 16px card padding, `0 2px 8px rgba(0,0,0,.04)` elevation, Inter with a system fallback stack (weights 400–800).
 * Status colours: correct #f0fdf4/#bbf7d0, wrong #fef2f2/#fecaca, skipped #fffbeb/#fde68a, explanation #f5f3ff.
 */
import { parseInline } from './markdown';
import type { ReportDoc, ReportItem, ReportStyle } from './types';

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const L = (i: number) => String.fromCharCode(65 + (i % 26));
const round = (v: number | undefined, f = 0) => Math.max(0, Math.min(100, Number.isFinite(v) ? Math.round(v as number) : f));

const STATUS = {
  correct: { cls: 'ok', label: 'Correct' },
  wrong: { cls: 'no', label: 'Wrong' },
  skipped: { cls: 'sk', label: 'Skipped' },
  unknown: { cls: 'un', label: 'Question' },
} as const;

/* ── inline icons (no external assets) ── */

const ICON = {
  trophy: (size = 26) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill="#F2B233"/><path d="M7 5H4.6a3 3 0 0 0 3 3.2M17 5h2.4a3 3 0 0 1-3 3.2" stroke="#F2B233" stroke-width="1.5" stroke-linecap="round"/><path d="M12 14v3.2M8.4 19.4h7.2" stroke="#F2B233" stroke-width="2" stroke-linecap="round"/></svg>`,
  check: (c = '#fff', size = 13, w = 3.2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 12.6 9.6 18 19.5 6.6" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cross: (c = 'currentColor', size = 13) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`,
  skip: (c = 'currentColor', size = 13) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 12h12" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`,
  bars: (c = '#4B2C7F', w = 26, h = 16) => `<svg width="${w}" height="${h}" viewBox="0 0 26 16" fill="none" aria-hidden="true"><rect x="0" y="9" width="5" height="7" rx="1.6" fill="${c}"/><rect x="10.5" y="5" width="5" height="11" rx="1.6" fill="${c}"/><rect x="21" y="0" width="5" height="16" rx="1.6" fill="${c}"/></svg>`,
  doc: (c = '#4B2C7F') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Z" stroke="${c}" stroke-width="1.9" stroke-linejoin="round"/><path d="M9 12h6M9 16h4" stroke="${c}" stroke-width="1.9" stroke-linecap="round"/></svg>`,
  ring: (c = '#4B2C7F') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="${c}" stroke-width="1.9"/><circle cx="12" cy="12" r="3.4" fill="${c}"/></svg>`,
  star: (c = '#4B2C7F') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.6l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 10l6.1-.8L12 3.6Z" fill="${c}"/></svg>`,
  okDot: (c = '#15803D') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="${c}" stroke-width="1.9"/><path d="M8.2 12.3 11 15.1l5-5.6" stroke="${c}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  noDot: (c = '#B91C1C') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="${c}" stroke-width="1.9"/><path d="M9 9l6 6M15 9l-6 6" stroke="${c}" stroke-width="1.9" stroke-linecap="round"/></svg>`,
  skDot: (c = '#B45309') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="${c}" stroke-width="1.9"/><path d="M8.4 12h7.2" stroke="${c}" stroke-width="1.9" stroke-linecap="round"/></svg>`,
};

const STEPS = [
  { key: 'doc', label: 'Shown', icon: ICON.doc },
  { key: 'ok', label: 'Correct', icon: () => ICON.okDot() },
  { key: 'no', label: 'Wrong', icon: () => ICON.noDot() },
  { key: 'sk', label: 'Skipped', icon: () => ICON.skDot() },
  { key: 'acc', label: 'Accuracy', icon: () => ICON.ring() },
  { key: 'score', label: 'Score', icon: () => ICON.star() },
];

/* ── css ── */

const CSS = `
:root{
  --purple-0:#33205A;--purple-1:#4B2C7F;--purple-2:#5B3A93;--gold:#F2B233;
  --ink:#111827;--ink-2:#374151;--mute:#6B7280;--faint:#9CA3AF;--line:rgba(17,24,39,.10);
  --ok-bg:#F0FDF4;--ok-bd:#BBF7D0;--ok-ink:#15803D;--ok-pill:#DCFCE7;
  --no-bg:#FEF2F2;--no-bd:#FECACA;--no-ink:#B91C1C;--no-pill:#FEE2E2;
  --sk-bg:#FFFBEB;--sk-bd:#FDE68A;--sk-ink:#B45309;--sk-pill:#FEF3C7;
  --ex-bg:#F5F3FF;--ex-bd:#DDD6FE;--ex-ink:#6D28D9;--ex-text:#4B5563;--ai-ink:#0E7490;
  --radius:12px;--pad:16px;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#EEF1F6;color:var(--ink);
  font-family:Inter,"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;
  font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.page{max-width:1000px;margin:0 auto;background:#fff;padding:20px 18px 26px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:10px;font-weight:700;
  letter-spacing:.10em;text-transform:uppercase;color:var(--faint);padding-bottom:10px}

/* masthead */
.mast{position:relative;overflow:hidden;border-radius:var(--radius);padding:18px;
  background:linear-gradient(135deg,#3A1F5E 0%,#4B2C7F 52%,#5B3A93 100%);
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.mast::after{content:"";position:absolute;right:-70px;top:-90px;width:260px;height:260px;border-radius:50%;
  background:rgba(255,255,255,.06)}
.mast-row{display:flex;align-items:flex-start;gap:14px;position:relative;z-index:1}
.mast-trophy{flex:none;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;
  background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.20)}
.mast-body{min-width:0;flex:1}
.kicker{font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.72)}
.mast h1{margin:3px 0 0;font-size:22px;line-height:1.2;font-weight:800;color:#fff;letter-spacing:-.01em;word-break:break-word}
.mast-meta{margin-top:5px;font-size:10.5px;color:rgba(255,255,255,.66);display:flex;flex-wrap:wrap;gap:4px 10px}
.mast-meta span{display:inline-flex;align-items:center;gap:6px}
.mast-meta span+span::before{content:"";width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,.38)}
.verdict{flex:none;display:flex;align-items:center;gap:9px;padding:7px 13px 7px 8px;border-radius:999px;
  background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.22);max-width:240px}
.verdict .tick{flex:none;width:24px;height:24px;border-radius:50%;background:#22C55E;display:grid;place-items:center}
.verdict b{display:block;font-size:11.5px;font-weight:800;color:#fff;line-height:1.25}
.verdict small{display:block;font-size:9.5px;color:rgba(255,255,255,.72);line-height:1.3}
.verdict .chart{flex:none;display:flex;align-items:flex-end}

/* stats bar */
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:14px}
.stat{display:flex;align-items:center;gap:9px;padding:11px 12px;border:1px solid var(--line);
  border-radius:10px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.stat .ic{flex:none;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:#F6F4FB}
.stat b{display:block;font-size:16px;font-weight:800;line-height:1.05;letter-spacing:-.02em}
.stat small{display:block;font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);margin-top:2px}
.stat.ok b{color:var(--ok-ink)}.stat.no b{color:var(--no-ink)}.stat.sk b{color:var(--sk-ink)}

/* question grid */
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;align-items:start}
.card{border-radius:var(--radius);padding:var(--pad);border:1.5px solid transparent;
  box-shadow:0 2px 8px rgba(0,0,0,.04);break-inside:avoid;page-break-inside:avoid}
.card.ok{background:var(--ok-bg);border-color:var(--ok-bd)}
.card.no{background:var(--no-bg);border-color:var(--no-bd)}
.card.sk{background:var(--sk-bg);border-color:var(--sk-bd)}
.card.un{background:#F8FAFC;border-color:#E2E8F0}
.card-head{display:flex;align-items:flex-start;gap:9px}
.num{flex:none;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;background:#fff;
  border:1.5px solid var(--line);font-size:11.5px;font-weight:800;font-variant-numeric:tabular-nums}
.card.ok .num{color:var(--ok-ink);border-color:var(--ok-bd)}
.card.no .num{color:var(--no-ink);border-color:var(--no-bd)}
.card.sk .num{color:var(--sk-ink);border-color:var(--sk-bd)}
.qtext{flex:1;min-width:0;font-size:12.5px;font-weight:700;line-height:1.38;color:var(--ink);word-break:break-word}
.pill{flex:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;
  font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
.pill.ok{background:var(--ok-pill);color:var(--ok-ink)}
.pill.no{background:var(--no-pill);color:var(--no-ink)}
.pill.sk{background:var(--sk-pill);color:var(--sk-ink)}
.pill.un{background:#F1F5F9;color:var(--mute)}

/* options */
.opts{display:grid;gap:7px;margin-top:11px}
.opts.two{grid-template-columns:1fr 1fr}
.opt{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;background:#fff;
  border:1px solid var(--line);font-size:11.5px;color:var(--ink-2);min-width:0}
.opt .lt{flex:none;width:19px;height:19px;border-radius:50%;display:grid;place-items:center;
  background:#F1F2F5;border:1px solid #E3E6EB;font-size:9.5px;font-weight:800;color:var(--ink-2)}
.opt span{min-width:0;overflow-wrap:anywhere}

/* explanation */
.ex{margin-top:10px;border-radius:10px;background:var(--ex-bg);border:1px solid var(--ex-bd);
  padding:11px 12px 11px 14px;position:relative;overflow:hidden}
.ex::before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;background:var(--ex-ink)}
.ex.ok::before{background:var(--ok-ink)}.ex.no::before{background:var(--no-ink)}.ex.sk::before{background:var(--sk-ink)}
.ans{margin:0;font-size:11.5px;font-weight:800;line-height:1.35;color:var(--ex-ink)}
.ex.ok .ans{color:var(--ok-ink)}.ex.no .ans{color:var(--no-ink)}.ex.sk .ans{color:var(--sk-ink)}
.you{margin:4px 0 0;font-size:11px;color:var(--ex-text)}
.rat{margin:6px 0 0;font-size:11px;line-height:1.45;color:var(--ex-text);overflow-wrap:anywhere}
.rat b{display:block;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--ex-ink);margin-bottom:1px}
.rat.ai b{color:var(--ai-ink)}

/* summary */
.summary{border-radius:var(--radius);padding:15px 16px;color:#fff;break-inside:avoid;
  background:linear-gradient(140deg,#3A1F5E 0%,#4B2C7F 58%,#5B3A93 100%);
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.summary h2{margin:0;font-size:14px;font-weight:800;display:flex;align-items:center;gap:8px}
.summary .sub{font-size:9.5px;color:rgba(255,255,255,.60);margin-top:1px}
.mini{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:11px}
.mini div{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 9px;
  border-radius:8px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);
  font-size:10.5px;color:rgba(255,255,255,.72)}
.mini b{font-size:12px;font-weight:800;color:#fff}
.mini .c-ok b{color:#6EE7B7}.mini .c-no b{color:#FCA5A5}.mini .c-sk b{color:#FCD34D}.mini .c-ac b{color:#C4B5FD}
.score{margin-top:9px;border-radius:9px;background:rgba(0,0,0,.20);border:1px solid rgba(255,255,255,.10);
  padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.score small{font-size:9.5px;color:rgba(255,255,255,.56);display:block}
.score .big{font-size:26px;font-weight:800;line-height:1.05;letter-spacing:-.02em}
.score .note{font-size:9.5px;color:rgba(255,255,255,.58);margin-top:2px}

/* answer key + markdown */
.key{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:var(--pad);
  box-shadow:0 2px 8px rgba(0,0,0,.04);grid-column:1/-1}
.key h2{margin:0 0 8px;font-size:14px;font-weight:800;color:var(--purple-1)}
.key ol{margin:0;padding:0;list-style:none;columns:2;column-gap:22px}
.key li{display:flex;gap:6px;justify-content:space-between;font-size:11px;padding:2.5px 0;
  border-bottom:1px solid rgba(17,24,39,.05);break-inside:avoid}
.key li span{color:var(--ink-2);min-width:0;overflow-wrap:anywhere}
.key li b{color:var(--ok-ink);white-space:nowrap}
.md{grid-column:1/-1;background:#fff;border:1px solid var(--line);border-radius:var(--radius);
  padding:14px var(--pad);box-shadow:0 2px 8px rgba(0,0,0,.04);break-inside:avoid}
.md h2,.md h3,.md h4{margin:10px 0 5px;color:var(--purple-1);font-weight:800;line-height:1.3}
.md h2{font-size:15px}.md h3{font-size:13px}.md h4{font-size:12px}
.md h2:first-child,.md h3:first-child{margin-top:0}
.md p{margin:6px 0;font-size:12px;color:var(--ink-2);overflow-wrap:anywhere}
.md ul{margin:6px 0;padding-left:18px}.md li{font-size:12px;margin:2px 0;color:var(--ink-2)}
.md blockquote{margin:8px 0;padding-left:11px;border-left:3px solid var(--ex-bd);color:var(--ink-2)}
.md hr{border:0;border-top:1px solid var(--line);margin:12px 0}

/* footer */
.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:18px;
  padding-top:10px;border-top:1px solid var(--line);font-size:10px;color:var(--mute)}
.foot .brand{font-weight:800;color:var(--purple-1);letter-spacing:.02em}
.foot .brand small{display:block;font-weight:600;color:var(--faint);letter-spacing:0;font-size:8.5px;margin-top:1px}
.foot .mid{display:flex;align-items:center;gap:7px;font-weight:600}

@media (max-width:820px){
  .page{padding:14px 12px 20px}
  .grid{grid-template-columns:1fr;gap:12px}
  .stats{grid-template-columns:repeat(3,1fr);gap:8px}
  .mast-row{flex-wrap:wrap}
  .verdict{order:3;width:100%;max-width:none}
  .mast h1{font-size:19px}
  .key ol{columns:1}
  .opts.two{grid-template-columns:1fr}
}
@media (max-width:420px){.stats{grid-template-columns:repeat(2,1fr)}}
@media print{
  body{background:#fff}
  .page{max-width:none;padding:0}
  .card,.md,.key,.summary{box-shadow:none}
  .grid{grid-template-columns:1fr 1fr}
  .flyleaf{break-after:page}
}
`;

/* ── pieces ── */

function masthead(doc: ReportDoc, style: ReportStyle): string {
  const s = doc.summary;
  const shown = s?.shown ?? doc.items?.length ?? 0;
  const kindLabel = doc.kind === 'exam' ? 'Exam paper' : doc.kind === 'revision' ? 'Revision sheet' : doc.kind === 'notes' ? 'Study notes' : 'Master report';
  const verdict = !s ? 'Report ready' : s.accuracy >= 75 ? 'Great attempt!' : s.accuracy >= 45 ? 'Good effort!' : 'Keep going!';
  const meta = (doc.meta ?? []).filter(Boolean).slice(0, 3);
  const facts = [
    `${shown} question${shown === 1 ? '' : 's'}`,
    s?.timeSec ? `${Math.floor(s.timeSec / 60)}m ${round(s.timeSec % 60)}s` : '',
    s?.timeSec ? 'on device' : '',
  ].filter(Boolean);
  return `<header class="mast">
  <div class="mast-row">
    <div class="mast-trophy">${ICON.trophy(24)}</div>
    <div class="mast-body">
      <div class="kicker">${esc(style.brand)} &middot; ${esc(kindLabel)}</div>
      <h1>${esc(doc.title || 'Report')}</h1>
      <div class="mast-meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}${facts.length ? `<span>${esc(facts.join(' · '))}</span>` : ''}</div>
    </div>
    <div class="verdict">
      <div class="tick">${ICON.check('#fff', 13)}</div>
      <div><b>${esc(verdict)}</b><small>${s ? `${round(s.accuracy)}% accuracy` : 'Saved on device'}</small></div>
      <div class="chart">${ICON.bars('#F2B233', 22, 18)}</div>
    </div>
  </div>
</header>`;
}

function statsBar(doc: ReportDoc): string {
  const s = doc.summary;
  const shown = s?.shown ?? doc.items?.length ?? 0;
  const values: Record<string, { v: string; cls?: string }> = {
    doc: { v: String(shown) },
    ok: { v: String(s?.correct ?? 0), cls: 'ok' },
    no: { v: String(s?.wrong ?? 0), cls: 'no' },
    sk: { v: String(s?.skipped ?? 0), cls: 'sk' },
    acc: { v: `${round(s?.accuracy)}%` },
    score: { v: `${round(s?.scorePct ?? s?.maxScore)}%` },
  };
  return `<div class="stats">${STEPS.map(st => {
    const val = values[st.key];
    return `<div class="stat ${val.cls ?? ''}"><div class="ic">${st.icon()}</div><div><b>${esc(val.v)}</b><small>${esc(st.label)}</small></div></div>`;
  }).join('')}</div>`;
}

function userLine(it: ReportItem): string {
  if (it.status === 'skipped') return 'Your answer: not attempted';
  const i = it.options.findIndex(o => o.trim() === String(it.user ?? '').trim());
  return `Your answer: ${it.user ? (i >= 0 ? `(${L(i)}) ` : '') + it.user : '—'}`;
}

function questionCard(it: ReportItem, style: ReportStyle): string {
  const st = STATUS[it.status] ?? STATUS.unknown;
  const options = it.options ?? [];
  const idxOf = (t: string) => options.findIndex(o => o.trim() === String(t ?? '').trim());
  // 2-up only when every option is short enough to read comfortably in half a column
  const twoUp = options.length >= 2 && options.length <= 4 && options.every(o => o.length <= 26 && !o.includes('\n'));

  const answers = (it.correct ?? []).map(c => { const i = idxOf(c); return i >= 0 ? `(${L(i)}) ${c}` : String(c); }).join(', ');
  const answerLine = !answers ? '' : `<p class="ans">Ans.${it.n}.: ${esc(answers)}</p>`;
  const explain = [it.book?.trim() ? `<div class="rat"><b>Explanation</b>${esc(it.book).replace(/\n/g, '<br>')}</div>` : '', it.ai?.trim() ? `<div class="rat ai"><b>AI explanation</b>${esc(it.ai).replace(/\n/g, '<br>')}</div>` : ''].join('');
  const you = style.showUserAnswer && it.status !== 'unknown' ? `<p class="you">${esc(userLine(it))}</p>` : '';
  const showEx = style.answers === 'inline' && (answerLine || you || explain);

  return `<article class="card ${st.cls}">
  <div class="card-head">
    <div class="num">${it.n}</div>
    <div class="qtext">${esc(it.question || '(no question text)')}</div>
    <div class="pill ${st.cls}">${esc(st.label)}</div>
  </div>
  ${options.length ? `<div class="opts${twoUp ? ' two' : ''}">${options.map((o, i) => `<div class="opt"><span class="lt">${L(i)}</span><span>${esc(o)}</span></div>`).join('')}</div>` : ''}
  ${showEx ? `<div class="ex ${st.cls}">${answerLine}${you}${explain}</div>` : ''}
</article>`;
}

function summaryCard(doc: ReportDoc): string {
  const s = doc.summary;
  const score = round(s?.scorePct ?? s?.maxScore);
  const mini = [
    { v: String(s?.correct ?? 0), l: 'Correct', c: 'c-ok' },
    { v: String(s?.wrong ?? 0), l: 'Wrong', c: 'c-no' },
    { v: String(s?.skipped ?? 0), l: 'Skipped', c: 'c-sk' },
    { v: `${round(s?.accuracy)}%`, l: 'Accuracy', c: 'c-ac' },
  ];
  return `<aside class="summary">
  <h2>${ICON.trophy(18)} Quiz Summary</h2>
  <div class="sub">${s?.scope === 'profile' ? 'Across all quizzes' : 'This attempt'}</div>
  <div class="mini">${mini.map(m => `<div class="${m.c}"><span>${esc(m.l)}</span><b>${esc(m.v)}</b></div>`).join('')}</div>
  <div class="score">
    <div><small>Score</small><div class="big">${score}%</div><div class="note">${score >= 60 ? 'Nice work — keep going!' : 'Practice more, score higher!'}</div></div>
    ${ICON.bars('#F2B233', 42, 30)}
  </div>
</aside>`;
}

function answerKeyCard(items: ReportItem[]): string {
  return `<section class="key"><h2>Answer Key</h2><ol>${items.map(it => {
    const ans = (it.correct ?? []).map(c => { const i = it.options.findIndex(o => o.trim() === String(c).trim()); return i >= 0 ? `(${L(i)})` : String(c); }).join(', ') || '—';
    return `<li><span>${it.n}. ${esc(it.question || '(no question)')}</span><b>${esc(ans)}</b></li>`;
  }).join('')}</ol></section>`;
}

function markdownCard(doc: ReportDoc): string {
  const parts: string[] = [];
  for (const b of doc.blocks ?? []) {
    if (b.type === 'hr') { parts.push('<hr>'); continue; }
    const inline = parseInline(b.text).map(s => (s.bold ? `<b>${esc(s.text)}</b>` : esc(s.text))).join('');
    if (b.type === 'h1' || b.type === 'h2') parts.push(`<h2>${inline}</h2>`);
    else if (b.type === 'h3') parts.push(`<h3>${inline}</h3>`);
    else if (b.type === 'li') parts.push(`<p style="padding-left:${10 + b.level * 14}px;margin:3px 0">${esc(b.marker)} ${inline}</p>`);
    else if (b.type === 'quote') parts.push(`<blockquote>${inline}</blockquote>`);
    else parts.push(`<p>${inline}</p>`);
  }
  return parts.length ? `<section class="md">${parts.join('')}</section>` : '';
}

/* ── document ── */

export function docToMasterHtml(doc: ReportDoc, style: ReportStyle): string {
  const items = doc.items ?? [];
  const showSummary = !!doc.summary && items.length > 0;
  const cards = items.map(it => questionCard(it, style));
  // the summary closes the grid; a lone trailing card keeps the second column balanced
  if (showSummary) cards.push(summaryCard(doc));
  else if (cards.length % 2 === 1) cards.push('<div></div>');
  if (style.answers === 'key' && items.length) cards.push(answerKeyCard(items));
  const md = markdownCard(doc);
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title || 'Report')} — ${esc(style.brand)}</title>
<meta name="generator" content="${esc(style.brand)} report engine">
<style>${CSS}</style>
</head>
<body>
<main class="page">
  <div class="top"><span>${esc(style.brand)} &middot; ${esc(doc.kind === 'exam' ? 'Exam paper' : doc.kind === 'revision' ? 'Revision sheet' : doc.kind === 'notes' ? 'Study notes' : 'Report')}</span><span>${esc(date)}</span></div>
  ${style.header ? masthead(doc, style) : ''}
  ${style.header && doc.summary ? statsBar(doc) : ''}
  <div class="grid">
    ${cards.join('\n    ')}
    ${md}
  </div>
  <footer class="foot">
    <span class="brand">${esc(style.brand)}<small>Saved on device &middot; works offline</small></span>
    <span class="mid">${ICON.bars('#4B2C7F', 18, 13)} ${esc(doc.title || 'Report')}</span>
    <span>${esc(date)}</span>
  </footer>
</main>
</body>
</html>`;
}
