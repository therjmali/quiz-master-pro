import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Optional: inject the Zite hosting runtime.
 *
 * Only used when the app is served by Zite itself (set ZITE_HOSTED=1 or VITE_APP_RUNTIME_URL).
 * The standalone GitHub Pages / PWA / Android build never loads a remote script, which is what
 * makes the bundle fully self-contained and offline-capable.
 */
export function ziteRuntime(): Plugin {
  const url =
    process.env.VITE_APP_RUNTIME_URL ||
    (process.env.ZITE_HOSTED === '1' ? 'https://zite.com/app-runtime.js' : '');
  return {
    name: 'quiz-master:zite-runtime',
    transformIndexHtml: () =>
      url ? [{ tag: 'script', attrs: { src: url }, injectTo: 'head-prepend' }] : [],
  };
}

function walk(dir: string, base = ''): string[] {
  return readdirSync(dir).flatMap(name => {
    const rel = base ? `${base}/${name}` : name;
    const abs = path.join(dir, name);
    return statSync(abs).isDirectory() ? walk(abs, rel) : [rel];
  });
}

/**
 * Offline layer.
 *
 * Emits the service worker (from build/sw.template.js) stamped with a precache manifest of every file
 * in the build - bundled output plus everything in public/ - and a content-derived build id, so any
 * change to the app produces a fresh cache. Also emits 404.html (a copy of index.html) so deep links
 * keep working on GitHub Pages.
 *
 * The files are emitted through the bundler (generateBundle) instead of being written to disk later,
 * which keeps the output deterministic regardless of when Vite copies public/ into dist/.
 */
export function offlinePrecache(): Plugin {
  let root = process.cwd();
  let publicDir = '';
  return {
    name: 'quiz-master:offline-precache',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir || '';
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const templatePath = path.resolve(root, 'build/sw.template.js');
        if (!existsSync(templatePath)) {
          throw new Error('[offline-precache] build/sw.template.js is missing');
        }
        let sw = readFileSync(templatePath, 'utf8');
        if (!sw.includes('__BUILD_ID__') || !sw.includes('__PRECACHE_MANIFEST__')) {
          throw new Error('[offline-precache] sw template placeholders are missing');
        }

        const hash = createHash('sha1');
        const files = new Set<string>();

        for (const [name, item] of Object.entries(bundle)) {
          if (name.endsWith('.map')) continue;
          files.add(name);
          hash.update(name);
          hash.update(item.type === 'chunk' ? item.code : item.source);
        }
        if (publicDir && existsSync(publicDir)) {
          for (const name of walk(publicDir).sort()) {
            files.add(name);
            hash.update(name);
            hash.update(readFileSync(path.join(publicDir, name)));
          }
        }

        const html = bundle['index.html'];
        if (!html || html.type !== 'asset') {
          throw new Error('[offline-precache] index.html was not emitted before the service worker');
        }

        const list = [...files].filter(f => f !== 'sw.js' && f !== '404.html').sort();
        const buildId = hash.digest('hex').slice(0, 12);
        const manifest = ['./', ...list.map(f => `./${f}`)];

        sw = sw
          .replaceAll('__BUILD_ID__', buildId)
          .replaceAll('__PRECACHE_MANIFEST__', JSON.stringify(manifest));

        this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
        this.emitFile({ type: 'asset', fileName: '404.html', source: html.source });
        console.log(`[offline-precache] ${manifest.length} entries precached, build ${buildId}`);
      },
    },
  };
}
