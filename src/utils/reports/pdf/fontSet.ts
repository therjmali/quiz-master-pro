/**
 * Font fallback + text measuring for the offline PDF/preview engine. Pure: no pdf-lib import, so the layout can be
 * unit-tested with fake fonts and reused by the on-screen preview.
 */
export interface Face {
  id: string;
  bold: boolean;
  covers(cp: number): boolean;
  /** Width of `text` (all code points covered by this face) at `size` pt. */
  width(text: string, size: number): number;
}
export interface FontSet { regular: Face[]; bold: Face[] }
export interface Segment { face: Face; text: string }

/** Characters no bundled font has, mapped to something readable instead of a blank box. */
const REPLACEMENTS: Record<string, string> = {
  '\u2265': '>=', '\u2264': '<=', '\u2260': '!=', '\u2192': '->', '\u2190': '<-', '\u2194': '<->', '\u21D2': '=>',
  '\u2713': 'v', '\u2714': 'v', '\u2717': 'x', '\u2718': 'x', '\u2705': 'v', '\u274C': 'x', '\u2B50': '*', '\u2605': '*', '\u2606': '*',
  '\u00A0': ' ', '\u2009': ' ', '\u200A': ' ', '\u2002': ' ', '\u2003': ' ', '\u202F': ' ',
  '\u200B': '', '\u200C': '', '\uFEFF': '', '\u00AD': '',
  '\u2212': '-', '\u2011': '-', '\u2012': '-', '\u2043': '-',
  '\u2248': '~', '\u221E': 'inf', '\u2022': '\u2022', '\u25CF': '\u2022', '\u25AA': '\u2022', '\u25E6': 'o',
  '\u2191': '(up)', '\u2193': '(down)', '\u2206': 'delta', '\u03BC': '\u00B5',
};
const SUBSCRIPTS = '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089';
const SUPERSCRIPTS: Record<string, string> = { '\u2070': '0', '\u00B9': '1', '\u00B2': '2', '\u00B3': '3', '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9', '\u207A': '+', '\u207B': '-' };

function replacementFor(ch: string): string | undefined {
  if (ch in REPLACEMENTS) return REPLACEMENTS[ch];
  const si = SUBSCRIPTS.indexOf(ch);
  if (si >= 0) return String(si);
  if (ch in SUPERSCRIPTS) return SUPERSCRIPTS[ch];
  const d = ch.normalize('NFKD');
  if (d !== ch && d.length > 0) return d;
  return undefined;
}

const isControl = (cp: number) => (cp < 0x20 && cp !== 0x0a) || (cp >= 0x7f && cp < 0xa0);

/** Splits text into runs that each use one face (first face in the list that covers the character). */
export function segmentText(text: string, bold: boolean, set: FontSet): Segment[] {
  const faces = bold ? set.bold : set.regular;
  const out: Segment[] = [];
  const push = (face: Face, s: string) => {
    const last = out[out.length - 1];
    if (last && last.face === face) last.text += s; else out.push({ face, text: s });
  };
  const place = (ch: string, depth: number) => {
    const cp = ch.codePointAt(0)!;
    if (isControl(cp)) return;
    // Devanagari combining marks / ZWJ must stay with their base letter's face.
    const face = faces.find(f => f.covers(cp));
    if (face) { push(face, ch); return; }
    if (depth > 2) return;
    const rep = replacementFor(ch);
    if (rep !== undefined) { for (const c of rep) place(c, depth + 1); return; }
    if (cp !== 0x3f) place('?', depth + 1);
  };
  for (const ch of text.normalize('NFC')) place(ch, 0);
  return out;
}

export function measureText(text: string, bold: boolean, size: number, set: FontSet): number {
  let w = 0;
  for (const s of segmentText(text, bold, set)) w += s.face.width(s.text, size);
  return w;
}

/** Which optional font families a document needs (so only those are loaded). */
export function neededScripts(texts: Iterable<string>): { latinExt: boolean; greek: boolean; devanagari: boolean } {
  const need = { latinExt: false, greek: false, devanagari: false };
  for (const t of texts) {
    for (const ch of t) {
      const cp = ch.codePointAt(0)!;
      if ((cp >= 0x100 && cp <= 0x24f) || (cp >= 0x1e00 && cp <= 0x1eff) || (cp >= 0x2c60 && cp <= 0x2c7f)) need.latinExt = true;
      else if (cp >= 0x370 && cp <= 0x3ff) need.greek = true;
      else if (cp >= 0x900 && cp <= 0x97f) need.devanagari = true;
      if (need.latinExt && need.greek && need.devanagari) return need;
    }
  }
  return need;
}
