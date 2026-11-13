/** One place that turns a ReportDoc into a saved file (PDF / Word / text / HTML), offline, with a notification. */
import { toast } from 'sonner';
import { generatePdf } from './pdf/generate';
import { browserFontSource } from './pdf/browserFonts';
import { docToHtml, docToText, docToWordHtml } from './pdf/formats';
import { htmlToBlocks } from './pdf/markdown';
import { DEFAULT_STYLE, type ReportDoc, type ReportKind, type ReportStyle } from './pdf/types';
import { MIME, saveReportFile, type SavedReport } from '../../platform/reportFiles';
import { loadReportPrefs } from './reportPrefs';

export type ExportFormat = 'pdf' | 'doc' | 'text' | 'html';
const EXT: Record<ExportFormat, string> = { pdf: 'pdf', doc: 'doc', text: 'txt', html: 'html' };
export const FORMAT_LABEL: Record<ExportFormat, string> = { pdf: 'PDF', doc: 'Word', text: 'Text', html: 'HTML' };

export function friendlyError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (/quota|storage/i.test(m)) return 'Not enough free storage to save the report.';
  return m || 'Could not create the report.';
}

export async function exportReportDoc(doc: ReportDoc, style: ReportStyle, format: ExportFormat, o: { filename: string; onStage?: (s: string) => void }): Promise<SavedReport> {
  const name = o.filename.replace(/\.[a-z0-9]+$/i, '') + '.' + EXT[format];
  if (format === 'pdf') {
    o.onStage?.('Laying out pages…');
    const { bytes, pages } = await generatePdf(doc, style, browserFontSource);
    o.onStage?.('Saving…');
    return saveReportFile({ name, mime: MIME.pdf, bytes, kind: doc.kind, pages });
  }
  o.onStage?.('Saving…');
  if (format === 'text') return saveReportFile({ name, mime: 'text/plain;charset=utf-8', text: docToText(doc, style), kind: doc.kind });
  if (format === 'html') return saveReportFile({ name, mime: 'text/html;charset=utf-8', text: docToHtml(doc, style), kind: doc.kind });
  return saveReportFile({ name, mime: MIME.doc, text: docToWordHtml(doc, style), kind: doc.kind });
}

/** Toast with the right follow-up for the platform. */
export function announceSaved(r: SavedReport, open?: (r: SavedReport) => void, share?: (r: SavedReport) => void): void {
  const native = !!r.uri;
  toast.success(`Saved ${r.name}`, {
    description: native ? r.where : 'Check your browser downloads',
    duration: 7000,
    action: native && open ? { label: 'Open', onClick: () => open(r) } : undefined,
    cancel: native && share ? { label: 'Share', onClick: () => share(r) } : undefined,
  });
}

/** Revision sheet / any markdown: offline PDF (or Word / text) through the same pipeline. */
export async function exportMarkdownReport(markdown: string, format: ExportFormat, o: { title: string; filename: string; meta?: string[]; kind?: ReportKind }): Promise<void> {
  const { buildMarkdownDoc } = await import('./pdf/model');
  const doc = buildMarkdownDoc(o.kind ?? 'revision', o.title, markdown, o.meta ?? [new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })]);
  // study material reads best as a document; question reports use the dashboard template
  const style: ReportStyle = { ...DEFAULT_STYLE, ...loadReportPrefs(), columns: 1, answers: 'none', showUserAnswer: false, template: 'classic' };
  const tid = toast.loading(format === 'pdf' ? 'Building PDF…' : 'Saving…');
  try { const saved = await exportReportDoc(doc, style, format, { filename: o.filename }); announceSaved(saved, openLater, shareLater); }
  catch (e) { toast.error(friendlyError(e)); }
  finally { toast.dismiss(tid); }
}

/**
 * Legacy HTML-based screens (bookmark exam papers, revision notes): same offline save path.
 * These keep the classic document look on purpose — the screen handed over a laid-out paper, not questions.
 */
export async function exportLegacyHtml(html: string, format: ExportFormat, filename: string, title: string, kind: ReportKind = 'custom'): Promise<void> {
  const prefs = loadReportPrefs();
  const style: ReportStyle = { ...DEFAULT_STYLE, ...prefs, columns: 1, answers: 'none', showUserAnswer: false, template: 'classic' };
  try {
    if (format === 'pdf') {
      const doc: ReportDoc = { kind, title, meta: [new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })], blocks: htmlToBlocks(html) };
      if (!doc.blocks!.length) throw new Error('Nothing to put in the PDF.');
      const toastId = toast.loading('Building PDF…');
      try { const saved = await exportReportDoc(doc, style, 'pdf', { filename }); toast.dismiss(toastId); announceSaved(saved, openLater, shareLater); }
      catch (e) { toast.dismiss(toastId); throw e; }
      return;
    }
    const mime = format === 'doc' ? MIME.doc : format === 'text' ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8';
    const saved = await saveReportFile({ name: filename.replace(/\.[a-z0-9]+$/i, '') + '.' + EXT[format], mime, text: html, kind });
    announceSaved(saved, openLater, shareLater);
  } catch (e) { toast.error(friendlyError(e)); }
}

async function openLater(r: SavedReport) { const m = await import('../../platform/reportFiles'); if (!(await m.openSavedReport(r))) toast.error('No app can open this file. Use Share to send it somewhere.'); }
async function shareLater(r: SavedReport) { const m = await import('../../platform/reportFiles'); await m.shareSavedReport(r); }
export { openLater as openSavedReportToast, shareLater as shareSavedReportToast };
