/** Draws a laid-out report into a PDF with pdf-lib (works fully offline). */
import { rgb } from 'pdf-lib';
import { segmentText } from './fontSet';
import type { LaidOutReport, Op } from './types';
import type { ReportFonts } from './reportFonts';

const color = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex) ?? /^#?([0-9a-f]{6})$/i.exec('#111827')!;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const roundedRect = (w: number, h: number, r: number) =>
  `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;

export async function writePdf(report: LaidOutReport, fonts: ReportFonts, info: { title: string; subject?: string; brand: string }): Promise<Uint8Array> {
  const { doc, set, pdfFonts } = fonts;
  doc.setTitle(info.title);
  doc.setAuthor(info.brand);
  doc.setCreator(info.brand);
  doc.setProducer(`${info.brand} offline report engine`);
  if (info.subject) doc.setSubject(info.subject);
  doc.setCreationDate(new Date());
  for (const p of report.pages) {
    const page = doc.addPage([p.width, p.height]);
    const H = p.height;
    const draw = (op: Op) => {
      if (op.t === 'text') {
        let x = op.x;
        for (const seg of segmentText(op.text, op.bold, set)) {
          const font = pdfFonts.get(seg.face.id)!;
          page.drawText(seg.text, { x, y: H - op.y, size: op.size, font, color: color(op.color), opacity: op.opacity });
          x += seg.face.width(seg.text, op.size);
        }
      } else if (op.t === 'line') {
        page.drawLine({ start: { x: op.x1, y: H - op.y1 }, end: { x: op.x2, y: H - op.y2 }, thickness: op.w, color: color(op.color), dashArray: op.dash });
      } else if (op.t === 'circle') {
        page.drawCircle({
          x: op.x, y: H - op.y, size: op.r,
          color: op.fill ? color(op.fill) : undefined,
          borderColor: op.stroke ? color(op.stroke) : undefined,
          borderWidth: op.stroke ? (op.sw ?? 0) : 0,
          ...(op.opacity !== undefined ? { opacity: op.opacity } : {}),
        });
      } else if (op.r && op.r > 0) {
        page.drawSvgPath(roundedRect(op.w, op.h, op.r), { x: op.x, y: H - op.y, color: op.fill ? color(op.fill) : undefined, borderColor: op.stroke ? color(op.stroke) : undefined, borderWidth: op.sw ?? 0, ...(op.opacity !== undefined ? { opacity: op.opacity } : {}) });
      } else {
        page.drawRectangle({ x: op.x, y: H - op.y - op.h, width: op.w, height: op.h, color: op.fill ? color(op.fill) : undefined, borderColor: op.stroke ? color(op.stroke) : undefined, borderWidth: op.sw ?? 0, ...(op.opacity !== undefined ? { opacity: op.opacity } : {}) });
      }
    };
    p.ops.forEach(draw);
  }
  return doc.save();
}
