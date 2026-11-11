import fs from 'node:fs';
import path from 'node:path';
import type { FontSource, FaceKey } from '../../src/utils/reports/pdf/reportFonts';

const FILES: Record<FaceKey, string> = {
  'latin-400': 'inter-latin-400', 'latin-700': 'inter-latin-700', 'latin-ext-400': 'inter-latin-ext-400', 'latin-ext-700': 'inter-latin-ext-700',
  'greek-400': 'inter-greek-400', 'greek-700': 'inter-greek-700', 'devanagari-400': 'noto-devanagari-400', 'devanagari-700': 'noto-devanagari-700',
};
export const nodeFontSource: FontSource = {
  async load(key) { return new Uint8Array(fs.readFileSync(path.resolve('src/assets/report-fonts', FILES[key] + '.ttf'))); },
};
