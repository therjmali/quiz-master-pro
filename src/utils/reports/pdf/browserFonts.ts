/** Bundled report fonts for the browser / Android WebView (shipped inside the app, so reports work offline). */
import type { FaceKey, FontSource } from './reportFonts';

const LOADERS: Record<FaceKey, () => Promise<{ default: string }>> = {
  'latin-400': () => import('../../../assets/report-fonts/inter-latin-400.ttf?url'),
  'latin-700': () => import('../../../assets/report-fonts/inter-latin-700.ttf?url'),
  'latin-ext-400': () => import('../../../assets/report-fonts/inter-latin-ext-400.ttf?url'),
  'latin-ext-700': () => import('../../../assets/report-fonts/inter-latin-ext-700.ttf?url'),
  'greek-400': () => import('../../../assets/report-fonts/inter-greek-400.ttf?url'),
  'greek-700': () => import('../../../assets/report-fonts/inter-greek-700.ttf?url'),
  'devanagari-400': () => import('../../../assets/report-fonts/noto-devanagari-400.ttf?url'),
  'devanagari-700': () => import('../../../assets/report-fonts/noto-devanagari-700.ttf?url'),
};

const cache = new Map<FaceKey, Promise<Uint8Array>>();

export const browserFontSource: FontSource = {
  load(key) {
    let p = cache.get(key);
    if (!p) {
      p = LOADERS[key]().then(async m => {
        const res = await fetch(m.default);
        if (!res.ok) throw new Error(`Could not load the report font (${res.status}).`);
        return new Uint8Array(await res.arrayBuffer());
      });
      p.catch(() => cache.delete(key));
      cache.set(key, p);
    }
    // each caller gets its own copy: pdf-lib may transfer / hold the buffer
    return p.then(b => b.slice());
  },
};
