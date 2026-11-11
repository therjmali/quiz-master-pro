/** Loads the bundled fonts into a pdf-lib document and exposes them to the layout engine as a FontSet. */
import 'regenerator-runtime/runtime.js';
import { PDFDocument, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { neededScripts, type Face, type FontSet } from './fontSet';

export type FaceKey = 'latin-400' | 'latin-700' | 'latin-ext-400' | 'latin-ext-700' | 'greek-400' | 'greek-700' | 'devanagari-400' | 'devanagari-700';
export interface FontSource { load(key: FaceKey): Promise<Uint8Array> }

export interface ReportFonts { doc: PDFDocument; set: FontSet; pdfFonts: Map<string, PDFFont> }

export async function createReportFonts(texts: Iterable<string>, source: FontSource): Promise<ReportFonts> {
  const need = neededScripts(texts);
  const keys: [FaceKey, boolean][] = [['latin-400', false], ['latin-700', true]];
  if (need.latinExt) keys.push(['latin-ext-400', false], ['latin-ext-700', true]);
  if (need.greek) keys.push(['greek-400', false], ['greek-700', true]);
  if (need.devanagari) keys.push(['devanagari-400', false], ['devanagari-700', true]);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const pdfFonts = new Map<string, PDFFont>();
  const regular: Face[] = [], bold: Face[] = [];
  for (const [key, isBold] of keys) {
    const font = await doc.embedFont(await source.load(key), { subset: true });
    const cps = new Set<number>(font.getCharacterSet());
    pdfFonts.set(key, font);
    const face: Face = {
      id: key, bold: isBold,
      covers: cp => cps.has(cp),
      width: (t, size) => font.widthOfTextAtSize(t, size),
    };
    (isBold ? bold : regular).push(face);
  }
  return { doc, set: { regular, bold }, pdfFonts };
}
