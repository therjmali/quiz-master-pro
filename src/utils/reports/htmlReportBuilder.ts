import { QuizResult, ReportOrder, RationalePrefs } from '../../types/quiz';
import { formatRationale, rationalePoints } from '../../lib/rationaleFormat';
import { ReportSections, QuestionFilter, ExportFormat } from './reportData';
import { computeReportMeta, getScoreColor, formatTimeSec } from './insightsEngine';
import { mergedBadgeHtml } from '../difficultyBadge';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function htmlLine(s: string): string { return esc(s).replace(/\n/g,'<br>'); }
function cleanAiText(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[•\-\d.]*\s*(memory tip|mnemonic|tip to remember|remember this)[:\s].*/gim, '')
    .replace(/^[•\-\d.]*\s*think of\b.*/gim, '')
    .trim();
}

function formatAiBullets(text: string): string {
  return ratPoints(text);
}

/** Compact bulleted rationale as HTML: 6px gap, line-height 1.5, hanging indent, no emoji. */
function ratPoints(text: string): string {
  const items = rationalePoints(text)
    .map((l, i) => `<li style="margin:${i ? '6px' : '0'} 0 0;line-height:1.5;padding-left:2px;">${esc(l)}</li>`)
    .join('');
  return items ? `<ul style="margin:0;padding-left:1.1em;list-style:disc;">${items}</ul>` : '';
}

function boldToHtml(t: string): string {
  return t.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#dc2626;font-weight:900;">$1</strong>');
}

// ─── SVG Helpers ──────────────────────────────────────────────────────────────
function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const end = Math.min(endDeg, startDeg + 359.9);
  const s = polarToXY(cx, cy, r, startDeg);
  const e = polarToXY(cx, cy, r, end);
  const large = (end - startDeg) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function buildGaugeSvg(pct: number, color: string): string {
  const cx = 70, cy = 70, r = 54;
  const end = pct >= 100 ? 359.9 : (pct / 100) * 360;
  const d = arcPath(cx, cy, r, 0, end);
  return `<svg viewBox="0 0 140 140" width="120" height="120">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="11"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${color}" font-size="24" font-weight="900" font-family="Arial,sans-serif">${pct}%</text>
    <text x="${cx}" y="${cy + 13}" text-anchor="middle" fill="#9ca3af" font-size="9" font-weight="700" font-family="Arial,sans-serif">SCORE</text>
  </svg>`;
}

function buildDonutSvg(correct: number, wrong: number, skipped: number): string {
  const total = correct + wrong + skipped;
  if (!total) return '<p style="color:#9ca3af;font-size:12px;">No data</p>';
  const cx = 52, cy = 52, r = 39;
  const segments = [
    { count: correct, color: '#10b981' },
    { count: wrong,   color: '#ef4444' },
    { count: skipped, color: '#d1d5db' },
  ].filter(s => s.count > 0);
  let cursor = 0;
  const paths = segments.map(seg => {
    const span = (seg.count / total) * 360;
    const d = arcPath(cx, cy, r, cursor, cursor + span);
    cursor += span;
    return `<path d="${d}" fill="none" stroke="${seg.color}" stroke-width="13" stroke-linecap="butt"/>`;
  }).join('');
  const legend = [
    { color: '#10b981', label: 'Correct', count: correct },
    { color: '#ef4444', label: 'Wrong',   count: wrong   },
    { color: '#d1d5db', label: 'Skipped', count: skipped },
  ].filter(l => l.count > 0).map(l =>
    `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;">
      <div style="width:9px;height:9px;border-radius:50%;background:${l.color};flex-shrink:0;"></div>
      <span style="font-size:11.5px;color:#374151;font-family:Arial,sans-serif;">${l.label}: <strong>${l.count}</strong> <span style="color:#9ca3af;">(${Math.round(l.count/total*100)}%)</span></span>
    </div>`
  ).join('');
  return `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
    <svg viewBox="0 0 104 104" width="104" height="104" style="flex-shrink:0;">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="13"/>
      ${paths}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="#111827" font-size="14" font-weight="900" font-family="Arial,sans-serif">${total}</text>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="#9ca3af" font-size="8" font-family="Arial,sans-serif">TOTAL</text>
    </svg>
    <div>${legend}</div>
  </div>`;
}

function buildSubjectBars(breakdown: { subject: string; correct: number; total: number; accuracy: number }[]): string {
  if (!breakdown.length) return '<p style="color:#9ca3af;font-size:12px;text-align:center;padding:12px;">No subject data available.</p>';
  return breakdown.map(b => {
    const color = b.accuracy >= 75 ? '#10b981' : b.accuracy >= 50 ? '#f59e0b' : '#ef4444';
    const label = b.accuracy >= 75 ? '✅ Strong' : b.accuracy >= 50 ? '📖 Practice' : '⚠️ Review';
    return `<div style="margin:5px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
        <span style="font-size:11.5px;font-weight:700;color:#374151;max-width:155px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-family:Arial,sans-serif;">${esc(b.subject)}</span>
        <div style="display:flex;align-items:center;gap:5px;">
          <span style="font-size:8.5px;font-weight:800;color:${color};background:${color}18;padding:2px 7px;border-radius:99px;border:1px solid ${color}35;font-family:Arial,sans-serif;">${label}</span>
          <span style="font-size:11.5px;font-weight:900;color:${color};font-family:Arial,sans-serif;">${b.accuracy}%</span>
        </div>
      </div>
      <div style="background:#f3f4f6;border-radius:99px;height:6px;overflow:hidden;">
        <div style="height:100%;width:${b.accuracy}%;background:${color};border-radius:99px;"></div>
      </div>
      <div style="font-size:9.5px;color:#9ca3af;margin-top:1px;font-family:Arial,sans-serif;">${b.correct}/${b.total} correct</div>
    </div>`;
  }).join('');
}

// ─── Difficulty Sort Order ─────────────────────────────────────────────────────
function getDifficultySortOrder(selected: 'all' | 'easy' | 'medium' | 'hard'): string[] {
  switch (selected) {
    case 'easy':   return ['easy', 'medium', 'hard'];
    case 'medium': return ['medium', 'easy', 'hard'];
    case 'hard':   return ['hard', 'medium', 'easy'];
    default:       return [];
  }
}

function sortItemsByDifficulty<T extends { q: { difficulty?: string } }>(items: T[], difficultySort?: 'all' | 'easy' | 'medium' | 'hard'): T[] {
  if (!difficultySort || difficultySort === 'all') return items;
  const order = getDifficultySortOrder(difficultySort);
  return [...items].sort((a, b) => {
    const da = (a.q.difficulty || 'medium').toLowerCase();
    const db = (b.q.difficulty || 'medium').toLowerCase();
    return order.indexOf(da) - order.indexOf(db);
  });
}

