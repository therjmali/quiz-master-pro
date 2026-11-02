import { useState, useEffect } from 'react';
import {
  Download, Code2, Smartphone, Check, Loader2,
  ChevronDown, ChevronRight, Terminal, Package,
  FileCode, Layers, Cpu, Wifi, Shield, Star,
  ExternalLink, Copy, Globe, CheckCircle, Zap,
  AlertCircle, ArrowRight, Paintbrush
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadSourceCode, SOURCE_FILE_COUNT } from '../../utils/sourceDownload';
import { downloadAndroidTemplate } from '../../utils/androidTemplate';
import { downloadAppDocHTML, downloadAppDocPDF, generateAppDocHTML } from '../../utils/appDocGenerator';
import MobileInstallGuide from '../MobileInstallGuide';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function usePwaInstall() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPwa, setIsPwa] = useState(false);

  useEffect(() => {
    const standaloneQ = window.matchMedia('(display-mode: standalone)');
    const update = () => {
      const iosSA = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsPwa(standaloneQ.matches || iosSA);
    };
    update();
    standaloneQ.addEventListener('change', update);
    const handler = (e: Event) => { e.preventDefault(); setInstallEvent(e as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => {
      standaloneQ.removeEventListener('change', update);
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return false;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setInstallEvent(null);
    return choice.outcome === 'accepted';
  };

  return { installEvent, isPwa, install };
}

export default function DownloadsTab() {
  const [srcLoading,  setSrcLoading]  = useState(false);
  const [apkLoading,  setApkLoading]  = useState(false);
  const [srcDone,     setSrcDone]     = useState(false);
  const [apkDone,     setApkDone]     = useState(false);
  const [showSteps,   setShowSteps]   = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [launching,   setLaunching]   = useState(false);
  const [installing,  setInstalling]  = useState(false);
  const [installed,   setInstalled]   = useState(false);
  const [urlCopied,   setUrlCopied]   = useState(false);
  const { installEvent, isPwa, install } = usePwaInstall();

  const appUrl = window.location.origin;

  const handleSrc = async () => {
    setSrcLoading(true);
    try {
      await downloadSourceCode();
      setSrcDone(true);
      toast.success('Source code packaged! Check your Downloads folder 📦');
      setTimeout(() => setSrcDone(false), 5000);
    } catch {
      toast.error('Download failed — please try again.');
    } finally { setSrcLoading(false); }
  };

  const handleApk = async () => {
    setApkLoading(true);
    try {
      await downloadAndroidTemplate();
      setApkDone(true);
      toast.success('Android project ready! Open in Android Studio 📱');
      setTimeout(() => setApkDone(false), 5000);
    } catch {
      toast.error('Download failed — please try again.');
    } finally { setApkLoading(false); }
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(appUrl).catch(() => {});
    setUrlCopied(true);
    toast.success('App URL copied!');
    setTimeout(() => setUrlCopied(false), 2500);
  };

  const launchBuilder = async (service: 'webintoapp' | 'appsgeyser') => {
    setLaunching(true);
    await navigator.clipboard.writeText(appUrl).catch(() => {});
    toast.success('URL copied! Paste it on the next page ✓');
    setTimeout(() => {
      window.open(service === 'webintoapp' ? 'https://webintoapp.com' : 'https://appsgeyser.com/create/website', '_blank', 'noopener');
      setLaunching(false);
    }, 500);
  };

  const handlePwaInstall = async () => {
    setInstalling(true);
    const ok = await install();
    setInstalling(false);
    if (ok) { setInstalled(true); toast.success('Installed! Check your home screen 🎉'); }
  };

  return (
    <div className="space-y-4">

      {/* ── Hero ── */}
      <div className="glass-card p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/5 to-transparent pointer-events-none" />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/30 to-purple-600/20 flex items-center justify-center border border-primary/20 flex-shrink-0">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-black text-foreground">Export, Deploy & Install</h3>
            <p className="text-xs text-foreground/50 leading-tight">Download source code, build an Android APK, or install as a mobile app</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {['✦ No Zite branding', '✦ Fully standalone', '✦ Production ready', '✦ White-labeled'].map(t => (
            <span key={t} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary/70 border border-primary/15">{t}</span>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          📱  SECTION 1 — INSTALL ON YOUR PHONE
      ══════════════════════════════════════════════════ */}
      <div className="glass-card overflow-hidden border-border">
        <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-green-500 to-teal-400" />

        <div className="p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/15 flex items-center justify-center border border-emerald-400/20 flex-shrink-0">
              <Smartphone className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-base font-black text-foreground">Install on Android</h3>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 uppercase tracking-wide">3 Ways</span>
              </div>
              <p className="text-xs text-foreground/50">Get Quiz Master Pro on your Android phone — choose the easiest method for you</p>
            </div>
          </div>

          {/* Already installed */}
          {isPwa && (
            <div className="flex items-center gap-3 p-3.5 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-300">Already installed as an app! 🎉</p>
                <p className="text-xs text-foreground/40 mt-0.5">Quiz Master Pro is running in standalone app mode.</p>
              </div>
            </div>
          )}

          {/* Method 1: Add to Home Screen */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden mb-3">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.05]">
              <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-black text-primary flex-shrink-0">1</div>
              <span className="text-sm font-bold text-foreground">Add to Home Screen</span>
              <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">⭐ EASIEST · 30 sec</span>
            </div>
            <div className="p-4">
              {/* One-tap install if browser supports it */}
              {installEvent && !installed && !isPwa ? (
                <button
                  onClick={handlePwaInstall}
                  disabled={installing}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-sm flex items-center justify-center gap-2.5 active:scale-95 transition-all disabled:opacity-70 shadow-lg shadow-emerald-500/25 mb-3"
                >
                  {installing
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Installing…</>
                    : <><Zap className="w-4 h-4" /> One-Tap Install (Chrome detected!) ⚡</>
                  }
                </button>
              ) : installed ? (
                <div className="flex items-center gap-2 py-3 px-4 mb-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300">Installed! Check your home screen 🎉</span>
                </div>
              ) : null}

              <p className="text-xs text-foreground/55 mb-3">Open your app in Chrome → tap the ⋮ menu → "Add to Home Screen" → tap "Add". Done! Full-screen, no browser bar.</p>
              <div className="flex items-center gap-2 bg-foreground/5 border border-border rounded-xl px-3 py-2">
                <Globe className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
                <span className="text-[11px] text-foreground/50 font-mono flex-1 truncate">{appUrl}</span>
                <button
                  onClick={copyUrl}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-90 flex-shrink-0 border ${
                    urlCopied
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-primary/15 text-primary border-primary/25 hover:bg-primary/25'
                  }`}
                >
                  {urlCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {urlCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          {/* Method 2: Online APK generator */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden mb-3">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.05]">
              <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-black text-primary flex-shrink-0">2</div>
              <span className="text-sm font-bold text-foreground">Generate APK Online</span>
              <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">🔥 NO PC NEEDED</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-foreground/55">Free services wrap your app URL into a real .apk file. Tap the button below — your URL is auto-copied. Just paste it on the site and download!</p>

              {/* WebIntoApp */}
              <button
                onClick={() => launchBuilder('webintoapp')}
                disabled={launching}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-black text-sm flex items-center justify-center gap-2.5 active:scale-95 transition-all disabled:opacity-70 shadow-lg shadow-green-900/30"
              >
                {launching
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Copying URL & Opening…</>
                  : <><Star className="w-4 h-4" /> Open WebIntoApp.com (Recommended)</>
                }
              </button>

              <button
                onClick={() => launchBuilder('appsgeyser')}
                disabled={launching}
                className="w-full py-3 rounded-xl bg-foreground/5 border border-border text-foreground/60 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-foreground/8"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Backup: AppsGeyser.com
              </button>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
                <Shield className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-foreground/50 leading-relaxed">
                  After downloading the APK: <strong className="text-foreground/70">Settings → Security → Install Unknown Apps</strong> → allow → tap the APK file to install.
                </p>
              </div>
            </div>
          </div>

          {/* Method 3: Full guide */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden mb-4">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.05]">
              <div className="w-6 h-6 rounded-full bg-foreground/10 border border-border flex items-center justify-center text-[10px] font-black text-foreground/40 flex-shrink-0">3</div>
              <span className="text-sm font-bold text-foreground/70">Full Install Guide</span>
              <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-white/5 text-foreground/40 border border-border">All Methods</span>
            </div>
            <div className="p-4">
              <p className="text-xs text-foreground/50 mb-3">See all installation methods, branding tips, and step-by-step guides in one place.</p>
              <button
                onClick={() => setShowInstall(true)}
                className="w-full py-3 rounded-xl bg-primary/10 border border-primary/25 text-primary font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-primary/15"
              >
                <Smartphone className="w-4 h-4" /> Open Full Install Guide
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Fix branding tip */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-violet-500/8 border border-violet-500/15">
            <Paintbrush className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-foreground/70">Remove Zite branding from home screen icon</p>
              <p className="text-[11px] text-foreground/40 mt-1 leading-relaxed">
                Go to ⚙️ <strong className="text-foreground/60">Settings → Branding</strong> in the Zite editor → set Title to "Quiz Master Pro" and upload a custom icon. Your home screen will show your own branding!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          💻  SECTION 2 — SOURCE CODE
      ══════════════════════════════════════════════════ */}
      <div className="glass-card overflow-hidden border-border">
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />

        <div className="p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-accent/15 flex items-center justify-center border border-blue-400/20 flex-shrink-0">
              <Code2 className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-black text-foreground">Source Code</h3>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 uppercase tracking-wide">.zip</span>
              </div>
              <p className="text-xs text-foreground/50">Complete React/TypeScript project — runs standalone without Zite</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { icon: FileCode,  label: 'Source Files', value: `${SOURCE_FILE_COUNT}+` },
              { icon: Package,   label: 'Format',       value: 'ZIP Archive'           },
              { icon: Layers,    label: 'Framework',    value: 'Vite + React'          },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-foreground/5 rounded-xl p-2.5 text-center border border-border">
                <Icon className="w-3.5 h-3.5 text-foreground/30 mx-auto mb-1" />
                <div className="text-xs font-black text-foreground leading-none">{value}</div>
                <div className="text-[9px] text-foreground/30 uppercase tracking-widest mt-1">{label}</div>
              </div>
            ))}
          </div>

          <div className="space-y-2 mb-5">
            {[
              { ok: true,  text: 'All React components, hooks, types & utilities' },
              { ok: true,  text: 'Mock auth SDK (localStorage-based, no login required)' },
              { ok: true,  text: 'Mock endpoints (replaces Zite cloud with localStorage)' },
              { ok: true,  text: 'Standalone vite.config.ts + tailwind.config.ts + package.json' },
              { ok: true,  text: 'Step-by-step README with AI API key setup instructions' },
              { ok: false, text: 'AI quiz generation requires adding your own API keys (.env.example included)' },
            ].map(({ ok, text }) => (
              <div key={text} className="flex items-start gap-2 text-xs text-foreground/60 leading-relaxed">
                <span className={`text-[12px] mt-0.5 flex-shrink-0 ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {ok ? '✅' : '⚠️'}
                </span>
                <span>{text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleSrc}
            disabled={srcLoading}
            className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-80 ${
              srcDone
                ? 'bg-emerald-500/15 border-2 border-emerald-500/30 text-emerald-400'
                : 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:brightness-110'
            }`}
          >
            {srcLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Packaging {SOURCE_FILE_COUNT}+ files…</>
              : srcDone
                ? <><Check className="w-4 h-4" /> Downloaded Successfully!</>
                : <><Download className="w-4 h-4" /> Download Source Code</>
            }
          </button>
          <p className="text-[10px] text-foreground/30 text-center mt-2">
            Run with <code className="bg-foreground/10 px-1 rounded">npm install && npm run dev</code>
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          🤖  SECTION 3 — ANDROID STUDIO PROJECT
      ══════════════════════════════════════════════════ */}
      <div className="glass-card overflow-hidden border-border">
        <div className="h-1.5 bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500" />

        <div className="p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/15 flex items-center justify-center border border-violet-400/20 flex-shrink-0">
              <Terminal className="w-6 h-6 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-black text-foreground">Android Studio Project</h3>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 uppercase tracking-wide">Kotlin</span>
              </div>
              <p className="text-xs text-foreground/50">Full native project — build a proper .apk with Android Studio</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { icon: Cpu,    label: 'Min Android', value: '7.0 (API 24)' },
              { icon: Shield, label: 'Language',    value: 'Kotlin'        },
              { icon: Wifi,   label: 'Type',        value: 'WebView TWA'   },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-foreground/5 rounded-xl p-2.5 text-center border border-border">
                <Icon className="w-3.5 h-3.5 text-foreground/30 mx-auto mb-1" />
                <div className="text-xs font-black text-foreground leading-none">{value}</div>
                <div className="text-[9px] text-foreground/30 uppercase tracking-widest mt-1">{label}</div>
              </div>
            ))}
          </div>

          <div className="space-y-2 mb-4">
            {[
              { ok: true,  text: 'Full-screen WebView — no browser chrome visible' },
              { ok: true,  text: 'Zero Zite branding — completely white-labeled' },
              { ok: true,  text: 'Branded splash screen with 🎯 icon & app name' },
              { ok: true,  text: 'Back button navigation through page history' },
              { ok: true,  text: 'Indigo progress bar while pages load' },
              { ok: true,  text: 'Edge-to-edge display with transparent status bar' },
              { ok: true,  text: 'Friendly offline error page with retry button' },
              { ok: false, text: 'Requires Android Studio (free) on a PC to build the final .apk' },
            ].map(({ ok, text }) => (
              <div key={text} className="flex items-start gap-2 text-xs text-foreground/60 leading-relaxed">
                <span className={`text-[12px] mt-0.5 flex-shrink-0 ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {ok ? '✅' : '⚠️'}
                </span>
                <span>{text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowSteps(p => !p)}
            className="w-full flex items-center justify-between py-3 px-4 rounded-xl bg-foreground/5 border border-border text-xs font-semibold text-foreground/60 mb-3 transition-all hover:bg-foreground/8 active:scale-[0.98]"
          >
            <span className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5 text-violet-400" /> How to build the APK</span>
            {showSteps ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {showSteps && (
            <div className="mb-4 p-4 bg-foreground/5 rounded-2xl border border-border space-y-3">
              {[
                { n: '1', txt: 'Click Download below — unzip the project folder' },
                { n: '2', txt: 'Open Android Studio → File → Open → select the folder' },
                { n: '3', txt: 'Wait for Gradle sync (2–5 min, first time only)' },
                { n: '4', txt: 'Build → Build Bundle(s)/APK(s) → Build APK(s)' },
                { n: '5', txt: 'Find APK at: app/build/outputs/apk/debug/app-debug.apk' },
                { n: '6', txt: 'On phone: Settings → Security → Install Unknown Apps → allow' },
                { n: '7', txt: 'Transfer APK to phone and tap to install — done! 🚀' },
              ].map(({ n, txt }) => (
                <div key={n} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5 border border-violet-500/20">{n}</div>
                  <p className="text-xs text-foreground/65 leading-relaxed">{txt}</p>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[10px] text-foreground/40 leading-relaxed">
                  💡 No PC? Use the "Install on Android" section above — WebIntoApp.com generates an APK online for free!
                </p>
              </div>
            </div>
          )}

          <button
            onClick={handleApk}
            disabled={apkLoading}
            className={`w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-80 ${
              apkDone
                ? 'bg-emerald-500/15 border-2 border-emerald-500/30 text-emerald-400'
                : 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:brightness-110'
            }`}
          >
            {apkLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating Android project…</>
              : apkDone
                ? <><Check className="w-4 h-4" /> Android Project Downloaded!</>
                : <><Smartphone className="w-4 h-4" /> Download Android Studio Project</>
            }
          </button>
          <p className="text-[10px] text-foreground/30 text-center mt-2">
            Open in Android Studio → Build → Build APK(s)
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          📖  SECTION 4 — APP DOCUMENTATION & PROMPT
      ══════════════════════════════════════════════════ */}
      <div className="glass-card overflow-hidden border-border">
        <div className="h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500" />

        <div className="p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/15 flex items-center justify-center border border-amber-400/20 flex-shrink-0">
              <FileCode className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-black text-foreground">App Documentation & Prompt</h3>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase tracking-wide">A–Z</span>
              </div>
              <p className="text-xs text-foreground/50">55 visual screen previews in phone frames — every screen of the app rendered as CSS mockups</p>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {[
              { ok: true,  text: '55 CSS-rendered screen previews — every screen visualized in phone frames' },
              { ok: true,  text: 'Dashboard, Create Quiz, Quiz Modes, Results, Library — all screens covered' },
              { ok: true,  text: 'Stats, Profile, Settings, Awards, Practice, Flashcards, AI Chatbot' },
              { ok: true,  text: 'Phone-frame mockups with accurate layouts, colors & UI structure' },
              { ok: true,  text: 'Pure HTML/CSS — no external images, works offline, self-contained' },
              { ok: true,  text: 'Complete recreation prompt to rebuild from scratch' },
              { ok: true,  text: 'Technical architecture & feature overview included' },
            ].map(({ ok, text }) => (
              <div key={text} className="flex items-start gap-2 text-xs text-foreground/60 leading-relaxed">
                <span className={`text-[12px] mt-0.5 flex-shrink-0 ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {ok ? '✅' : '⚠️'}
                </span>
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* Preview in browser */}
          <button
            onClick={() => {
              const html = generateAppDocHTML();
              const win = window.open('', '_blank');
              if (win) { win.document.write(html); win.document.close(); }
              toast.success('📖 Opened documentation preview!');
            }}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:brightness-110 mb-3"
          >
            <ExternalLink className="w-4 h-4" /> Preview in Browser (55 Screens)
          </button>

          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={() => { downloadAppDocHTML(); toast.success('📖 HTML downloaded!'); }}
              className="flex items-center justify-center gap-1.5 py-3 rounded-2xl font-bold text-xs transition-all active:scale-[0.98] bg-foreground/5 border border-border text-foreground/70 hover:bg-foreground/10"
            >
              <Download className="w-3.5 h-3.5" /> HTML
            </button>
            <button
              onClick={() => { downloadAppDocPDF(); toast.success('📄 Opened for PDF printing'); }}
              className="flex items-center justify-center gap-1.5 py-3 rounded-2xl font-bold text-xs transition-all active:scale-[0.98] bg-foreground/5 border border-border text-foreground/70 hover:bg-foreground/10"
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            <button
              onClick={() => {
                const html = generateAppDocHTML();
                const cssOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '');
                const blob = new Blob([cssOnly], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `quiz-master-pro-visual-doc-${new Date().toISOString().split('T')[0]}.html`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('📦 HTML+CSS doc downloaded!');
              }}
              className="flex items-center justify-center gap-1.5 py-3 rounded-2xl font-bold text-xs transition-all active:scale-[0.98] bg-foreground/5 border border-border text-foreground/70 hover:bg-foreground/10"
            >
              <Code2 className="w-3.5 h-3.5" /> CSS
            </button>
          </div>
          <p className="text-[10px] text-foreground/30 text-center mt-2">
            Preview opens in new tab • HTML/CSS = self-contained download • PDF via print dialog
          </p>
        </div>
      </div>

      {/* ── Info footer ── */}
      <div className="glass-card p-4 border-border/50">
        <p className="text-[11px] text-foreground/40 text-center leading-relaxed">
          🔒 Your quiz data stays in your account. Downloads only include app code & Android wrapper — not your personal quiz history.
        </p>
      </div>

      {/* Full install guide modal */}
      <MobileInstallGuide isOpen={showInstall} onClose={() => setShowInstall(false)} />
    </div>
  );
}
