/**
 * MASTER REPORT — self-contained HTML edition.
 *
 * The same premium dashboard as `masterTemplate.ts` (which draws the vector PDF), expressed as one HTML file with
 * its CSS inlined and every icon an inline SVG: no fonts, scripts, images or network access, so it opens anywhere
 * — including offline on a phone — and prints or exports to PDF exactly as it looks on screen.
 *
 * Geometry follows the approved reference: 1000px content column on white, 2-column 16px grid, 12px radii,
 * 16px card padding, `0 2px 8px rgba(0,0,0,.04)` elevation, Inter with a system fallback stack (weights 400–800).
 * Status colours: correct #f0fdf4/#bbf7d0, wrong #fef2f2/#fecaca, skipped #fefce8/#fef08a (Tailwind yellow-50/200). Question cards: status icon, Q#, difficulty dot, options with a
 * green check, then the 📖 rationale bullets (no text labels).
 */
import { parseInline } from './markdown';
import type { ReportDoc, ReportItem, ReportStyle } from './types';
import { AI_EMOJI, BOOK_EMOJI, DIFF_EMOJI, STATUS_EMOJI, levelOf, markedOptions, rationaleBullets } from './cardModel';

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
  --sk-bg:#FEFCE8;--sk-bd:#FEF08A;--sk-ink:#A16207;--sk-pill:#FEF9C3;
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
/* question card: [status] Q1. [difficulty] text / options with a ✓ / divider / 📖 rationale (no text labels) */
.qh{display:flex;align-items:flex-start;gap:7px;font-size:12.5px;line-height:1.4;color:var(--ink)}
.qh .st{flex:none;font-size:15px;line-height:1.25}
.qh .qn{flex:none;font-weight:800;line-height:1.4}
.qh .dl{flex:none;font-size:11px;line-height:1.6}
.qh .qt{flex:1;min-width:0;font-weight:600;word-break:break-word}
.opts{display:grid;gap:3px;margin:9px 0 0 24px}
.opt{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;font-size:11.5px;line-height:1.45;color:var(--ink-2);min-width:0}
.opt .ot{min-width:0;overflow-wrap:anywhere}
.opt .ot b{font-weight:800;color:var(--ink)}
.opt .mk{flex:none;font-weight:800;font-size:13px;line-height:1.3}
.opt .mk.ok{color:#16A34A}.opt .mk.no{color:#DC2626}
hr.div{border:0;border-top:1px solid;margin:10px 0 8px}
.card.ok hr.div{border-color:var(--ok-bd)}.card.no hr.div{border-color:var(--no-bd)}.card.sk hr.div{border-color:var(--sk-bd)}.card.un hr.div{border-color:#E2E8F0}
.rat{display:flex;gap:7px;align-items:flex-start;margin:0 0 4px}
.rat .ic{flex:none;font-size:13px;line-height:1.4;width:17px}
.rat ul{margin:0;padding:0;list-style:none;min-width:0}
.rat li{font-size:11px;line-height:1.45;color:var(--ex-text);overflow-wrap:anywhere;margin:0 0 2px}
.rat li::before{content:"•";margin-right:5px;color:var(--ex-ink)}

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

@media (prefers-color-scheme:dark){
  :root{--ink:#F3F4F6;--ink-2:#D1D5DB;--mute:#9CA3AF;--faint:#8B92A0;--line:rgba(229,231,235,.14);--ex-text:#D1D5DB;--ex-ink:#C4B5FD;
    --ok-bg:rgba(5,46,22,.30);--ok-bd:rgba(34,197,94,.30);--ok-ink:#86EFAC;
    --no-bg:rgba(69,10,10,.30);--no-bd:rgba(239,68,68,.30);--no-ink:#FCA5A5;
    --sk-bg:rgba(66,32,6,.30);--sk-bd:rgba(234,179,8,.30);--sk-ink:#FDE047}
  body{background:#07070B}.page{background:#0E0E14}
  .key,.md{background:#14141C}.card.un{background:#14141C;border-color:rgba(229,231,235,.14)}
  .opt .mk.ok{color:#4ADE80}.opt .mk.no{color:#F87171}
}
@media (max-width:820px){
  .page{padding:14px 12px 20px}
  .grid{grid-template-columns:1fr;gap:12px}
  .stats{grid-template-columns:repeat(3,1fr);gap:8px}
  .mast-row{flex-wrap:wrap}
  .verdict{order:3;width:100%;max-width:none}
  .mast h1{font-size:19px}
  .key ol{columns:1}
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

/** Question card (same rules as the PDF: see cardModel.ts). */
function questionCard(it: ReportItem, style: ReportStyle): string {
  const st = STATUS[it.status] ?? STATUS.unknown;
  const inline = style.answers === 'inline';
  const options = it.options ?? [];
  const lvl = levelOf(it.difficulty);
  const m = markedOptions(it, { inlineAnswers: inline, showUserAnswer: style.showUserAnswer });
  const icon = it.status === 'correct' || it.status === 'wrong' || it.status === 'skipped' ? STATUS_EMOJI[it.status] : '';
  const label = it.status === 'correct' ? 'Correct' : it.status === 'wrong' ? 'Incorrect' : it.status === 'skipped' ? 'Skipped' : '';

  const head = `<div class="qh">${icon ? `<span class="st" role="img" aria-label="${label}">${icon}</span>` : ''}<span class="qn">Q${it.n}.</span>${lvl ? `<span class="dl" role="img" aria-label="${lvl}">${DIFF_EMOJI[lvl]}</span>` : ''}<span class="qt">${esc(it.question || '(no question text)')}</span></div>`;
  const opts = options.length
    ? `<div class="opts">${options.map((o, i) => `<div class="opt"><span class="ot"><b>(${L(i)})</b> ${esc(o)}</span>${m.ok[i] ? '<span class="mk ok" aria-label="Correct answer">✓</span>' : m.no[i] ? '<span class="mk no" aria-label="Your answer">✗</span>' : ''}</div>`).join('')}</div>`
    : '';
  let inlineAnsHtml = '';
  if (inline) {
    const ansSummary = (it.correct ?? []).map(c => {
      const i = options.findIndex(o => o.trim() === c.trim());
      return i >= 0 ? `(${L(i)}) ${c}` : c;
    }).join(', ');
    const ansColor = it.status === 'correct' ? '#15803d' : it.status === 'wrong' ? '#b91c1c' : '#15803d';
    inlineAnsHtml = `<div class="ans-line" style="font-weight:700;color:${ansColor};margin:4px 0 6px 0;font-size:12px;">Ans. - ${esc(ansSummary)}.</div>`;
  }
  const rat = (emoji: string, text: string | undefined) => {
    const bullets = rationaleBullets(text);
    return bullets.length ? `<div class="rat"><span class="ic" aria-hidden="true">${emoji}</span><ul>${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>` : '';
  };
  const rationale = inline ? rat(BOOK_EMOJI, it.book) + rat(AI_EMOJI, it.ai) : '';
  return `<article class="card ${st.cls}">
  ${head}
  ${opts}
  ${inlineAnsHtml}
  ${rationale ? `<hr class="div">${rationale}` : ''}
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
