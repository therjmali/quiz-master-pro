/** Tiny markdown (+ plain HTML) to block converter for revision sheets and generic documents. */
export type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { type: 'li'; text: string; level: number; marker: string }
  | { type: 'hr' };

export interface InlineSpan { text: string; bold: boolean }

/** **bold** / __bold__ -> spans; other markdown marks (`, *, _) are dropped. */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const re = /(\*\*|__)(.+?)\1/g;
  let last = 0, m: RegExpExecArray | null;
  const clean = (s: string) => s.replace(/`([^`]*)`/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1$2').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  while ((m = re.exec(text))) {
    if (m.index > last) spans.push({ text: clean(text.slice(last, m.index)), bold: false });
    spans.push({ text: clean(m[2]), bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: clean(text.slice(last)), bold: false });
  return spans.filter(s => s.text !== '');
}

export function markdownToBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ').trim() }); para = []; } };
  for (const raw of String(md ?? '').replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flush(); blocks.push({ type: h[1].length === 1 ? 'h1' : h[1].length === 2 ? 'h2' : 'h3', text: h[2].replace(/#+\s*$/, '').trim() }); continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flush(); blocks.push({ type: 'hr' }); continue; }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) { flush(); blocks.push({ type: 'quote', text: q[1].trim() }); continue; }
    const li = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) { flush(); blocks.push({ type: 'li', text: li[3].trim(), level: Math.min(3, Math.floor(li[1].replace(/\t/g, '  ').length / 2)), marker: /\d/.test(li[2]) ? li[2] : '•' }); continue; }
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')) continue; // table separator row
    if (line.includes('|') && /^\s*\|.*\|\s*$/.test(line)) { flush(); blocks.push({ type: 'p', text: line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).join('   |   ') }); continue; }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

/** HTML (as built by the legacy report builders) -> readable blocks, in document order. */
export function htmlToBlocks(html: string): Block[] {
  if (typeof DOMParser === 'undefined') return markdownToBlocks(String(html).replace(/<[^>]+>/g, ' '));
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,head,.no-print,.print-bar,svg').forEach(n => n.remove());
  const blocks: Block[] = [];
  const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (/^h[1-3]$/.test(tag)) { const t = text(child); if (t) blocks.push({ type: tag as 'h1' | 'h2' | 'h3', text: t }); }
      else if (/^h[4-6]$/.test(tag)) { const t = text(child); if (t) blocks.push({ type: 'h3', text: t }); }
      else if (tag === 'li') { const t = text(child); if (t) blocks.push({ type: 'li', text: t, level: 0, marker: '•' }); }
      else if (tag === 'hr') blocks.push({ type: 'hr' });
      else if (tag === 'tr') { const t = Array.from(child.children).map(text).filter(Boolean).join('   |   '); if (t) blocks.push({ type: 'p', text: t }); }
      else if (tag === 'blockquote') { const t = text(child); if (t) blocks.push({ type: 'quote', text: t }); }
      else if (tag === 'p' || (tag === 'div' && !child.querySelector('div,p,h1,h2,h3,h4,li,tr,ul,ol,table'))) { const t = text(child); if (t) blocks.push({ type: 'p', text: t }); }
      else walk(child);
    }
  };
  walk(doc.body);
  return blocks;
}
