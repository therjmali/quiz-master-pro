#!/usr/bin/env node
/**
 * Repository integrity check. Zero dependencies.
 *
 *   node scripts/verify-repo.mjs           check the source tree (files, config, icons, workflows, secrets)
 *   node scripts/verify-repo.mjs --dist    additionally check the production build in dist/
 *
 * Exits with code 1 if any check fails, so it can gate CI.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkDist = process.argv.includes('--dist');

const results = [];
const pass = (name, detail = '') => results.push({ ok: true, name, detail });
const fail = (name, detail = '') => results.push({ ok: false, name, detail });
const check = (name, condition, detail = '') => (condition ? pass(name) : fail(name, detail));
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => existsSync(path.join(ROOT, rel));

function pngSize(rel) {
  const buf = readFileSync(path.join(ROOT, rel));
  const signature = buf.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function walk(dir, base = '') {
  return readdirSync(dir).flatMap(name => {
    const rel = base ? `${base}/${name}` : name;
    return statSync(path.join(dir, name)).isDirectory() ? walk(path.join(dir, name), rel) : [rel];
  });
}

let files = [];
const listFiles = () => {
  try { return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch { return walk(ROOT).filter(f => !/^(node_modules|dist|android|\.git)\//.test(f)); }
};
files = listFiles();

// ---------------------------------------------------------------- required files
const REQUIRED = [
  'README.md', 'CHANGELOG.md', 'package.json', 'package-lock.json', '.npmrc', '.gitignore', '.env.example',
  'index.html', 'vite.config.ts', 'tsconfig.json', 'capacitor.config.ts',
  'build/vite-plugins.ts', 'build/sw.template.js',
  'public/manifest.webmanifest', 'public/favicon.svg',
  'src/main.tsx', 'src/App.tsx',
  'scripts/android-prepare.sh', 'scripts/verify-apk.sh', 'scripts/emulator-smoke.sh',
  'scripts/offline-smoke.mjs', 'scripts/generate-icons.py',
  '.github/workflows/ci.yml', '.github/workflows/pages.yml', '.github/workflows/android.yml',
  'supabase/quiz_schema.sql', 'supabase/tests/bootstrap.sql', 'supabase/tests/quiz_schema.test.sql', 'scripts/test-sql.sh',
  'docs/CLOUD_SETUP.md', 'scripts/check-cloud.mjs', '.github/workflows/cloud-check.yml', 'tests/checkCloud.test.ts',
  'src/platform/runtime.ts', 'src/platform/autoBackup.ts', 'src/platform/appIcon.ts', 'src/platform/cloud/syncEngine.ts',
  'src/platform/cloud/sections.ts', 'src/platform/cloud/authStore.ts', 'src/platform/notify/planner.ts', 'src/platform/notify/notifier.ts',
  'src/platform/ai/providers.ts', 'src/platform/ai/caller.ts', 'src/utils/historyTrash.ts',
  'android-res/java/MainActivity.java', 'android-res/java/QmNativePlugin.java', 'android-res/java/ApkUpdater.java', 'android-res/java/ReportSaver.java',
  'src/utils/reports/pdf/layout.ts', 'src/utils/reports/pdf/fontSet.ts', 'src/utils/reports/pdf/pdfWriter.ts', 'src/platform/reportFiles.ts', 'scripts/ui-qa-reports.mjs', 'tests/reportEngine.test.ts', 'src/utils/drafts.ts', 'src/components/dashboard/DraftsRail.tsx', 'tests/drafts.test.ts', 'scripts/ui-qa-v29.mjs',
  ...['inter-latin-400', 'inter-latin-700', 'inter-latin-ext-400', 'inter-latin-ext-700', 'inter-greek-400', 'inter-greek-700', 'noto-devanagari-400', 'noto-devanagari-700'].map(f => `src/assets/report-fonts/${f}.ttf`),
  'src/platform/updater.ts', 'src/components/update/UpdatePanel.tsx', 'src/components/settings/SettingsScreen.tsx', 'src/components/profile/ProgressScreen.tsx', 'tests/updaterState.test.ts',
  'tests/syncEngine.test.ts', 'tests/backup.test.ts', 'tests/notify.test.ts', 'tests/ai.test.ts', 'tests/platform.test.ts', 'tests/merge3.test.ts',
];
for (const f of REQUIRED) check(`file exists: ${f}`, exists(f), 'missing');

// ---------------------------------------------------------------- package.json
let pkg = {};
try {
  pkg = JSON.parse(read('package.json'));
  pass('package.json is valid JSON');
} catch (e) {
  fail('package.json is valid JSON', String(e));
}
check('package version is semver', /^\d+\.\d+\.\d+$/.test(pkg.version ?? ''), `got "${pkg.version}"`);
for (const s of ['dev', 'build', 'typecheck', 'verify:repo', 'verify:dist', 'test:offline', 'test:unit', 'test:sql', 'android:prepare']) {
  check(`npm script: ${s}`, Boolean(pkg.scripts?.[s]), 'missing');
}
check('CHANGELOG mentions current version', exists('CHANGELOG.md') && read('CHANGELOG.md').includes(`[${pkg.version}]`), `no [${pkg.version}] heading`);

// ---------------------------------------------------------------- PWA manifest + icons
try {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  pass('manifest is valid JSON');
  check('manifest has name, short_name, start_url, display', ['name', 'short_name', 'start_url', 'display'].every(k => manifest[k]));
  check('manifest display is standalone', manifest.display === 'standalone');
  check('manifest start_url/scope are relative (work under any base path)', manifest.start_url === './' && manifest.scope === './');
  const icons = manifest.icons ?? [];
  check('manifest has a 192px and a 512px icon', icons.some(i => i.sizes === '192x192') && icons.some(i => i.sizes === '512x512'));
  check('manifest has a maskable icon', icons.some(i => (i.purpose ?? '').includes('maskable')));
  for (const icon of icons) {
    const rel = `public/${icon.src}`;
    const size = exists(rel) ? pngSize(rel) : null;
    const [w, h] = icon.sizes.split('x').map(Number);
    check(`icon ${icon.src} is a PNG of ${icon.sizes}`, size && size.w === w && size.h === h, size ? `actual ${size.w}x${size.h}` : 'missing or not PNG');
  }
} catch (e) {
  fail('manifest is valid JSON', String(e));
}
for (const f of ['public/icons/apple-touch-icon.png', 'public/icons/favicon-32.png']) {
  check(`file exists: ${f}`, exists(f), 'missing');
}

// ---------------------------------------------------------------- Android resources
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, scale] of Object.entries(DENSITIES)) {
  for (const [file, dp] of [['ic_launcher.png', 48], ['ic_launcher_round.png', 48], ['ic_launcher_foreground.png', 108]]) {
    const rel = `android-res/mipmap-${name}/${file}`;
    const want = Math.round(dp * scale);
    const size = exists(rel) ? pngSize(rel) : null;
    check(`android icon ${name}/${file} is ${want}px`, size && size.w === want && size.h === want, size ? `actual ${size.w}x${size.h}` : 'missing');
  }
}
check('android adaptive-icon background colour defined', exists('android-res/values/ic_launcher_background.xml') && read('android-res/values/ic_launcher_background.xml').includes('ic_launcher_background'));

// ---------------------------------------------------------------- Capacitor
if (exists('capacitor.config.ts')) {
  const cap = read('capacitor.config.ts');
  const appId = /appId:\s*'([^']+)'/.exec(cap)?.[1] ?? '';
  check('capacitor appId is a valid reverse-domain id', /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(appId), `got "${appId}"`);
  check("capacitor webDir is 'dist'", /webDir:\s*'dist'/.test(cap));
  check('capacitor uses the https androidScheme', /androidScheme:\s*'https'/.test(cap));
}

// ---------------------------------------------------------------- index.html (source)
if (exists('index.html')) {
  const html = read('index.html');
  check('index.html has no remote script/stylesheet', !/<(script|link)[^>]+(src|href)="https?:\/\//.test(html), 'remote resource found');
  check('index.html links the web manifest', html.includes('manifest.webmanifest'));
  check('index.html declares theme-color', html.includes('name="theme-color"'));
  check('index.html has a real <title>', /<title>(?!Zite App)[^<]+<\/title>/.test(html));
}

// ---------------------------------------------------------------- service worker template
if (exists('build/sw.template.js')) {
  const sw = read('build/sw.template.js');
  check('sw template has exactly one build-id stamp', sw.split('__BUILD_ID__').length - 1 === 1);
  check('sw template has exactly one precache stamp', sw.split('__PRECACHE_MANIFEST__').length - 1 === 1);
}
check('public/ has no un-stamped sw.js (would be shipped as-is)', !exists('public/sw.js'));

// ---------------------------------------------------------------- workflows
for (const wf of ['ci.yml', 'pages.yml', 'android.yml']) {
  const rel = `.github/workflows/${wf}`;
  if (!exists(rel)) continue;
  const text = read(rel);
  check(`${wf}: has name, on, jobs`, /^name:/m.test(text) && /^on:/m.test(text) && /^jobs:/m.test(text));
  check(`${wf}: no tab characters`, !text.includes('\t'));
}
if (exists('.github/workflows/android.yml')) {
  const text = read('.github/workflows/android.yml');
  check('android.yml runs the APK verifier', text.includes('scripts/verify-apk.sh'));
  check('android.yml runs the emulator smoke test', text.includes('scripts/emulator-smoke.sh'));
}

// ---------------------------------------------------------------- cloud + security contracts
if (exists('supabase/quiz_schema.sql')) {
  const sql = read('supabase/quiz_schema.sql');
  for (const fn of ['quiz_sync_pull', 'quiz_sync_push', 'quiz_sync_restore', 'quiz_sync_wipe', 'quiz_delete_my_data', 'quiz_delete_my_account']) {
    check(`schema defines ${fn}`, sql.includes(`function public.${fn}`));
  }
  check('schema enables row-level security on every quiz table', ['quiz_sync_docs', 'quiz_sync_sections', 'quiz_sync_revisions', 'quiz_devices'].every(t => new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql)));
  check('schema never touches other apps tables (no un-prefixed sync_/profiles objects)', !/public\.(sync_|profiles\b|devices\b)/.test(sql));
  check('anonymous role is locked out of the sync functions', sql.includes('from public, anon'));
}
{
  const sectionsSrc = exists('src/platform/cloud/sections.ts') ? read('src/platform/cloud/sections.ts') : '';
  check('API keys are not in the sync set', !/'qmp_(user_)?api_keys'\s*,\s*label/.test(sectionsSrc));
  const appSources = files.filter(f => /^(src|\.env\.example|scripts|supabase|\.github)\//.test(f) || f === '.env.example');
  const leakedServiceRole = appSources.filter(f => exists(f) && !/\.(png|woff2?)$/.test(f) && /service_role\s*[:=]\s*['"][A-Za-z0-9._-]{20,}/.test(read(f)));
  check('no service_role key is ever committed', leakedServiceRole.length === 0, leakedServiceRole.join(', '));
}
if (exists('.github/workflows/ci.yml')) {
  const ci = read('.github/workflows/ci.yml');
  check('ci.yml runs the unit tests', ci.includes('npm run test:unit'));
  check('ci.yml runs the database tests', ci.includes('scripts/test-sql.sh'));
}

// ---------------------------------------------------------------- in-app updates + settings hub contracts
{
  const act = read('android-res/java/MainActivity.java');
  const upd = read('android-res/java/ApkUpdater.java');
  const prep = read('scripts/android-prepare.sh');
  for (const m of ['downloadUpdate', 'installUpdate', 'canInstallPackages', 'openInstallPermission']) {
    check(`MainActivity exposes ${m} to the web layer`, act.includes(`public ${m === 'canInstallPackages' ? 'boolean' : 'void'} ${m}(`), 'missing');
  }
  check('updater only downloads from this repo\'s GitHub releases', upd.includes('https://github.com/therjmali/quiz-master-pro/releases/download/'), 'ALLOWED_PREFIX changed');
  check('updater verifies package name, version and signing key', /getPackageName\(\)/.test(upd) && /versionCodeOf/.test(upd) && /signersOf/.test(upd), 'verification missing');
  check('android-prepare adds REQUEST_INSTALL_PACKAGES and checks the FileProvider', prep.includes('REQUEST_INSTALL_PACKAGES') && prep.includes('.fileprovider') && prep.includes('cache-path'), 'missing');
  const ui = files.filter(f => /^src\/.*\.(ts|tsx)$/.test(f)).map(f => ({ f, t: read(f) }));
  const stale = ui.filter(x => /Export, Deploy|Deploy & Install|webintoapp\.com|appsgeyser\.com/i.test(x.t)).map(x => x.f);
  check('Export / Deploy & Install screens are gone', stale.length === 0, stale.join(', '));
  for (const m of ['saveReport', 'openReport', 'shareReport', 'reportExists', 'deleteReport']) {
    check(`MainActivity exposes ${m} for offline report downloads`, act.includes(` ${m}(`), 'missing');
  }
  check('reports are saved to Downloads/R.J QUIZ through MediaStore', read('android-res/java/ReportSaver.java').includes('MediaStore.Downloads.EXTERNAL_CONTENT_URI'), 'ReportSaver changed');
  const exp = read('src/utils/reports/htmlReportBuilder.ts');
  check('PDF export no longer uses a print window or the server', !/window\.open\(/.test(exp), 'old print-window export is back');
  const serverPdf = ui.filter(x => /(import[^;]*\b(revisionSheetPdf|generateReportPdf)\b|\b(revisionSheetPdf|generateReportPdf)\()/.test(x.t) && !/EmailReportButton|^src\/api\//.test(x.f)).map(x => x.f);
  check('no screen depends on the PDF server any more', serverPdf.length === 0, serverPdf.join(', '));
  check('Settings has the Reports & downloads section', read('src/components/profile/settings/settingsSearch.ts').includes("reports:"), 'missing');
  check('status card is in Settings, not on the Progress screen', read('src/components/settings/SettingsScreen.tsx').includes('<StatusStrip') && !read('src/components/profile/ProgressScreen.tsx').includes('<StatusStrip'), 'moved back');
  check('dialogs sit above full-screen panels (Sync Center)', !/\bz-50\b/.test(read('packages/components/ui/dialog.tsx')) && !/\bz-50\b/.test(read('packages/components/ui/alert-dialog.tsx')), 'z-50 dialogs would hide behind the Sync Center');
  // ── accounts must work in the build we actually ship (no Supabase project in the APK) ──
  const authStore = read('src/platform/cloud/authStore.ts');
  check('the account store has an on-device path, not only Supabase',
    authStore.includes("from '../account/localAccount'") && authStore.includes('signInOnDevice') && authStore.includes('signUpOnDevice'),
    'sign-in would be dead again in a build without SUPABASE_URL');
  check('signing in never leaves the user without a reason',
    authStore.includes('function friendlyAuthError') && authStore.includes("code === 'not_configured'"),
    'a missing cloud must produce a human message');
  const localAccount = read('src/platform/account/localAccount.ts');
  check('device passwords are hashed with PBKDF2, never stored in clear text',
    localAccount.includes("name: 'PBKDF2'") && localAccount.includes('deriveBits') && localAccount.includes('randomSalt'),
    'password storage is not hashed');
  check('device passwords use a slow iteration count', /PBKDF2_ITERATIONS = 2\d{2}_\d{3}\b/.test(localAccount), 'iteration count too low');
  const signInWindow = read('src/components/cloud/SignInWindow.tsx');
  check('the sign-in window always renders the form (no dead panel)',
    !signInWindow.includes('Cloud sign-in is not configured') && signInWindow.includes('handleSubmit') && signInWindow.includes('showPassword'),
    'the form is hidden again when cloud is unconfigured');
  check('the password field has a reveal control', signInWindow.includes("aria-label={showPassword ? 'Hide password' : 'Show password'}"), 'no reveal button');
  // A stale "wrong password" under a corrected entry is the classic reason people give up.
  check('typing in the form clears the last failure',
    signInWindow.includes('const edited = () =>') && (signInWindow.match(/edited\(\);/g) || []).length >= 3 && signInWindow.includes('clearAuthMessages()'),
    'an old error can outlive the entry that caused it');
  check('the sign-in button is only disabled while busy or without WebCrypto', signInWindow.includes('disabled={auth.busy || !deviceSupported}'), 'the form can be permanently dead again');
  const cloudSection = read('src/components/profile/settings/sectionsCloud.tsx');
  check('Settings shows the account form even without a cloud project', !/isCloudConfigured\(\) \? <CloudBody \/> : <NotConfigured \/>/.test(cloudSection), 'the form is replaced by a warning again');
  // ── performance budget + crash evidence ──
  check('one adaptive performance budget replaces blanket glass', exists('src/platform/perfMode.ts') && read('src/index.css').includes('.qmp-perf-low'), 'perf mode missing');
  check('the performance budget is applied before the first paint', read('src/main.tsx').includes('applyPerfMode()'), 'perf mode is not applied at boot');
  check('crash/lag evidence is recorded on the device', read('src/main.tsx').includes('installDiagnostics()') && exists('src/platform/diagnostics.ts'), 'diagnostics not installed');
  const heroClock = read('src/components/dashboard/HeroClock.tsx');
  check('the analog clock no longer runs a requestAnimationFrame loop', !/\brequestAnimationFrame\(/.test(heroClock), 'the 30 fps clock loop is back');
  check('the analog clock stops when off screen', heroClock.includes('IntersectionObserver'), 'clock keeps ticking off screen');
  // One timer for the whole app instead of one per live widget (each was a 1 s wake-up, forever).
  const clockUsers = ['src/components/dashboard/LiveExamCountdown.tsx', 'src/components/dashboard/LiveClockWidget.tsx', 'src/components/stats/AnalyticsTrends.tsx'];
  const ownTimers = clockUsers.filter(f => /setInterval\(/.test(read(f)));
  check('live widgets share the single app clock', ownTimers.length === 0 && clockUsers.every(f => read(f).includes('useClock')), ownTimers.join(', ') || 'a widget runs its own 1 s timer');
  check('the shared clock sleeps while the app is hidden', read('src/hooks/useClock.ts').includes('stopClock();') && read('src/hooks/useClock.ts').includes("visibilityState !== 'hidden'"), 'the clock keeps ticking in the background');

  const sec = read('src/platform/cloud/sections.ts');
  check('drafts sync between devices', sec.includes("key: 'qmp_drafts_v1'"), 'drafts are device-only again');
  check('full quiz details sync (qd: shards) so other devices and backups can open every quiz', sec.includes('buildDetailShards') && sec.includes('DETAIL_PREFIX'), 'details are not synced');
  check('leaving a quiz saves a draft (max 5, no duplicates)', read('src/hooks/useQuizSession.ts').includes('saveDraftNow(true)') && read('src/utils/drafts.ts').includes('MAX_DRAFTS = 5'), 'exit no longer saves');
  const card = read('src/components/results/ReviewCard.tsx');
  check('question card: one-line emoji header + single-line action bar', card.includes('review-card-header') && card.includes('review-card-actions') && card.includes('grid grid-cols-4'), 'card layout changed');
  const nav = read('src/components/BottomNav.tsx');
  const bottom = nav.includes("label: 'Progress'") && !nav.includes("label: 'Profile'");
  check('bottom tab is "Progress" (not Profile)', bottom, 'bottom nav label');
  check('Navbar profile photo opens Settings', read('src/components/Navbar.tsx').includes('onOpenSettings'), 'missing');
  const gFontsInSrc = ui.filter(x => /fonts\.(googleapis|gstatic)\.com/.test(x.t)).map(x => x.f);
  check('no Google Fonts requests in src/', gFontsInSrc.length === 0, gFontsInSrc.join(', '));
  const compPrint = ui.filter(x => /^src\/components\//.test(x.f) && /\bwindow\.print\s*\(/.test(x.t)).map(x => x.f);
  check('no window.print() in React components (use exportSmartReport)', compPrint.length === 0, compPrint.join(', '));
  // ── one overlay architecture ──
  const overlayUsers = ui.filter(x => /\bOverlay\b|MobilePopover/.test(x.t)).length;
  check('overlays go through the shared Overlay/ portal component', overlayUsers >= 20, `only ${overlayUsers} files use it`);
  const adHoc = ui.filter(x => /\bz-\[(?!\s*(var\(--qmp-z|calc\(var\(--qmp-z))/.test(x.t)).map(x => x.f);
  check('no ad-hoc z-index values in app code (one named scale, --qmp-z-*)', adHoc.length === 0, adHoc.join(', '));
  check('overlay layers are defined once, in index.css', /--qmp-z-nav:\s*100/.test(read('src/index.css')) && /--qmp-z-toast:\s*900/.test(read('src/index.css')), 'z scale missing');
  check('overlay layers stay in the documented order (nav < sheet < menu < panel < dialog < blocking < toast)',
    ['nav: 100', 'sheet: 400', 'menu: 450', 'panel: 500', 'dialog: 600', 'blocking: 800', 'toast: 900'].every(v => {
      const [k, n] = v.split(': ');
      return new RegExp(`--qmp-z-${k}:\\s*${n}`).test(read('src/index.css'));
    }), 'layer order changed');
  const strayPrint = ui.filter(x => /document\.body\.style\.overflow/.test(x.t) && !/overlayStack\.ts$/.test(x.f)).map(x => x.f);
  check('scroll locking is refcounted in overlayStack only', strayPrint.length === 0, strayPrint.join(', '));
  check('hardware back is handled by one chain', read('src/platform/backButton.ts').includes('export function handleBack') && read('src/main.tsx').includes('initBackButton'), 'back chain missing');
  check('the master report template exists and is dispatched', read('src/utils/reports/pdf/generate.ts').includes('layoutMasterReport') && read('src/utils/reports/pdf/types.ts').includes("template: 'master'"), 'master template not wired');
  check('MainActivity captures widget deep-link intents', act.includes('captureWidgetIntent') && act.includes('consumePendingWidgetAction'), 'missing widget intent bridge');
}

// ---------------------------------------------------------------- .gitignore hygiene
if (exists('.gitignore')) {
  const gi = read('.gitignore');
  for (const entry of ['node_modules', 'dist', 'android/', '*.keystore', '.env']) {
    check(`.gitignore covers ${entry}`, gi.split('\n').some(l => l.trim() === entry || l.trim() === `${entry}/` || l.trim().startsWith(entry)));
  }
}

// ---------------------------------------------------------------- secret scan
const SECRET_PATTERNS = [
  ['GitHub token', /\b(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,})\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Anthropic/OpenAI key', /\b(sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,})\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['Private key block', /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
];
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|zip|pdf|keystore|jks)$/i;
const leaks = [];
for (const f of files) {
  if (f === 'package-lock.json' || SKIP_EXT.test(f) || !exists(f)) continue;
  let text;
  try { text = read(f); } catch { continue; }
  for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) leaks.push(`${f} (${label})`);
}
check(`no secrets in ${files.length} scanned files`, leaks.length === 0, leaks.join(', '));

// ---------------------------------------------------------------- production build (dist/)
if (checkDist) {
  const DIST = path.join(ROOT, 'dist');
  const d = rel => path.join(DIST, rel);
  if (!existsSync(DIST)) {
    fail('dist/ exists (run `npm run build` first)');
  } else {
    const all = walk(DIST);
    for (const f of ['index.html', '404.html', 'sw.js', 'manifest.webmanifest', 'favicon.svg']) check(`dist/${f} exists`, existsSync(d(f)));

    const html = readFileSync(d('index.html'), 'utf8');
    check('dist/index.html has no remote script/stylesheet', !/<(script|link)[^>]+(src|href)="https?:\/\//.test(html), 'remote resource found');
    check('dist/index.html does not load the Zite runtime', !html.includes('app-runtime.js'));
    check('dist/404.html matches index.html (SPA fallback)', existsSync(d('404.html')) && readFileSync(d('404.html'), 'utf8') === html);

    // Everything index.html references must be a real file in dist/ (base-path aware).
    const base = (/href="([^"]*)manifest\.webmanifest"/.exec(html)?.[1]) ?? '/';
    const refs = [...html.matchAll(/(?:src|href)="([^"#?]+)"/g)].map(m => m[1]).filter(u => u.startsWith(base));
    const missing = refs.map(u => u.slice(base.length)).filter(rel => rel && !all.includes(rel));
    check(`all ${refs.length} local references in index.html resolve to files`, missing.length === 0, missing.join(', '));

    // Service worker: stamped, syntactically valid, and the precache list is exactly the build.
    const sw = existsSync(d('sw.js')) ? readFileSync(d('sw.js'), 'utf8') : '';
    check('sw.js placeholders are stamped', sw !== '' && !sw.includes('__BUILD_ID__') && !sw.includes('__PRECACHE_MANIFEST__'));
    const listText = /const PRECACHE = (\[.*\]);/.exec(sw)?.[1];
    let precache = [];
    try { precache = JSON.parse(listText ?? '[]'); pass('sw.js precache manifest parses'); } catch (e) { fail('sw.js precache manifest parses', String(e)); }
    const expected = new Set(all.filter(f => f !== 'sw.js' && f !== '404.html' && !f.endsWith('.map')).map(f => `./${f}`));
    expected.add('./');
    const listed = new Set(precache);
    const notCached = [...expected].filter(f => !listed.has(f));
    const phantom = [...listed].filter(f => !expected.has(f));
    check(`precache covers all ${expected.size} build files`, notCached.length === 0, `not precached: ${notCached.slice(0, 5).join(', ')}`);
    check('precache lists no files that do not exist', phantom.length === 0, `phantom: ${phantom.slice(0, 5).join(', ')}`);
    check('precache includes the app shell and manifest', listed.has('./index.html') && listed.has('./manifest.webmanifest'));
    check('precache includes bundled fonts (offline typography)', precache.some(f => f.endsWith('.woff2')));
    check('precache includes JS and CSS', precache.some(f => f.endsWith('.js')) && precache.some(f => f.endsWith('.css')));

    // Fonts must not come from Google any more.
    const css = all.filter(f => f.endsWith('.css')).map(f => readFileSync(d(f), 'utf8')).join('\n');
    check('no Google Fonts requests in CSS', !/fonts\.(googleapis|gstatic)\.com/.test(css));

    const bytes = all.reduce((n, f) => n + statSync(d(f)).size, 0);
    pass(`dist size ${(bytes / 1024 / 1024).toFixed(1)} MiB across ${all.length} files`);
  }
}

// ---------------------------------------------------------------- report
const width = Math.max(...results.map(r => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok || !r.detail ? '' : `  -> ${r.detail}`}`);
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${checkDist ? ' (source + dist)' : ''}`);
if (failed.length) {
  console.error(`${failed.length} check(s) failed`);
  process.exit(1);
}
