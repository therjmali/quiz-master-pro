/**
 * Rationale / AI-explanation text — single source of truth.
 *
 * Content text never carries emoji or bullet symbols. A rationale is an array
 * of plain points; the UI draws its own bullet. Pure (no browser APIs) so the
 * frontend and API endpoints share it.
 */

const PICTOGRAPHS = /\p{Extended_Pictographic}/gu;
const JOINERS = /[\uFE0F\u200D]/g;
const LEADING_MARKERS = /^\s*(?:[•\-*·►➤✔✓📖]\s*)+/u;

/** Strip emoji/pictographs, joiners, a leading bullet marker and doubled spaces from ONE line. */
export function cleanExplanationText(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(PICTOGRAPHS, '')
    .replace(JOINERS, '')
    .replace(/\t/g, ' ')
    .replace(LEADING_MARKERS, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Split any rationale (string or array) into trimmed, cleaned, non-empty points. */
export function rationalePoints(text: string | string[] | undefined | null): string[] {
  if (!text) return [];
  const lines = Array.isArray(text) ? text : String(text).replace(/\r\n?/g, '\n').split('\n');
  return lines.flatMap(l => String(l).replace(/\r\n?/g, '\n').split('\n'))
    .map(cleanExplanationText)
    // Drop old section headings ("✓ Why correct:" / "✗ Other options:") left in saved AI text
    .filter(l => l.length > 0 && !/^[✗✘×]?\s*(?:why\s+correct|other\s+options?)\s*:?$/i.test(l));
}

/** Clean a whole multi-line block, keeping one point per line (used for stored data). */
export function cleanExplanationBlock(text: string | undefined | null): string {
  return rationalePoints(text).join('\n');
}

/** Plain-text rendering for exports/copy: "• point" lines, compact (no blank lines). */
export function formatRationale(text: string | string[] | undefined | null): string {
  return rationalePoints(text).map(p => `• ${p}`).join('\n');
}

/** Rows for rendering — one per point. */
export function rationaleRows(text: string | string[] | undefined | null): { text: string }[] {
  return rationalePoints(text).map(t => ({ text: t }));
}

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Compact HTML bullet list for PDFs/exports: 6px gap, line-height 1.5, hanging indent. */
export function rationaleHtmlList(text: string | string[] | undefined | null): string {
  const items = rationalePoints(text)
    .map((p, i) => `<li style="margin:${i ? '6px' : '0'} 0 0;line-height:1.5;">${escHtml(p)}</li>`)
    .join('');
  return items ? `<ul style="margin:0;padding-left:1.1em;list-style:disc;">${items}</ul>` : '';
}
