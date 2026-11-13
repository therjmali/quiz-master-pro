/** The same ReportDoc as plain text and as Word-friendly HTML, so every format follows the same settings. */
import { parseInline } from './markdown';
import { docToMasterHtml } from './masterHtml';
import type { ReportDoc, ReportItem, ReportStyle } from './types';

const L = (i: number) => String.fromCharCode(65 + (i % 26));
const idx = (it: ReportItem, t: string) => it.options.findIndex(o => o.trim() === t.trim());
const ansText = (it: ReportItem) => it.correct.map(c => { const i = idx(it, c); return i >= 0 ? `(${L(i)}) ${c}` : c; }).join(', ');
const userText = (it: ReportItem) => it.status === 'skipped' ? 'Not attempted' : `Your answer: ${it.user && idx(it, it.user) >= 0 ? `(${L(idx(it, it.user))}) ` : ''}${it.user ?? ''} - ${it.status === 'correct' ? 'Correct' : 'Incorrect'}`;
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function docToText(doc: ReportDoc, style: ReportStyle): string {
  const out: string[] = [`${style.brand} - ${doc.title}`, doc.meta.join('  |  '), '='.repeat(60), ''];
  if (doc.summary && doc.items) {
    const s = doc.summary;
    out.push(`Questions: ${s.questions}   Correct: ${s.correct}   Wrong: ${s.wrong}   Skipped: ${s.skipped}   Accuracy: ${s.accuracy}%${s.scorePct !== undefined ? `   Score: ${s.scorePct}%` : ''}`, '');
  }
  for (const it of doc.items ?? []) {
    out.push(`Q${it.n}. ${it.question}`);
    it.options.forEach((o, i) => out.push(`  (${L(i)}) ${o}`));
    if (style.answers === 'inline') {
      out.push(`Ans.${it.n}. : ${ansText(it)}`);
      if (style.showUserAnswer && it.status !== 'unknown') out.push(`  ${userText(it)}`);
      if (it.book) out.push(`  Explanation: ${it.book}`);
      if (it.ai) out.push(`  AI explanation: ${it.ai}`);
    }
    out.push('-'.repeat(40), '');
  }
  if (style.answers === 'key' && doc.items?.length) {
    out.push('ANSWER KEY');
    out.push((doc.items).map(it => `${it.n}-${it.correct.map(c => (idx(it, c) >= 0 ? L(idx(it, c)) : '?')).join('/')}`).join('   '), '');
    for (const it of doc.items) { if (it.book || it.ai) out.push(`Q${it.n}. ${ansText(it)}`, ...(it.book ? [`  Explanation: ${it.book}`] : []), ...(it.ai ? [`  AI explanation: ${it.ai}`] : []), ''); }
  }
  for (const b of doc.blocks ?? []) {
    if (b.type === 'hr') out.push('-'.repeat(40));
    else if (b.type === 'li') out.push(`${'  '.repeat(b.level)}${b.marker} ${parseInline(b.text).map(s => s.text).join('')}`);
    else out.push(parseInline(b.text).map(s => s.text).join(''), b.type.startsWith('h') ? '' : '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function docToHtml(doc: ReportDoc, style: ReportStyle): string {
  // The web-page export is the same premium dashboard as the PDF, so the file matches what was previewed.
  if ((style.template ?? 'master') === 'master') return docToMasterHtml(doc, style);
  return docToClassicHtml(doc, style);
}

/** The plain, classic HTML page. Word shares it: Word understands simple block layout, not the dashboard grid. */
function docToClassicHtml(doc: ReportDoc, style: ReportStyle): string {
  const css = `body{font-family:Inter,Arial,'Segoe UI',sans-serif;color:#1f2937;font-size:11pt;line-height:1.5;margin:0}
.wrap{max-width:780px;margin:0 auto;padding:24px 20px}h1{font-size:20pt;margin:0 0 4px;color:#111827}.meta{color:#6b7280;font-size:9pt;margin-bottom:14px}
.chips span{display:inline-block;border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:4px 10px;margin:0 6px 6px 0;font-size:9pt}
.q{margin:14px 0 4px}.q b{color:#111827}.opt{margin:2px 0 2px 10px}.rule{border-top:1px dashed #cbd2dc;margin:8px 0 6px}
.ans{font-weight:700;color:#0f6b3f}.you{font-size:9.5pt}.ok{color:#0f6b3f}.no{color:#b42318}.sk{color:#b45309}.rat{color:#6b7280;font-size:9.5pt;margin:4px 0}
.rat b{color:#6d28d9}.rat.ai b{color:#0e7490}h2{font-size:14pt;margin:18px 0 6px}h3{font-size:11.5pt;margin:12px 0 4px}li{margin:2px 0}blockquote{border-left:3px solid #4f46e5;margin:8px 0;padding-left:10px;color:#4b5563}
.foot{margin-top:24px;color:#9ca3af;font-size:8pt;text-align:center}`;
  const parts: string[] = [];
  parts.push(`<h1>${esc(doc.title)}</h1><div class="meta">${esc(style.brand)} · ${esc(doc.meta.join(' · '))}</div>`);
  if (doc.summary && doc.items) {
    const s = doc.summary;
    parts.push(`<div class="chips"><span>Questions <b>${s.questions}</b></span><span>Correct <b>${s.correct}</b></span><span>Wrong <b>${s.wrong}</b></span><span>Skipped <b>${s.skipped}</b></span><span>Accuracy <b>${s.accuracy}%</b></span></div>`);
  }
  for (const it of doc.items ?? []) {
    parts.push(`<div class="q"><b>Q${it.n}.</b> ${esc(it.question)}</div>`);
    it.options.forEach((o, i) => parts.push(`<div class="opt"><b>(${L(i)})</b> ${esc(o)}</div>`));
    if (style.answers === 'inline') {
      parts.push(`<div class="rule"></div><div><span class="ans"><b style="color:#111827">Ans.${it.n}. :</b> ${esc(ansText(it))}</span></div>`);
      if (style.showUserAnswer && it.status !== 'unknown') parts.push(`<div class="you ${it.status === 'correct' ? 'ok' : it.status === 'wrong' ? 'no' : 'sk'}">${esc(userText(it))}</div>`);
      if (it.book) parts.push(`<div class="rat"><b>Explanation:</b> ${esc(it.book).replace(/\n/g, '<br>')}</div>`);
      if (it.ai) parts.push(`<div class="rat ai"><b>AI explanation:</b> ${esc(it.ai).replace(/\n/g, '<br>')}</div>`);
    }
  }
  if (style.answers === 'key' && doc.items?.length) {
    parts.push(`<h2>Answer Key</h2><p>${doc.items.map(it => `${it.n}-<b>${esc(it.correct.map(c => (idx(it, c) >= 0 ? L(idx(it, c)) : '?')).join('/'))}</b>`).join(' &nbsp; ')}</p>`);
    for (const it of doc.items) if (it.book || it.ai) parts.push(`<div class="q"><b>Q${it.n}.</b> <span class="ans">${esc(ansText(it))}</span></div>${it.book ? `<div class="rat"><b>Explanation:</b> ${esc(it.book)}</div>` : ''}${it.ai ? `<div class="rat ai"><b>AI explanation:</b> ${esc(it.ai)}</div>` : ''}`);
  }
  for (const b of doc.blocks ?? []) {
    const t = parseInline(b.type === 'hr' ? '' : b.text).map(s => (s.bold ? `<b>${esc(s.text)}</b>` : esc(s.text))).join('');
    if (b.type === 'hr') parts.push('<hr>');
    else if (b.type === 'h1' || b.type === 'h2') parts.push(`<h2>${t}</h2>`);
    else if (b.type === 'h3') parts.push(`<h3>${t}</h3>`);
    else if (b.type === 'li') parts.push(`<div style="margin-left:${12 + b.level * 14}px">${esc(b.marker)} ${t}</div>`);
    else if (b.type === 'quote') parts.push(`<blockquote>${t}</blockquote>`);
    else parts.push(`<p>${t}</p>`);
  }
  parts.push(`<div class="foot">${esc(style.brand)}</div>`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${css}</style></head><body><div class="wrap">${parts.join('\n')}</div></body></html>`;
}

/** Word opens HTML saved as .doc; this adds the Office namespaces and page setup. */
export function docToWordHtml(doc: ReportDoc, style: ReportStyle): string {
  // Always the classic page: Word cannot lay out flexbox/grid, so the dashboard would open as a jumble.
  const html = docToClassicHtml(doc, style);
  return html.replace('<html>', "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>")
    .replace('</style>', '@page{size:A4;margin:.75in}</style>');
}