// ─── Report Order Helper ──────────────────────────────────────────────────────
function orderQuizDataForReport(
  r: QuizResult,
  reportOrder: ReportOrder
): Array<{ q: QuizResult['quizData'][0]; ua: string | null }> {
  const pairs = r.quizData.map((q, idx) => ({
    q: reportOrder === 'original'
      ? { ...q, shuffledOpts: q.options }
      : q,
    ua: (r.userAnswers[idx] ?? null) as string | null,
    _sortKey: (reportOrder === 'original')
      ? ((q as any).originalIndex ?? idx)
      : idx,
  }));
  if (reportOrder === 'original') {
    return [...pairs].sort((a, b) => a._sortKey - b._sortKey);
  }
  return pairs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT CSS — Professional Exam Paper Style
// ═══════════════════════════════════════════════════════════════════════════════
const REPORT_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body,p,span,div,td,th,li,a{letter-spacing:0!important;}
body{
  font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;
  background:#eef2f7;
  color:#1a1a1a;
  font-size:13px;
  line-height:1.65;
}
@media print{
  body{background:#fff!important;font-size:11px;}
  .no-print{display:none!important;}
  .qcard{page-break-inside:avoid;}
  .new-page{page-break-before:always;}
  @page{size:A4;margin:14mm 12mm;}
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.page-wrap{max-width:870px;margin:0 auto;padding:22px 16px 48px;}

/* ── Print bar ── */
.print-bar{
  background:linear-gradient(135deg,#1e3a8a,#1e40af);
  color:#fff;padding:12px 20px;border-radius:12px;margin-bottom:20px;
  font-size:12px;display:flex;justify-content:space-between;align-items:center;
  flex-wrap:wrap;gap:10px;font-family:Arial,sans-serif;
  box-shadow:0 4px 20px rgba(30,58,138,.35);
}
.print-btn{
  background:#3b82f6;color:#fff;border:none;padding:8px 20px;border-radius:8px;
  cursor:pointer;font-weight:800;font-size:12px;letter-spacing:.02em;
}

/* ── Cover (exam paper header style) ── */
.cover{
  background:#fff;
  border:2px solid #1a1a1a;
  border-radius:4px;
  padding:22px 26px;
  margin-bottom:16px;
}
.brand-tag{
  font-size:8px;font-weight:800;letter-spacing:.22em!important;
  text-transform:uppercase;color:#888;margin-bottom:10px;
  font-family:Arial,sans-serif;text-align:center;
}
.cover-inner{display:flex;gap:22px;align-items:center;flex-wrap:wrap;}
.cover-text{flex:1;min-width:220px;}
.quiz-title{
  font-size:19px;font-weight:900;line-height:1.3;margin-bottom:10px;
  font-family:Arial,sans-serif;color:#111;
}
.cover-meta{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;}
.badge{
  font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;
  border:1px solid #e5e7eb;background:#f8fafc;color:#555;
  font-family:Arial,sans-serif;
}
.kpi-row{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px;}
.kpi-card{
  border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 14px;
  text-align:center;min-width:68px;background:#fafafa;
}
.kpi-val{font-size:17px;font-weight:900;font-family:Arial,sans-serif;}
.kpi-lbl{
  font-size:7.5px;letter-spacing:.06em!important;text-transform:uppercase;
  color:#9ca3af;margin-top:2px;font-family:Arial,sans-serif;font-weight:700;
}
.verdict{
  display:inline-block;padding:5px 14px;border-radius:99px;
  font-size:11px;font-weight:800;font-family:Arial,sans-serif;
  border:1.5px solid;
}

/* ── Cards ── */
.card{
  background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;
  padding:18px 20px;margin-bottom:14px;
}
.sec-hdr{
  display:flex;align-items:center;justify-content:space-between;
  margin-bottom:14px;padding-bottom:9px;
  border-bottom:2px solid #1a1a1a;flex-wrap:wrap;gap:6px;
}
.sec-title{
  font-size:9px;font-weight:900;text-transform:uppercase;
  letter-spacing:.14em!important;color:#333;font-family:Arial,sans-serif;
}
.sec-count{
  font-size:9px;font-weight:700;padding:3px 9px;border-radius:99px;
  background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;
  font-family:Arial,sans-serif;
}

/* ── Stats grid ── */
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;}
@media(min-width:550px){.stats-grid{grid-template-columns:repeat(6,1fr);}}
.stat-item{
  text-align:center;padding:10px 4px;border-radius:8px;
  border:1.5px solid #e5e7eb;background:#fafafa;
}
.stat-val{font-size:18px;font-weight:900;font-family:Arial,sans-serif;}
.stat-lbl{
  font-size:8px;text-transform:uppercase;letter-spacing:.07em!important;
  color:#9ca3af;font-weight:700;margin-top:2px;font-family:Arial,sans-serif;
}
.perf-row{display:flex;align-items:center;gap:10px;margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;}
.perf-label{font-size:10.5px;font-weight:700;color:#6b7280;min-width:58px;font-family:Arial,sans-serif;}
.perf-bg{flex:1;background:#f3f4f6;border-radius:99px;height:7px;overflow:hidden;}
.perf-fill{height:100%;border-radius:99px;}
.perf-val{font-size:11.5px;font-weight:900;min-width:36px;text-align:right;font-family:Arial,sans-serif;}
.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;}
@media(max-width:600px){.charts-grid{grid-template-columns:1fr;}}
.chart-box{background:#fafafa;border:1.5px solid #f0f0f0;border-radius:10px;padding:14px;}
.chart-title{
  font-size:8.5px;font-weight:900;text-transform:uppercase;
  letter-spacing:.1em!important;color:#9ca3af;margin-bottom:10px;
  font-family:Arial,sans-serif;
}

/* ═══════════════════════════════════════════════════════
   QUESTION CARDS — EXAM PAPER STYLE
   ═══════════════════════════════════════════════════════ */
.qcard{
  border:1.5px solid #e5e7eb;border-radius:10px;padding:16px 18px;
  margin-bottom:12px;page-break-inside:avoid;background:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.04);
}
.qcard:last-child{margin-bottom:0;}
.qcard.c{border-left:5px solid #10b981;}
.qcard.w{border-left:5px solid #ef4444;}
.qcard.s{border-left:5px solid #9ca3af;}
.qcard-hdr{
  display:flex;justify-content:space-between;align-items:center;
  margin-bottom:8px;flex-wrap:wrap;gap:4px;
}
.qnum{font-size:10px;font-weight:900;color:#6b7280;font-family:Arial,sans-serif;}
.badges{display:flex;gap:4px;flex-wrap:wrap;}
.b{font-size:9px;font-weight:800;padding:2px 8px;border-radius:99px;font-family:Arial,sans-serif;}
.b-c{background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;}
.b-w{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;}
.b-s{background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;}
.b-easy{background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;}
.b-medium{background:#fef3c7;color:#92400e;border:1px solid #fcd34d;}
.b-hard{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;}
.b-skip{background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;}

/* Question text — bold like exam paper */
.qtext{
  font-size:13.5px;font-weight:700;color:#111;line-height:1.7;
  margin-bottom:10px;font-family:'Segoe UI',Arial,sans-serif;
}

/* Options — 2-column grid (matches physical exam paper exactly) */
.opts-2col{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:5px 12px;
  margin:8px 0 6px 0;
}
@media(max-width:520px){
  .opts-2col{grid-template-columns:1fr;}
}
.opt{
  display:flex;align-items:flex-start;gap:8px;
  padding:7px 12px;border-radius:8px;font-size:13px;
  line-height:1.55;border:1.5px solid transparent;
  transition:background .1s;
}
.opt-key{
  font-size:10.5px;font-weight:800;min-width:22px;flex-shrink:0;
  margin-top:2px;font-family:'Courier New',monospace,Arial;color:#777;
}
.opt-txt{flex:1;}
.opt-tag{
  font-size:8.5px;font-weight:900;flex-shrink:0;
  padding:2px 6px;border-radius:99px;margin-left:3px;
  white-space:nowrap;align-self:center;font-family:Arial,sans-serif;
}
/* neutral */
.opt-n{background:transparent;border-color:transparent;}
/* correct answer */
.opt-correct{background:#ecfdf5;border-color:#6ee7b7;}
.opt-correct .opt-key{color:#059669;}
.opt-correct .opt-tag{background:#d1fae5;color:#065f46;}
/* user's wrong answer */
.opt-wrong{background:#fff1f2;border-color:#fca5a5;}
.opt-wrong .opt-key{color:#dc2626;}
.opt-wrong .opt-tag{background:#fee2e2;color:#991b1b;}
/* skipped — show answer without wrong highlight */
.opt-answer-only{background:#ecfdf5;border-color:#a7f3d0;}
.opt-answer-only .opt-key{color:#059669;}
.opt-answer-only .opt-tag{background:#d1fae5;color:#065f46;}

/* Skipped notice */
.skip-notice{
  display:inline-flex;align-items:center;gap:5px;
  margin-top:6px;font-size:11px;color:#9ca3af;font-style:italic;
  font-family:Arial,sans-serif;
}

/* Rationale */
.rat-section{margin-top:10px;display:flex;flex-direction:column;gap:5px;}
.rat-box{
  padding:10px 14px;border-radius:0 8px 8px 0;font-size:12.5px;
  line-height:1.75;border-left:4px solid;
}
.rat-lbl{
  font-size:8.5px;font-weight:900;text-transform:uppercase;
  letter-spacing:.1em!important;margin-bottom:4px;display:block;
  font-family:Arial,sans-serif;
}
.rat-book{background:#fffbeb;border-left-color:#f59e0b;color:#78350f;}
.rat-book .rat-lbl{color:#b45309;}
.rat-ai{background:#f5f3ff;border-left-color:#7c3aed;color:#4c1d95;}
.rat-ai .rat-lbl{color:#6d28d9;}

/* Insights */
.ins-row{
  display:flex;align-items:center;gap:10px;padding:8px 12px;
  border-radius:8px;border:1px solid #f0f0f0;background:#fafafa;margin-bottom:6px;
}
.ins-subject{font-size:12px;font-weight:700;color:#374151;flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-family:Arial,sans-serif;}
.ins-bar-track{flex:2;background:#e5e7eb;border-radius:99px;height:6px;overflow:hidden;}
.ins-bar-fill{height:100%;border-radius:99px;}
.ins-pct{font-size:12px;font-weight:900;min-width:36px;text-align:right;font-family:Arial,sans-serif;}
.ins-status{font-size:8.5px;font-weight:800;padding:2px 8px;border-radius:99px;white-space:nowrap;font-family:Arial,sans-serif;}

/* Appendix table */
.ak-table{width:100%;border-collapse:collapse;font-size:12px;}
.ak-table th{
  background:#1a1a1a;color:#fff;font-weight:800;font-size:8.5px;
  text-transform:uppercase;letter-spacing:.07em!important;
  padding:8px 10px;text-align:left;font-family:Arial,sans-serif;
}
.ak-table tr:nth-child(even) td{background:#fafafa;}
.ak-table td{padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#374151;}
.ak-table .td-c{background:#ecfdf5!important;color:#065f46;font-weight:800;}
.ak-table .td-w{background:#fff1f2!important;color:#991b1b;font-weight:800;}
.ak-table .td-s{color:#9ca3af;}

/* Quiz group header */
.quiz-group-hdr{
  background:#eff6ff;border:1.5px solid #bfdbfe;
  padding:10px 14px;border-radius:8px;margin:14px 0 10px;
}
.qgh-title{font-size:13px;font-weight:900;color:#1e40af;margin-bottom:2px;font-family:Arial,sans-serif;}
.qgh-meta{font-size:10.5px;color:#6b7280;font-family:Arial,sans-serif;}

/* Footer */
.rpt-footer{
  text-align:center;padding:14px;margin-top:20px;
  border-top:1.5px solid #e5e7eb;font-size:10px;color:#9ca3af;
  line-height:1.7;font-family:Arial,sans-serif;
}
`;

// ─── Section Builders ─────────────────────────────────────────────────────────

function buildCoverSection(meta: ReturnType<typeof computeReportMeta>): string {
  const verdictBg  = meta.isPassed ? '#d1fae5' : '#fee2e2';
  const verdictClr = meta.isPassed ? '#065f46' : '#991b1b';
  const verdictBrd = meta.isPassed ? '#a7f3d0' : '#fca5a5';
  const subjectBadge = meta.subject
    ? `<span class="badge">📚 ${esc(meta.subject)}</span>` : '';
  const quizCountBadge = meta.quizCount > 1
    ? `<span class="badge">${meta.quizCount} Quizzes</span>` : '';

  return `<div class="cover">
    <div class="brand-tag">🎓 R.J Quiz — Smart Performance Report</div>
    <div style="border-top:1px solid #ddd;margin:6px 0 14px;"></div>
    <div class="cover-inner">
      <div class="cover-text">
        <h1 class="quiz-title">${esc(meta.title)}</h1>
        <div class="cover-meta">
          ${subjectBadge}
          <span class="badge">📅 ${esc(meta.date)}</span>
          <span class="badge">${meta.totalQ} Questions</span>
          ${quizCountBadge}
        </div>
        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-val" style="color:${meta.gradeColor}">${esc(meta.grade)}</div>
            <div class="kpi-lbl">Grade</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val" style="color:#10b981">${meta.correct}/${meta.totalQ}</div>
            <div class="kpi-lbl">Correct</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val" style="color:#ef4444">${meta.wrong}</div>
            <div class="kpi-lbl">Wrong</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val" style="color:#f59e0b">${meta.skipped}</div>
            <div class="kpi-lbl">Skipped</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val" style="color:${meta.scoreColor}">${meta.accuracy}%</div>
            <div class="kpi-lbl">Accuracy</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val" style="color:#8b5cf6">${formatTimeSec(meta.timeTaken)}</div>
            <div class="kpi-lbl">Time</div>
          </div>
        </div>
        <span class="verdict" style="background:${verdictBg};color:${verdictClr};border-color:${verdictBrd};">
          ${meta.isPassed ? '✅ PASSED' : '❌ FAILED'} &nbsp;·&nbsp; ${meta.percentage}%
        </span>
        <div style="margin-top:10px;padding:8px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;font-size:11px;font-family:Arial,sans-serif;color:#6b7280;">
          <strong style="color:#374151;">Score Formula:</strong>&nbsp;
          <span style="color:#10b981;font-weight:800;">${meta.correct} × marks</span>
          <span style="color:#9ca3af;"> − </span>
          <span style="color:#ef4444;font-weight:800;">${meta.wrong} × penalty</span>
          <span style="color:#9ca3af;"> = </span>
          <span style="color:${meta.scoreColor};font-weight:900;">${meta.percentage}%</span>
        </div>
      </div>
      <div style="flex-shrink:0;">${buildGaugeSvg(meta.percentage, meta.scoreColor)}</div>
    </div>
  </div>`;
}

function buildDashboardSection(meta: ReturnType<typeof computeReportMeta>): string {
  const accColor = getScoreColor(meta.accuracy);
  const statsHtml = [
    { l: 'Total',    v: String(meta.totalQ),  c: '#3b82f6' },
    { l: 'Correct',  v: String(meta.correct),  c: '#10b981' },
    { l: 'Wrong',    v: String(meta.wrong),    c: '#ef4444' },
    { l: 'Skipped',  v: String(meta.skipped),  c: '#f59e0b' },
    { l: 'Score',    v: `${meta.percentage}%`, c: meta.scoreColor },
    { l: 'Accuracy', v: `${meta.accuracy}%`,   c: '#8b5cf6' },
  ].map(s => `<div class="stat-item"><div class="stat-val" style="color:${s.c}">${s.v}</div><div class="stat-lbl">${s.l}</div></div>`).join('');

  return `<div class="card">
    <div class="sec-hdr">
      <span class="sec-title">📊 Performance Dashboard</span>
    </div>
    <div class="stats-grid">${statsHtml}</div>
    <div class="perf-row">
      <div class="perf-label">Score</div>
      <div class="perf-bg"><div class="perf-fill" style="width:${meta.percentage}%;background:${meta.scoreColor}"></div></div>
      <div class="perf-val" style="color:${meta.scoreColor}">${meta.percentage}%</div>
    </div>
    <div class="perf-row">
      <div class="perf-label">Accuracy</div>
      <div class="perf-bg"><div class="perf-fill" style="width:${meta.accuracy}%;background:${accColor}"></div></div>
      <div class="perf-val" style="color:${accColor}">${meta.accuracy}%</div>
    </div>
    <div class="charts-grid">
      <div class="chart-box">
        <div class="chart-title">Answer Breakdown</div>
        ${buildDonutSvg(meta.correct, meta.wrong, meta.skipped)}
      </div>
      <div class="chart-box">
        <div class="chart-title">Subject Accuracy</div>
        ${buildSubjectBars(meta.subjectBreakdown)}
      </div>
    </div>
  </div>`;
}

// ─── Question Card (Exam Paper Style — 2-column options grid) ─────────────────
interface QuizItem {
  q: { question: string; options: string[]; correctAnswer: string; difficulty: string; rationale?: string; shuffledOpts?: string[]; questionType?: string; };
  idx: number;
  ua: string | null;
  status: 'correct' | 'wrong' | 'skipped';
  quizTitle?: string;
  quizDate?: string;
  quizPct?: number;
}

function buildQuestionCard(item: QuizItem, globalIdx: number, rationaleCache: Record<string, string>, rationalePrefs?: RationalePrefs, hideAnswers?: boolean): string {
  const { q, ua, status } = item;
  const opts = q.shuffledOpts || q.options;
  const prefs   = rationalePrefs ?? { showBook: true, showAi: true };
  const bookRat = prefs.showBook ? (q.rationale?.trim() || '') : '';
  const aiRat   = prefs.showAi  ? (rationaleCache[q.question]?.trim() || '') : '';

  // Card left-border class
  const cc = hideAnswers ? '' : { correct: 'c', wrong: 'w', skipped: 's' }[status];
  // Status badge class + label
  const sc = hideAnswers ? 'b-s' : { correct: 'b-c', wrong: 'b-w', skipped: 'b-s' }[status];
  const sl = hideAnswers ? `Q.${globalIdx + 1}` : { correct: '✅ Correct', wrong: '❌ Wrong', skipped: '⏭ Skipped' }[status];
  // Build each option in the 2-column grid
  const optsHtml = opts.map((opt, oi) => {
    const isCor = opt === q.correctAnswer;
    const isUsr = opt === ua;
    const isWrongUser = isUsr && !isCor;

    let cls = 'opt opt-n';
    let tag = '';

    if (!hideAnswers) {
      if (status === 'skipped') {
        if (isCor) { cls = 'opt opt-answer-only'; tag = '<span class="opt-tag">← Answer</span>'; }
      } else if (isCor && isUsr) {
        cls = 'opt opt-correct';
        tag = '<span class="opt-tag">← ✓ Correct</span>';
      } else if (isCor) {
        cls = 'opt opt-correct';
        tag = '<span class="opt-tag">← Answer</span>';
      } else if (isWrongUser) {
        cls = 'opt opt-wrong';
        tag = '<span class="opt-tag">← Yours</span>';
      }
    }

    return `<div class="${cls}">
      <span class="opt-key">(${String.fromCharCode(65 + oi)})</span>
      <span class="opt-txt">${esc(opt)}</span>${tag}
    </div>`;
  }).join('');

  const skipNotice = status === 'skipped' && !ua
    ? `<div class="skip-notice">⏭ This question was not attempted</div>` : '';

  const ratHtml = (bookRat || aiRat) ? `<div class="rat-section">
    ${bookRat ? `<div class="rat-box rat-book"><span class="rat-lbl">📖 From Source / Rationale</span>${ratPoints(bookRat)}</div>` : ''}
    ${aiRat   ? `<div class="rat-box rat-ai"><span class="rat-lbl">💡 AI Explanation</span>${formatAiBullets(aiRat)}</div>` : ''}
  </div>` : '';

  const imgHtml = (q as any).imageUrl
    ? `<div style="text-align:center;margin-bottom:10px;"><img src="${esc((q as any).imageUrl)}" alt="Question image" style="max-width:100%;max-height:150px;border-radius:8px;border:1px solid #e5e7eb;" onerror="this.style.display='none'"/></div>`
    : '';

  return `<div class="qcard ${cc}">
    <div class="qcard-hdr">
      <span class="qnum">Q.${globalIdx + 1}</span>
      <div class="badges">
        <span class="b ${sc}">${sl}</span>
        ${mergedBadgeHtml(q.difficulty || 'medium', q.questionType)}
      </div>
    </div>
    ${imgHtml}
    <p class="qtext">${htmlLine(q.question)}</p>
    <div class="opts-2col">${optsHtml}</div>
    ${skipNotice}
    ${ratHtml}
  </div>`;
}

function buildDifficultyGroupHeader(difficulty: string, count: number, format: 'html' | 'text' = 'html'): string {
  const emoji = difficulty === 'easy' ? '🟢' : difficulty === 'medium' ? '🟡' : '🔴';
  const label = difficulty.toUpperCase();
  if (format === 'text') {
    return `\n${'═'.repeat(20)} ${emoji} ${label} QUESTIONS (${count}) ${'═'.repeat(20)}\n`;
  }
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    easy:   { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
    medium: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
    hard:   { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  };
  const c = colors[difficulty] || colors.medium;
  return `<div style="display:flex;align-items:center;gap:10px;margin:18px 0 10px;padding:10px 16px;background:${c.bg};border:1.5px solid ${c.border};border-radius:8px;">
    <span style="font-size:14px;">${emoji}</span>
    <span style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:${c.text};font-family:Arial,sans-serif;">${label} QUESTIONS (${count})</span>
    <span style="flex:1;border-top:1.5px dashed ${c.border};"></span>
  </div>`;
}

function buildReviewSection(
  results: QuizResult[],
  filter: QuestionFilter,
  rationaleCache: Record<string, string>,
  reportOrder: ReportOrder = 'attempt',
  rationalePrefs?: RationalePrefs,
  hideAnswers?: boolean,
  difficultySort?: 'all' | 'easy' | 'medium' | 'hard'
): string {
  const items: (QuizItem & { quizIndex: number })[] = [];

  results.forEach((r, ri) => {
    const ordered = orderQuizDataForReport(r, reportOrder);
    ordered.forEach(({ q, ua }) => {
      const status: 'correct' | 'wrong' | 'skipped' =
        ua === null ? 'skipped' : ua === q.correctAnswer ? 'correct' : 'wrong';
      if (filter !== 'all' && status !== filter) return;
      items.push({
        q, idx: 0, ua, status,
        quizTitle: r.quizTitle,
        quizDate: new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        quizPct: r.percentage,
        quizIndex: ri,
      });
    });
  });

  const filterLabels: Record<QuestionFilter, string> = {
    all: 'All Questions', correct: 'Correct Answers', wrong: 'Mistakes', skipped: 'Skipped',
  };

  if (!items.length) {
    return `<div class="card">
      <div class="sec-hdr"><span class="sec-title">📝 Question Review</span></div>
      <div style="text-align:center;padding:36px 20px;color:#9ca3af;border:2px dashed #e5e7eb;border-radius:10px;font-family:Arial,sans-serif;">
        No questions match the selected filter.
      </div>
    </div>`;
  }

  if (results.length > 1) {
    let html = `<div class="card"><div class="sec-hdr">
      <span class="sec-title">📝 Question-by-Question Review</span>
      <span class="sec-count">${items.length} Questions — ${esc(filterLabels[filter])}</span>
    </div>`;
    results.forEach((r, ri) => {
      let rItems = items.filter(i => i.quizIndex === ri);
      if (!rItems.length) return;
      // Sort by selected difficulty priority
      rItems = sortItemsByDifficulty(rItems, difficultySort);
      const pctColor = getScoreColor(r.percentage);
      html += `<div class="quiz-group-hdr">
        <div class="qgh-title">📝 ${esc(r.quizTitle || `Quiz ${ri + 1}`)}
          ${r.subject ? `<span style="font-size:9px;background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:99px;font-weight:700;border:1px solid #93c5fd;margin-left:6px;">${esc(r.subject)}</span>` : ''}
        </div>
        <div class="qgh-meta">📅 ${new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} &nbsp;·&nbsp; <span style="color:${pctColor};font-weight:800;">${r.percentage}%</span> &nbsp;·&nbsp; ✅${r.correct} ❌${r.wrong} ⏭${r.skipped}</div>
      </div>`;
      if (difficultySort && difficultySort !== 'all') {
        let lastD = '';
        rItems.forEach((item, gi) => {
          const d = item.q.difficulty || 'medium';
          if (d !== lastD) {
            const gc = rItems.filter(it => (it.q.difficulty || 'medium') === d).length;
            html += buildDifficultyGroupHeader(d, gc);
            lastD = d;
          }
          html += buildQuestionCard(item, gi, rationaleCache, rationalePrefs, hideAnswers);
        });
      } else {
        rItems.forEach((item, gi) => { html += buildQuestionCard(item, gi, rationaleCache, rationalePrefs, hideAnswers); });
      }
    });
    return html + '</div>';
  }

  // Sort items by selected difficulty priority
  const sortedItems = sortItemsByDifficulty(items, difficultySort);

  let html = `<div class="card"><div class="sec-hdr">
    <span class="sec-title">📝 Question-by-Question Review</span>
    <span class="sec-count">${sortedItems.length} Questions — ${esc(filterLabels[filter])}</span>
  </div>`;
  if (difficultySort && difficultySort !== 'all') {
    // Group items by difficulty and inject headers
    let lastDiff = '';
    sortedItems.forEach((item, i) => {
      const d = item.q.difficulty || 'medium';
      if (d !== lastDiff) {
        const groupCount = items.filter(it => (it.q.difficulty || 'medium') === d).length;
        html += buildDifficultyGroupHeader(d, groupCount);
        lastDiff = d;
      }
      html += buildQuestionCard(item, i, rationaleCache, rationalePrefs, hideAnswers);
    });
  } else {
    sortedItems.forEach((item, i) => { html += buildQuestionCard(item, i, rationaleCache, rationalePrefs, hideAnswers); });
  }
  return html + '</div>';
}

function buildInsightsSection(meta: ReturnType<typeof computeReportMeta>): string {
  const rowsHtml = meta.subjectBreakdown.map(b => {
    const color   = b.accuracy >= 75 ? '#10b981' : b.accuracy >= 50 ? '#f59e0b' : '#ef4444';
    const status  = b.accuracy >= 75 ? '✅ Mastered' : b.accuracy >= 50 ? '📖 Practice' : '⚠️ Needs Work';
    const bgColor = b.accuracy >= 75 ? '#d1fae5' : b.accuracy >= 50 ? '#fef3c7' : '#fee2e2';
    const txColor = b.accuracy >= 75 ? '#065f46' : b.accuracy >= 50 ? '#92400e' : '#991b1b';
    return `<div class="ins-row">
      <span class="ins-subject">${esc(b.subject)}</span>
      <div class="ins-bar-track"><div class="ins-bar-fill" style="width:${b.accuracy}%;background:${color};"></div></div>
      <span class="ins-pct" style="color:${color};">${b.accuracy}%</span>
      <span class="ins-status" style="background:${bgColor};color:${txColor};border:1px solid ${color}40;">${status}</span>
    </div>`;
  }).join('');

  const avgTimeSec = meta.timeTaken > 0 && meta.totalQ > 0 ? Math.round(meta.timeTaken / meta.totalQ) : 0;
  const timeNote   = avgTimeSec > 0 ? `Avg. ${formatTimeSec(avgTimeSec)} per question` : 'Timing data not available.';
  const weakAreas  = meta.subjectBreakdown.filter(b => b.accuracy < 50);
  const strongArea = meta.subjectBreakdown.find(b => b.accuracy >= 75);

  let summaryHtml = '';
  if (weakAreas.length) {
    summaryHtml += `<div style="margin-top:10px;padding:10px 14px;background:#fff7ed;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;">
      <div style="font-size:8.5px;font-weight:900;color:#b45309;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;font-family:Arial,sans-serif;">⚠️ Priority Review Areas</div>
      <p style="font-size:12.5px;color:#78350f;font-family:Arial,sans-serif;">Focus on: ${weakAreas.map(w => `<strong>${esc(w.subject)}</strong> (${w.accuracy}%)`).join(', ')}</p>
    </div>`;
  }
  if (strongArea) {
    summaryHtml += `<div style="margin-top:7px;padding:10px 14px;background:#ecfdf5;border-left:4px solid #10b981;border-radius:0 8px 8px 0;">
      <div style="font-size:8.5px;font-weight:900;color:#065f46;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;font-family:Arial,sans-serif;">✅ Strongest Area</div>
      <p style="font-size:12.5px;color:#064e3b;font-family:Arial,sans-serif;"><strong>${esc(strongArea.subject)}</strong> — Keep it up!</p>
    </div>`;
  }

  return `<div class="card">
    <div class="sec-hdr"><span class="sec-title">🎯 Insights &amp; Weak Areas</span></div>
    ${rowsHtml || '<p style="color:#9ca3af;font-size:13px;font-family:Arial,sans-serif;">Complete more quizzes to see subject insights.</p>'}
    ${summaryHtml}
    <div style="margin-top:8px;padding:10px 14px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;">
      <div style="font-size:8.5px;font-weight:900;color:#1d4ed8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;font-family:Arial,sans-serif;">⏰ Time Management</div>
      <p style="font-size:12.5px;color:#1e40af;font-family:Arial,sans-serif;">${timeNote}</p>
    </div>
  </div>`;
}

function buildAppendixSection(results: QuizResult[], filter: QuestionFilter, reportOrder: ReportOrder = 'attempt', difficultySort?: 'all' | 'easy' | 'medium' | 'hard'): string {
  // Collect items
  type AppendixItem = { q: QuizResult['quizData'][0]; ua: string | null; status: 'correct' | 'wrong' | 'skipped' };
  const items: AppendixItem[] = [];
  results.forEach(r => {
    orderQuizDataForReport(r, reportOrder).forEach(({ q, ua }) => {
      const status: 'correct' | 'wrong' | 'skipped' = ua === null ? 'skipped' : ua === q.correctAnswer ? 'correct' : 'wrong';
      if (filter !== 'all' && status !== filter) return;
      items.push({ q, ua, status });
    });
  });

  // Sort by difficulty if selected
  const sorted = sortItemsByDifficulty(items, difficultySort);

  const rows: string[] = [];
  let lastDiff = '';
  sorted.forEach((item, i) => {
    const { q, ua, status } = item;
    const gi = i + 1;
    // Difficulty group header row
    if (difficultySort && difficultySort !== 'all') {
      const d = q.difficulty || 'medium';
      if (d !== lastDiff) {
        const gc = sorted.filter(it => (it.q.difficulty || 'medium') === d).length;
        const emoji = d === 'easy' ? '🟢' : d === 'medium' ? '🟡' : '🔴';
        rows.push(`<tr><td colspan="5" style="background:#f8fafc;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;padding:10px 12px;color:#555;font-family:Arial,sans-serif;border-bottom:2px solid #e5e7eb;">${emoji} ${d.toUpperCase()} (${gc})</td></tr>`);
        lastDiff = d;
      }
    }
    const tdCls = { correct: 'td-c', wrong: 'td-w', skipped: 'td-s' }[status];
    const opts  = q.shuffledOpts || q.options;
    const corrIdx = opts.indexOf(q.correctAnswer);
    const userIdx = ua ? opts.indexOf(ua) : -1;
    rows.push(`<tr>
      <td style="text-align:center;font-weight:700;">${gi}</td>
      <td style="max-width:290px;">${esc(q.question.slice(0, 75))}${q.question.length > 75 ? '…' : ''}</td>
      <td>${corrIdx >= 0 ? `(${String.fromCharCode(65 + corrIdx)}) ${esc(q.correctAnswer.slice(0, 38))}` : esc(q.correctAnswer.slice(0, 38))}</td>
      <td class="${tdCls}">${ua ? (userIdx >= 0 ? `(${String.fromCharCode(65 + userIdx)}) ${esc(ua.slice(0, 38))}` : esc(ua.slice(0, 38))) : '—'}</td>
      <td class="${tdCls}" style="text-align:center;">${{ correct: '✅', wrong: '❌', skipped: '⏭' }[status]}</td>
    </tr>`);
  });

  return `<div class="card new-page">
    <div class="sec-hdr">
      <span class="sec-title">📑 Answer Key / Appendix</span>
      <span class="sec-count">${sorted.length} Questions</span>
    </div>
    <table class="ak-table">
      <thead><tr>
        <th style="text-align:center;width:36px;">#</th>
        <th>Question</th>
        <th>Correct Answer</th>
        <th>Your Answer</th>
        <th style="text-align:center;">Result</th>
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  </div>`;
}

// ─── Main Builder ─────────────────────────────────────────────────────────────
export function buildSmartReportHtml(
  results: QuizResult[],
  sections: ReportSections,
  filter: QuestionFilter,
  rationaleCache: Record<string, string>,
  forPrint: boolean,
  reportOrder: ReportOrder = 'attempt',
  rationalePrefs?: RationalePrefs,
  hideAnswers?: boolean,
  difficultySort?: 'all' | 'easy' | 'medium' | 'hard'
): string {
  const meta  = computeReportMeta(results);
  const parts: string[] = [];

  if (sections.cover)     parts.push(buildCoverSection(meta));
  if (sections.dashboard) parts.push(buildDashboardSection(meta));
  if (sections.review)    parts.push(buildReviewSection(results, filter, rationaleCache, reportOrder, rationalePrefs, hideAnswers, difficultySort));
  if (sections.insights)  parts.push(buildInsightsSection(meta));
  if (sections.appendix)  parts.push(buildAppendixSection(results, filter, reportOrder, difficultySort));

  const printScript = forPrint
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},500);});</script>` : '';
  const printBar = forPrint
    ? `<div class="print-bar no-print">
        <div><strong>📄 Save as PDF:</strong> Print dialog opens → choose <strong>"Save as PDF"</strong></div>
        <button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
      </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(meta.title)} — R.J Quiz</title>
<style>${REPORT_CSS}</style>
${printScript}
</head>
<body>
<div class="page-wrap">
  ${printBar}
  ${parts.join('\n')}
  <div class="rpt-footer">
    Generated by <strong>R.J Quiz</strong> &nbsp;·&nbsp; ${esc(meta.date)} &nbsp;·&nbsp; ${esc(meta.title)}
  </div>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAIN TEXT REPORT — Professional Exam Paper Format
// ═══════════════════════════════════════════════════════════════════════════════
export function buildTextReport(
  results: QuizResult[],
  filter: QuestionFilter,
  rationaleCache: Record<string, string>,
  reportOrder: ReportOrder = 'attempt',
  rationalePrefs?: RationalePrefs,
  difficultySort?: 'all' | 'easy' | 'medium' | 'hard'
): string {
  const DBL   = '═'.repeat(66);
  const LINE  = '─'.repeat(66);
  const DOTLN = '·'.repeat(66);

  let totalQ = 0, correct = 0, wrong = 0, skipped = 0, timeTaken = 0;
  results.forEach(r => {
    totalQ    += r.totalQuestions;
    correct   += r.correct;
    wrong     += r.wrong;
    skipped   += r.skipped;
    timeTaken += r.timeTaken;
  });

  const pct      = totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0;
  const accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
  const title    = results.length === 1 ? (results[0].quizTitle || 'Quiz Report') : 'Profile Performance Report';
  const subject  = results[0]?.subject || '';
  const date     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const mins     = Math.floor(timeTaken / 60);
  const secs     = timeTaken % 60;
  const timeStr  = timeTaken > 0 ? `${mins}m ${String(secs).padStart(2,'0')}s` : '—';
  const isPassed = pct >= (results[0]?.passMark ?? 50);

  // Grade
  const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';

  const filterLabels: Record<QuestionFilter, string> = {
    all: 'All Questions', correct: 'Correct Answers', wrong: 'Mistakes Only', skipped: 'Skipped Only',
  };

  const lines: string[] = [
    DBL,
    `   🎓  R.J QUIZ — PERFORMANCE REPORT`,
    `   ${title}`,
    subject ? `   Subject: ${subject}` : '',
    `   Date: ${date}`,
    DBL,
    `   Score: ${pct}%   Grade: ${grade}   Correct: ${correct}/${totalQ}   ${isPassed ? 'PASSED ✓' : 'FAILED ✗'}`,
    LINE,
    '',
    'PERFORMANCE SUMMARY',
    LINE,
    `  Total Questions  :  ${String(totalQ).padStart(3)}      Correct   :  ${String(correct).padStart(3)}`,
    `  Wrong Answers    :  ${String(wrong).padStart(3)}      Skipped   :  ${String(skipped).padStart(3)}`,
    `  Score            :  ${String(pct).padStart(3)}%     Accuracy  :  ${String(accuracy).padStart(3)}%`,
    `  Time Taken       :  ${timeStr}`,
    LINE,
    '',
  ].filter(l => l !== null) as string[];

  // Subject breakdown
  if (results.some(r => r.subject)) {
    const subjMap = new Map<string, { correct: number; total: number }>();
    results.forEach(r => {
      const key = r.subject?.trim() || 'General';
      const e = subjMap.get(key) || { correct: 0, total: 0 };
      e.correct += r.correct; e.total += r.totalQuestions;
      subjMap.set(key, e);
    });
    if (subjMap.size > 0) {
      lines.push('SUBJECT PERFORMANCE');
      lines.push(LINE);
      subjMap.forEach(({ correct: c, total: t }, subj) => {
        const acc  = t > 0 ? Math.round((c / t) * 100) : 0;
        const lbl  = acc >= 75 ? '[STRONG ✓]' : acc >= 50 ? '[PRACTICE]' : '[REVIEW!]';
        const bar  = '█'.repeat(Math.round(acc / 5)) + '░'.repeat(20 - Math.round(acc / 5));
        lines.push(`  ${subj.padEnd(22)}${bar} ${String(acc).padStart(3)}%  ${c}/${t}  ${lbl}`);
      });
      lines.push(LINE);
      lines.push('');
    }
  }

  // Question Review header
  lines.push(`QUESTION REVIEW — ${filterLabels[filter].toUpperCase()}`);
  lines.push(DBL);
  lines.push('');

  let qi = 0;
  let lastTextDiff = '';

  results.forEach((r, ri) => {
    if (results.length > 1) {
      const pctR = r.percentage;
      const gradR = pctR >= 90 ? 'A+' : pctR >= 80 ? 'A' : pctR >= 70 ? 'B' : pctR >= 60 ? 'C' : 'F';
      lines.push(LINE);
      lines.push(`  📝 QUIZ ${ri + 1}: ${r.quizTitle || 'Untitled'}${r.subject ? ` (${r.subject})` : ''}`);
      lines.push(`     Score: ${pctR}%  Grade: ${gradR}  Correct: ${r.correct}/${r.totalQuestions}`);
      lines.push(LINE);
      lines.push('');
      lastTextDiff = '';
    }

    const ordered = orderQuizDataForReport(r, reportOrder);
    // Filter first, then sort by difficulty priority
    const filteredOrdered = ordered.filter(({ q: qq, ua: uua }) => {
      const st = uua === null ? 'skipped' : uua === qq.correctAnswer ? 'correct' : 'wrong';
      return filter === 'all' || st === filter;
    });
    const sortedOrdered = sortItemsByDifficulty(filteredOrdered, difficultySort as any);
    // Pre-count difficulties for group headers
    const diffCounts: Record<string, number> = {};
    sortedOrdered.forEach(({ q: qq }) => {
      const d = qq.difficulty || 'medium';
      diffCounts[d] = (diffCounts[d] || 0) + 1;
    });

    sortedOrdered.forEach(({ q, ua }) => {
      const status: 'correct' | 'wrong' | 'skipped' =
        ua === null ? 'skipped' : ua === q.correctAnswer ? 'correct' : 'wrong';
      qi++;

      // Text difficulty group header
      if (difficultySort && difficultySort !== 'all') {
        const curD = q.difficulty || 'medium';
        if (curD !== lastTextDiff) {
          lines.push(buildDifficultyGroupHeader(curD, diffCounts[curD] || 0, 'text'));
          lastTextDiff = curD;
        }
      }

      const statusIcon = status === 'correct'
        ? '[ ✓ CORRECT ]'
        : status === 'wrong'
        ? '[ ✗  WRONG  ]'
        : '[  ⏭ SKIPPED ]';

      const diff = `[${(q.difficulty?.toUpperCase() || 'MED').padEnd(6)}]`;

      // Q number + status on same line
      lines.push(`Q.${String(qi).padEnd(3)} ${statusIcon}  ${diff}`);

      // Question text — word-wrap at 60 chars
      const words = q.question.split(' ');
      let cur = '     ';
      words.forEach(w => {
        if (cur.length + w.length + 1 > 65) {
          lines.push(cur);
          cur = '     ' + w;
        } else {
          cur += (cur === '     ' ? '' : ' ') + w;
        }
      });
      if (cur.trim()) lines.push(cur);

      // Image URL (text reports)
      if ((q as any).imageUrl) {
        lines.push(`     Image: ${(q as any).imageUrl}`);
      }
      lines.push('');

      const opts = q.shuffledOpts || q.options;

      // Options — each on its own line with clear markers
      opts.forEach((opt, oi) => {
        const letter   = String.fromCharCode(65 + oi);
        const isCor    = opt === q.correctAnswer;
        const isUsr    = opt === ua;
        const isWrong  = isUsr && !isCor;
        const prefix   = isCor ? ' ✓ ' : isWrong ? ' ✗ ' : '   ';
        const suffix   = isCor && isUsr ? '  ← Your Answer (Correct ✓)' :
                         isCor          ? '  ← Correct Answer' :
                         isWrong        ? '  ← Your Answer (Wrong ✗)' : '';
        lines.push(`  ${prefix}(${letter})  ${opt}${suffix}`);
      });

      if (status === 'skipped') {
        lines.push('');
        lines.push('       [ This question was not attempted ]');
      }

      const rPrefs  = rationalePrefs ?? { showBook: true, showAi: true };
      const bookRat = rPrefs.showBook ? (q.rationale?.trim() || '') : '';
      const aiRat   = rPrefs.showAi  ? (rationaleCache[q.question]?.trim() || '') : '';
      if (bookRat || aiRat) {
        lines.push('');
        if (bookRat) {
          lines.push('  Rationale:');
          rationalePoints(bookRat).forEach(pt => {
            let rc = '   • ';
            pt.split(' ').forEach(w => {
              if (rc.length + w.length + 1 > 65) { lines.push(rc); rc = '     ' + w; }
              else { rc += (rc.endsWith(' ') ? '' : ' ') + w; }
            });
            if (rc.trim()) lines.push(rc);
          });
        }
        if (aiRat) {
          lines.push('  AI Explanation:');
          rationalePoints(aiRat).forEach(pt => {
            let ac = '   • ';
            pt.split(' ').forEach(w => {
              if (ac.length + w.length + 1 > 65) { lines.push(ac); ac = '     ' + w; }
              else { ac += (ac.endsWith(' ') ? '' : ' ') + w; }
            });
            if (ac.trim()) lines.push(ac);
          });
        }
      }

      lines.push('');
      lines.push(DOTLN);
      lines.push('');
    });
  });

  if (qi === 0) {
    lines.push('  (No questions match the selected filter)');
    lines.push('');
  }

  lines.push(DBL);
  lines.push(`  Generated by R.J Quiz  ·  ${date}  ·  Total: ${qi} questions`);
  lines.push(DBL);

  return lines.join('\n');
}

// ─── Word-compatible DOC builder ──────────────────────────────────────────────
export function buildDocReport(
  results: QuizResult[],
  sections: ReportSections,
  filter: QuestionFilter,
  rationaleCache: Record<string, string>,
  reportOrder: ReportOrder = 'attempt',
  rationalePrefs?: RationalePrefs,
  hideAnswers?: boolean,
  difficultySort?: 'all' | 'easy' | 'medium' | 'hard'
): string {
  const inner = buildSmartReportHtml(results, sections, filter, rationaleCache, false, reportOrder, rationalePrefs, hideAnswers, difficultySort);
  const bodyMatch  = inner.match(/<body>([\s\S]*)<\/body>/i);
  const styleMatch = inner.match(/<style>([\s\S]*?)<\/style>/i);
  const bodyContent = bodyMatch  ? bodyMatch[1]  : inner;
  const cssContent  = styleMatch ? styleMatch[1] : '';
  return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>R.J Quiz Report</title>
<!--[if gte mso 9]>
<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml>
<![endif]-->
<style>
${cssContent}
body { margin: 0.75in; }
@page { margin: 0.75in; size: A4; }
p, div { mso-line-height-rule: exactly; }
</style>
</head>
<body>${bodyContent}</body>
</html>`;
}

// ─── Download / Export ────────────────────────────────────────────────────────
function getDateStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${d.getFullYear()}`;
}

export function getReportFilename(results: QuizResult[], format: ExportFormat): string {
  const title   = (results[0]?.quizTitle || 'SmartReport').replace(/[<>:"/\\|?*]/g, '').trim();
  const subject = results[0]?.subject ? `_${results[0].subject.replace(/[<>:"/\\|?*]/g,'').trim()}` : '';
  const extMap: Record<ExportFormat, string> = { pdf: 'pdf', html: 'html', text: 'txt', doc: 'doc' };
  return `R.J_Quiz_${title}${subject}_${getDateStr()}.${extMap[format]}`;
}

function fileTitle(filename: string): string { return filename.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim() || 'Report'; }

/**
 * Saves a report built as HTML. Works offline in the app and browser: PDF is generated on the device (no print
 * window, no server), DOC / HTML are saved to Downloads, and a notification confirms it.
 */
export function exportSmartReport(html: string, format: ExportFormat, filename: string): void {
  void import('./exportReport').then(m => m.exportLegacyHtml(html, format, filename, fileTitle(filename)));
}

export function exportTextReport(text: string, filename: string): void {
  void import('./exportReport').then(m => m.exportLegacyHtml(text, 'text', filename, fileTitle(filename)));
}

export function wrapHtmlForWord(html: string, docTitle: string): string {
  const bodyMatch  = html.match(/<body>([\s\S]*)<\/body>/i);
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  const bodyContent = bodyMatch  ? bodyMatch[1]  : html;
  const cssContent  = styleMatch ? styleMatch[1] : '';
  return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${esc(docTitle)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${cssContent}body{margin:.75in;}@page{margin:.75in;size:A4;}</style>
</head>
<body>${bodyContent}</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDY NOTES — Professional Format
// ═══════════════════════════════════════════════════════════════════════════════
const NOTES_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{
  font-family:'Times New Roman',Times,Georgia,serif;
  background:#fff;color:#111;
  padding:36px 52px;font-size:12.5pt;line-height:1.75;
  max-width:820px;margin:0 auto;
}
@media print{
  body{padding:0;max-width:100%;font-size:11pt;}
  @page{size:A4;margin:16mm 14mm;}
  .no-print{display:none!important;}
  .note-entry{page-break-inside:avoid;}
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.no-print{
  background:#1e3a8a;color:#fff;padding:10px 16px;border-radius:8px;
  margin-bottom:24px;font-size:12px;
  display:flex;justify-content:space-between;align-items:center;
  font-family:Arial,sans-serif;
}
.no-print button{
  background:#3b82f6;color:#fff;border:none;padding:7px 14px;
  border-radius:6px;cursor:pointer;font-weight:700;font-size:12px;
}
/* Header — box style */
.notes-header{
  border:2.5px solid #1a1a1a;padding:16px 22px;margin-bottom:28px;
}
.notes-brand{
  font-size:7.5pt;font-weight:700;letter-spacing:.22em;
  text-transform:uppercase;color:#888;font-family:Arial,sans-serif;
  text-align:center;margin-bottom:8px;
}
.notes-title{
  font-size:16pt;font-weight:900;text-align:center;
  font-family:Arial,sans-serif;line-height:1.3;margin-bottom:6px;
}
.notes-divider{border-top:1.5px solid #ccc;margin:8px 0;}
.notes-meta{
  font-size:10pt;color:#555;text-align:center;
  font-family:Arial,sans-serif;
}
/* Note entries */
.note-entry{margin-bottom:0;}
.note-num{
  font-size:10pt;font-weight:900;color:#555;
  font-family:Arial,sans-serif;margin-bottom:4px;display:block;
}
.note-q{
  font-size:13pt;font-weight:700;color:#1a1a1a;
  line-height:1.65;margin-bottom:7px;
}
.note-answer{
  font-size:13pt;margin:5px 0 5px 20px;
  display:flex;align-items:flex-start;gap:10px;
}
.note-answer-label{
  font-size:10pt;font-weight:800;color:#555;
  font-family:Arial,sans-serif;min-width:72px;flex-shrink:0;margin-top:2px;
}
.note-answer-val{
  font-weight:900;color:#dc2626;font-size:14pt;
  font-family:Arial,sans-serif;line-height:1.4;
}
.note-rationale{
  font-size:11.5pt;color:#1f2937;line-height:1.8;
  padding:8px 13px 8px 14px;border-left:4px solid #d97706;
  background:#fffbeb;border-radius:0 7px 7px 0;margin:6px 0 0 20px;
}
.note-divider{border:none;border-top:1px dashed #bbb;margin:14px 0;}
.notes-footer{
  border-top:1.5px solid #ccc;margin-top:28px;padding-top:10px;
  text-align:center;font-size:9pt;color:#888;font-family:Arial,sans-serif;
}
`;

export function buildStudyNotesHtml(
  results: QuizResult[],
  rationaleCache: Record<string, string>,
  forPrint = false,
  reportOrder: ReportOrder = 'attempt',
  rationalePrefs?: RationalePrefs,
  hideAnswers?: boolean,
  difficultySort?: 'all' | 'easy' | 'medium' | 'hard'
): string {
  const items: { q: QuizResult['quizData'][0]; num: number }[] = [];
  const seen = new Set<string>();
  results.forEach(r => {
    orderQuizDataForReport(r, reportOrder).forEach(({ q }) => {
      if (!seen.has(q.question)) { seen.add(q.question); items.push({ q, num: items.length + 1 }); }
    });
  });

  const title   = results.length === 1 ? (results[0].quizTitle || 'Study Notes') : 'Study Notes';
  const subject = results[0]?.subject || '';
  const date    = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Sort by selected difficulty priority
  const sortedNoteItems = sortItemsByDifficulty(items, difficultySort);

  const notesHtml = sortedNoteItems.map(({ q, num }, idx) => {
    // Inject difficulty group header when sorting is active
    let groupHdr = '';
    if (difficultySort && difficultySort !== 'all') {
      const prevDiff = idx > 0 ? (sortedNoteItems[idx - 1].q.difficulty || 'medium') : '';
      const curDiff = q.difficulty || 'medium';
      if (curDiff !== prevDiff) {
        const groupCount = sortedNoteItems.filter(it => (it.q.difficulty || 'medium') === curDiff).length;
        groupHdr = buildDifficultyGroupHeader(curDiff, groupCount);
      }
    }
    const rPrefs  = rationalePrefs ?? { showBook: true, showAi: true };
    const aiRat   = rPrefs.showAi   ? (rationaleCache[q.question] || '').trim() : '';
    const bookRat = rPrefs.showBook ? (q.rationale || '').trim() : '';
    const rationale = aiRat || bookRat;
    const noteImgHtml = (q as any).imageUrl
      ? `<div style="text-align:center;margin:4px 0 8px;"><img src="${esc((q as any).imageUrl)}" alt="" style="max-width:100%;max-height:140px;border-radius:5px;border:1px solid #e0e0e0;" onerror="this.style.display='none'"/></div>`
      : '';
    const answerBlock = hideAnswers ? '' : `<div class="note-answer">
        <span class="note-answer-label">&#10003; Answer:</span>
        <span class="note-answer-val">${esc(q.correctAnswer)}</span>
      </div>`;
    return `${groupHdr}<div class="note-entry">
      <span class="note-num">Q.${num}</span>
      <p class="note-q">${htmlLine(q.question)}</p>
      ${noteImgHtml}
      ${answerBlock}
      ${rationale
        ? `<div class="note-rationale">${ratPoints(aiRat || bookRat)}</div>`
        : ''
      }
      <hr class="note-divider"/>
    </div>`;
  }).join('');

  const printBar = `<div class="no-print">
    <div>&#128196; <strong>Save as PDF:</strong> Print dialog opening &#8212; choose <strong>"Save as PDF"</strong></div>
    <button onclick="window.print()">&#128424; Print / Save PDF</button>
  </div>`;
  const printScript = forPrint
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},600);});<\/script>` : '';
  const subjectMeta = subject ? `Subject: ${esc(subject)}&nbsp;&nbsp;&middot;&nbsp;&nbsp;` : '';

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} &mdash; Study Notes</title>
<style>${NOTES_CSS}</style>${printScript}
</head><body>
${printBar}
<div class="notes-header">
  <div class="notes-brand">&#127891; R.J Quiz &mdash; Study Notes</div>
  <div class="notes-title">${esc(title)}</div>
  <div class="notes-divider"></div>
  <div class="notes-meta">${subjectMeta}Date: ${esc(date)}&nbsp;&nbsp;&middot;&nbsp;&nbsp;${items.length} Questions</div>
</div>
${notesHtml}
<div class="notes-footer">Generated by R.J Quiz &nbsp;&middot;&nbsp; ${esc(date)} &nbsp;&middot;&nbsp; ${items.length} Questions</div>
</body></html>`;
}

export function buildStudyNotesText(
  results: QuizResult[],
  rationaleCache: Record<string, string>,
  reportOrder: ReportOrder = 'attempt',
  rationalePrefs?: RationalePrefs,
  difficultySort?: 'all' | 'easy' | 'medium' | 'hard'
): string {
  const DBL  = '═'.repeat(66);
  const LINE = '─'.repeat(66);
  const DOT  = '·'.repeat(66);
  const items: { q: QuizResult['quizData'][0]; num: number }[] = [];
  const seen = new Set<string>();
  results.forEach(r => {
    orderQuizDataForReport(r, reportOrder).forEach(({ q }) => {
      if (!seen.has(q.question)) { seen.add(q.question); items.push({ q, num: items.length + 1 }); }
    });
  });

  const title   = results.length === 1 ? (results[0].quizTitle || 'Study Notes') : 'Study Notes';
  const subject = results[0]?.subject || '';
  const date    = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const lines: string[] = [
    DBL,
    `   📚 STUDY NOTES — ${title.toUpperCase()}`,
    subject ? `   Subject: ${subject}   |   Date: ${date}` : `   Date: ${date}`,
    `   Total Questions: ${items.length}`,
    DBL,
    '',
  ];

  // Sort by selected difficulty priority
  const sortedTextNotes = sortItemsByDifficulty(items, difficultySort);
  // Pre-count for group headers
  const notesDiffCounts: Record<string, number> = {};
  sortedTextNotes.forEach(({ q: qq }) => { const d = qq.difficulty || 'medium'; notesDiffCounts[d] = (notesDiffCounts[d] || 0) + 1; });
  let lastNotesDiff = '';

  sortedTextNotes.forEach(({ q, num }) => {
    // Text difficulty group header
    if (difficultySort && difficultySort !== 'all') {
      const curD = q.difficulty || 'medium';
      if (curD !== lastNotesDiff) {
        lines.push(buildDifficultyGroupHeader(curD, notesDiffCounts[curD] || 0, 'text'));
        lastNotesDiff = curD;
      }
    }
    const rPrefs2  = rationalePrefs ?? { showBook: true, showAi: true };
    const aiRat2   = rPrefs2.showAi   ? (rationaleCache[q.question] || '').trim() : '';
    const bookRat2 = rPrefs2.showBook ? (q.rationale || '').trim() : '';
    const rationale = aiRat2 || bookRat2;
    lines.push(`Q.${num}`);

    // Word-wrap question
    const words = q.question.split(' ');
    let cur = '   ';
    words.forEach(w => {
      if (cur.length + w.length + 1 > 65) { lines.push(cur); cur = '   ' + w; }
      else { cur += (cur === '   ' ? '' : ' ') + w; }
    });
    if (cur.trim()) lines.push(cur);
    lines.push('');

    if ((q as any).imageUrl) {
      lines.push(`   Image: ${(q as any).imageUrl}`);
    }

    lines.push(`   ✓  Answer:  ${q.correctAnswer}`);

    if (rationale) {
      lines.push('');
      const rwords = rationale.split(' ');
      let rc = '   💡 ';
      rwords.forEach(w => {
        if (rc.length + w.length + 1 > 65) { lines.push(rc); rc = '      ' + w; }
        else { rc += (rc.endsWith('💡 ') ? '' : ' ') + w; }
      });
      if (rc.trim()) lines.push(rc);
    }

    lines.push('');
    lines.push(DOT);
    lines.push('');
  });

  lines.push(DBL);
  lines.push(`   Generated by R.J Quiz · ${date}`);
  lines.push(DBL);
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAM PAPER — Official MCQ Format
// ═══════════════════════════════════════════════════════════════════════════════
const EXAM_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{
  font-family:'Times New Roman',Times,Georgia,serif;
  background:#fff;color:#111;
  padding:32px 52px;font-size:12pt;line-height:1.65;
  max-width:820px;margin:0 auto;
}
@media print{
  body{padding:0;max-width:100%;font-size:11pt;}
  @page{size:A4;margin:15mm 12mm;}
  .no-print{display:none!important;}
  .q-block{page-break-inside:avoid;}
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.no-print{
  background:#1e3a8a;color:#fff;padding:10px 16px;border-radius:8px;
  margin-bottom:22px;font-size:12px;
  display:flex;justify-content:space-between;align-items:center;
  font-family:Arial,sans-serif;
}
.no-print button{background:#3b82f6;color:#fff;border:none;padding:7px 14px;border-radius:6px;cursor:pointer;font-weight:700;}

/* Exam header — exactly like the image */
.exam-header{
  border:2.5px solid #111;padding:16px 22px;margin-bottom:18px;
}
.exam-title{
  font-size:16pt;font-weight:900;text-align:center;
  text-transform:uppercase;font-family:Arial,sans-serif;margin-bottom:12px;
}
.exam-meta-grid{
  display:grid;grid-template-columns:1fr 1fr;gap:5px 28px;font-size:11pt;
  border-top:1px solid #ccc;padding-top:10px;
}
.exam-meta-item{display:flex;gap:8px;}
.exam-meta-label{font-weight:800;min-width:100px;font-family:Arial,sans-serif;}

.instructions{
  margin-bottom:18px;padding:9px 14px;background:#f9fafb;
  border:1px solid #e0e0e0;font-size:10.5pt;
  font-family:Arial,sans-serif;border-radius:3px;
}

/* Question block */
.q-block{margin-bottom:0;}
.q-text{
  font-size:12.5pt;font-weight:700;margin-bottom:8px;line-height:1.65;
}
.q-num{font-weight:900;font-family:Arial,sans-serif;}

/* Options — 2-column grid matching the exam paper image exactly */
.opts-grid{
  display:grid;grid-template-columns:1fr 1fr;
  gap:3px 24px;margin-left:22px;margin-bottom:4px;
}
@media(max-width:500px){.opts-grid{grid-template-columns:1fr;}}
.opt-item{
  font-size:11.5pt;display:flex;gap:8px;
  align-items:flex-start;line-height:1.55;
}
.opt-letter{
  font-weight:700;min-width:24px;flex-shrink:0;
  font-family:Arial,sans-serif;
}
.q-sep{border:none;border-top:1px dashed #c0c0c0;margin:13px 0;}

/* Answer key */
.answer-key{margin-top:26px;padding-top:14px;border-top:2px solid #333;}
.ak-title{
  font-size:11pt;font-weight:900;text-transform:uppercase;
  letter-spacing:.08em;font-family:Arial,sans-serif;
  margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #bbb;
}
.ak-grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));
  gap:5px 10px;font-size:11pt;font-family:Arial,sans-serif;
}
.ak-item{
  padding:3px 8px;background:#f3f4f6;border-radius:4px;
  font-family:monospace,Arial,sans-serif;font-size:11pt;font-weight:700;
}

.exam-footer{
  border-top:1px solid #ccc;margin-top:20px;padding-top:8px;
  text-align:center;font-size:9pt;color:#888;font-family:Arial,sans-serif;
}
/* Rationale in exam paper */
.exam-rat-section{margin:8px 0 4px 22px;display:flex;flex-direction:column;gap:5px;}
.exam-rat-box{padding:8px 13px;border-radius:0 7px 7px 0;font-size:10.5pt;line-height:1.75;border-left:4px solid;}
.exam-rat-lbl{font-size:8pt;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;display:block;font-family:Arial,sans-serif;}
.exam-rat-book{background:#fffbeb;border-left-color:#f59e0b;color:#78350f;}
.exam-rat-book .exam-rat-lbl{color:#b45309;}
.exam-rat-ai{background:#f5f3ff;border-left-color:#7c3aed;color:#4c1d95;}
.exam-rat-ai .exam-rat-lbl{color:#6d28d9;}
`;

export function buildExamPaperHtml(
  results: QuizResult[],
  showAnswerKey = true,
  forPrint = false,
  reportOrder: ReportOrder = 'attempt',
  inlineAnswers = false,
  rationaleCache?: Record<string, string>,
  rationalePrefs?: RationalePrefs,
  difficultySort?: 'all' | 'easy' | 'medium' | 'hard'
): string {
  const items: { q: QuizResult['quizData'][0]; num: number }[] = [];
  const seen = new Set<string>();
  results.forEach(r => {
    orderQuizDataForReport(r, reportOrder).forEach(({ q }) => {
      if (!seen.has(q.question)) { seen.add(q.question); items.push({ q, num: items.length + 1 }); }
    });
  });

  const subject    = results[0]?.subject || 'General';
  const title      = results.length === 1 ? (results[0].quizTitle || 'Practice Exam Paper') : 'Compiled Practice Paper';
  const date       = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalMarks = items.length;

  // Sort by selected difficulty priority
  const sortedExamItems = sortItemsByDifficulty(items, difficultySort);

  const questionsHtml = sortedExamItems.map(({ q, num }, i) => {
    // Difficulty group header
    let examGroupHdr = '';
    if (difficultySort && difficultySort !== 'all') {
      const prevDiff = i > 0 ? (sortedExamItems[i - 1].q.difficulty || 'medium') : '';
      const curDiff = q.difficulty || 'medium';
      if (curDiff !== prevDiff) {
        const gc = sortedExamItems.filter(it => (it.q.difficulty || 'medium') === curDiff).length;
        examGroupHdr = buildDifficultyGroupHeader(curDiff, gc);
      }
    }
    const opts = q.shuffledOpts || q.options;
    const optsHtml = opts.map((opt, oi) => {
      const isCorrect = inlineAnswers && opt === q.correctAnswer;
      const style = isCorrect
        ? 'color:#059669;font-weight:800;'
        : '';
      const checkmark = isCorrect
        ? '<span style="color:#059669;font-weight:900;margin-left:4px;">✔️</span>'
        : '';
      return `<div class="opt-item" ${isCorrect ? 'style="background:#ecfdf5;border-radius:5px;padding:4px 8px;border:1.5px solid #a7f3d0;"' : ''}>
        <span class="opt-letter" ${isCorrect ? 'style="color:#059669;"' : ''}>(${String.fromCharCode(65 + oi)})</span>
        <span style="${style}">${esc(opt)}${checkmark}</span>
      </div>`;
    }).join('');
    const qImgHtml = (q as any).imageUrl
      ? `<div style="text-align:center;margin:6px 0 10px;"><img src="${esc((q as any).imageUrl)}" alt="" style="max-width:100%;max-height:150px;border-radius:6px;border:1px solid #e0e0e0;" onerror="this.style.display='none'"/></div>`
      : '';
    const rPrefs = rationalePrefs ?? { showBook: false, showAi: false };
    const bookRat = rPrefs.showBook ? (q.rationale?.trim() || '') : '';
    const aiRat = rPrefs.showAi && rationaleCache ? (rationaleCache[q.question]?.trim() || '') : '';
    const examRatHtml = (bookRat || aiRat) ? `<div class="exam-rat-section">
      ${bookRat ? `<div class="exam-rat-box exam-rat-book"><span class="exam-rat-lbl">📖 Book Rationale</span>${ratPoints(bookRat)}</div>` : ''}
      ${aiRat ? `<div class="exam-rat-box exam-rat-ai"><span class="exam-rat-lbl">💡 AI Explanation</span>${formatAiBullets(aiRat)}</div>` : ''}
    </div>` : '';

    return `${examGroupHdr}<div class="q-block">
      <p class="q-text"><span class="q-num">Q.${num}</span>&nbsp;&nbsp;${htmlLine(q.question)}</p>
      ${qImgHtml}
      <div class="opts-grid">${optsHtml}</div>
      ${examRatHtml}
    </div>${i < sortedExamItems.length - 1 ? '<hr class="q-sep"/>' : ''}`;
  }).join('');

  const answerKeyHtml = (showAnswerKey && !inlineAnswers) ? `
    <div class="answer-key">
      <div class="ak-title">&#9472;&#9472; Answer Key &#9472;&#9472;</div>
      <div class="ak-grid">
        ${items.map(({ q, num }) => {
          const opts = q.shuffledOpts || q.options;
          const idx = opts.indexOf(q.correctAnswer);
          const letter = idx >= 0 ? String.fromCharCode(65 + idx) : '?';
          return `<span class="ak-item">Q${num} &rarr; ${letter}</span>`;
        }).join('')}
      </div>
    </div>` : '';

  const printBar = `<div class="no-print">
    <div>&#128196; <strong>Print / Save as PDF:</strong> Print dialog opening &#8212; choose <strong>"Save as PDF"</strong></div>
    <button onclick="window.print()">&#128424; Print / Save PDF</button>
  </div>`;
  const printScript = forPrint
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},600);});<\/script>` : '';

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} &mdash; Exam Paper</title>
<style>${EXAM_CSS}</style>${printScript}
</head><body>
${printBar}
<div class="exam-header">
  <div class="exam-title">${esc(title)}</div>
  <div class="exam-meta-grid">
    <div class="exam-meta-item"><span class="exam-meta-label">Subject:</span><span>${esc(subject)}</span></div>
    <div class="exam-meta-item"><span class="exam-meta-label">Date:</span><span>${esc(date)}</span></div>
    <div class="exam-meta-item"><span class="exam-meta-label">Total Marks:</span><span>${totalMarks}</span></div>
    <div class="exam-meta-item"><span class="exam-meta-label">Questions:</span><span>${items.length} (MCQ)</span></div>
  </div>
</div>
<div class="instructions">
  <strong>Instructions:</strong>&nbsp;&nbsp;
  1. All questions are compulsory.&nbsp;&nbsp;&nbsp;
  2. Each question carries <strong>1 mark</strong>.&nbsp;&nbsp;&nbsp;
  3. Select the most appropriate answer from the given options.
</div>
${questionsHtml}
${answerKeyHtml}
<div class="exam-footer">Generated by R.J Quiz &nbsp;&middot;&nbsp; ${esc(date)}</div>
</body></html>`;
}

export function buildExamPaperText(
  results: QuizResult[],
  showAnswerKey = true,
  reportOrder: ReportOrder = 'attempt',
  difficultySort?: 'all' | 'easy' | 'medium' | 'hard'
): string {
  const DBL  = '═'.repeat(66);
  const LINE = '─'.repeat(66);
  const DOT  = '·'.repeat(66);
  const items: { q: QuizResult['quizData'][0]; num: number }[] = [];
  const seen = new Set<string>();
  results.forEach(r => {
    orderQuizDataForReport(r, reportOrder).forEach(({ q }) => {
      if (!seen.has(q.question)) { seen.add(q.question); items.push({ q, num: items.length + 1 }); }
    });
  });

  const subject = results[0]?.subject || 'General';
  const title   = results.length === 1 ? (results[0].quizTitle || 'Practice Exam Paper') : 'Compiled Practice Paper';
  const date    = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const lines: string[] = [
    DBL,
    `   ${title.toUpperCase()}`,
    `   Subject: ${subject}   |   Date: ${date}`,
    `   Total Marks: ${items.length}   |   Questions: ${items.length} (MCQ)`,
    LINE,
    `   Instructions: All questions are compulsory. Each carries 1 mark.`,
    DBL,
    '',
  ];

  // Sort by selected difficulty priority
  const sortedExamTextItems = sortItemsByDifficulty(items, difficultySort);
  // Pre-count for group headers
  const examTextDiffCounts: Record<string, number> = {};
  sortedExamTextItems.forEach(({ q: qq }) => { const d = qq.difficulty || 'medium'; examTextDiffCounts[d] = (examTextDiffCounts[d] || 0) + 1; });
  let lastExamTextDiff = '';

  sortedExamTextItems.forEach(({ q, num }, i) => {
    // Text difficulty group header
    if (difficultySort && difficultySort !== 'all') {
      const curD = q.difficulty || 'medium';
      if (curD !== lastExamTextDiff) {
        lines.push(buildDifficultyGroupHeader(curD, examTextDiffCounts[curD] || 0, 'text'));
        lastExamTextDiff = curD;
      }
    }
    const opts = q.shuffledOpts || q.options;

    // Question text with word-wrap
    const qLabel = `Q.${num}  `;
    const words  = q.question.split(' ');
    let cur = qLabel;
    words.forEach(w => {
      if (cur.length + w.length + 1 > 66) { lines.push(cur); cur = ' '.repeat(qLabel.length) + w; }
      else { cur += (cur === qLabel ? '' : ' ') + w; }
    });
    if (cur.trim()) lines.push(cur);

    if ((q as any).imageUrl) {
      lines.push(`       Image: ${(q as any).imageUrl}`);
    }
    lines.push('');

    // Options in 2-column layout
    for (let i2 = 0; i2 < opts.length; i2 += 2) {
      const lLetter = String.fromCharCode(65 + i2);
      const rLetter = opts[i2 + 1] ? String.fromCharCode(65 + i2 + 1) : null;
      const lOpt = `       (${lLetter})  ${opts[i2]}`;
      if (rLetter && opts[i2 + 1]) {
        const rOpt = `(${rLetter})  ${opts[i2 + 1]}`;
        const padded = lOpt.padEnd(36);
        lines.push(`${padded}${rOpt}`);
      } else {
        lines.push(lOpt);
      }
    }

    if (i < sortedExamTextItems.length - 1) { lines.push(''); lines.push(DOT); lines.push(''); }
  });

  if (showAnswerKey) {
    lines.push('');
    lines.push(DBL);
    lines.push('   ANSWER KEY');
    lines.push(LINE);
    const akPairs = items.map(({ q, num }) => {
      const opts = q.shuffledOpts || q.options;
      const idx  = opts.indexOf(q.correctAnswer);
      return `Q${num}→${idx >= 0 ? String.fromCharCode(65 + idx) : '?'}`;
    });
    // 8 per row
    for (let i2 = 0; i2 < akPairs.length; i2 += 8) {
      lines.push('   ' + akPairs.slice(i2, i2 + 8).join('   '));
    }
    lines.push('');
  }

  lines.push(DBL);
  lines.push(`   Generated by R.J Quiz · ${date}`);
  lines.push(DBL);
  return lines.join('\n');
}
