import { layoutReport } from './layout';
import { createReportFonts, type FontSource, type ReportFonts } from './reportFonts';
import { writePdf } from './pdfWriter';
import type { LaidOutReport, ReportDoc, ReportStyle } from './types';

function textsOf(doc: ReportDoc): string[] {
  const t: string[] = [doc.title, ...(doc.meta ?? [])];
  for (const i of doc.items ?? []) t.push(i.question, ...i.options, ...i.correct, i.user ?? '', i.book ?? '', i.ai ?? '', i.source ?? '');
  for (const b of doc.blocks ?? []) if ('text' in b) t.push(b.text);
  return t;
}

/** Lays the document out (used by the on-screen preview AND the exporter, so both are identical). */
export async function prepareReport(doc: ReportDoc, style: ReportStyle, source: FontSource): Promise<{ report: LaidOutReport; fonts: ReportFonts }> {
  const fonts = await createReportFonts(textsOf(doc), source);
  return { report: layoutReport(doc, style, fonts.set), fonts };
}

export async function generatePdf(doc: ReportDoc, style: ReportStyle, source: FontSource): Promise<{ bytes: Uint8Array; pages: number }> {
  const { report, fonts } = await prepareReport(doc, style, source);
  const bytes = await writePdf(report, fonts, { title: doc.title, brand: style.brand });
  return { bytes, pages: report.pages.length };
}
