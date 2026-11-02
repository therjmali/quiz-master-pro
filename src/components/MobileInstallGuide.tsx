import { useState, useEffect, useRef } from 'react';
import {
  X, Smartphone, Download, Copy, ExternalLink,
  CheckCircle, Globe, Package, ChevronDown, ChevronUp,
  Star, ArrowRight, Shield, Settings, Zap, Paintbrush, Wifi, AlertCircle
} from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'light' | 'amoled';
}

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
    return () => { standaloneQ.removeEventListener('change', update); window.removeEventListener('beforeinstallprompt', handler); };
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

function CopyBtn({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 border ${
        copied
          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
          : 'bg-primary/20 text-primary border-primary/30 hover:bg-primary/30'
      }`}
    >
      {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy URL'}
    </button>
  );
}

function Pill({ n, done }: { n: number; done?: boolean }) {
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 border ${
      done ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-primary/20 border-primary/30 text-primary'
    }`}>
      {done ? <CheckCircle className="w-3.5 h-3.5" /> : n}
    </div>
  );
}

function Accordion({
  icon, title, badge, badgeColor, desc, open, onToggle, children
}: {
  icon: React.ReactNode; title: string; badge: string; badgeColor: string;
  desc: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${open ? 'border-primary/40 bg-primary/5' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/15'}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 border border-primary/20 flex items-center justify-center flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm">{title}</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${badgeColor}`}>{badge}</span>
          </div>
          <p className="text-[11px] text-white/45 mt-0.5 leading-tight">{desc}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-white/30 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-white/[0.06]">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

export default function MobileInstallGuide({ isOpen, onClose, theme = 'amoled' }: Props) {
  const [tab, setTab] = useState<'apk' | 'pwa' | 'branding'>('apk');
  const [expanded, setExpanded] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [launching, setLaunching] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { installEvent, isPwa, install } = usePwaInstall();
  const appUrl = window.location.origin;

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInstall = async () => {
    setInstalling(true);
    const ok = await install();
    setInstalling(false);
    if (ok) setInstalled(true);
  };

  // One-tap APK: copy URL + open WebIntoApp
  const launchApkBuilder = async (service: 'webintoapp' | 'appsgeyser') => {
    setLaunching(true);
    try { await navigator.clipboard.writeText(appUrl); } catch {}
    setTimeout(() => {
      if (service === 'webintoapp') {
        window.open('https://webintoapp.com', '_blank', 'noopener');
      } else {
        window.open('https://appsgeyser.com/create/website', '_blank', 'noopener');
      }
      setLaunching(false);
    }, 600);
  };

  const tog = (i: number) => setExpanded(e => e === i ? -1 : i);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-16 p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="relative w-full sm:max-w-lg rounded-2xl flex flex-col overflow-hidden"
        style={{
          background: 'rgba(10,10,22,0.98)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 -24px 80px rgba(99,102,241,0.18)',
          maxHeight: '94dvh',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-indigo-700 flex items-center justify-center shadow-lg shadow-primary/30">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-black text-white text-base leading-tight">Get the Android App</h2>
              <p className="text-[11px] text-white/40">Quiz Master Pro on your phone</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 flex items-center justify-center transition-colors active:scale-90">
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-2">
          {([
            { id: 'apk', label: '📦 Get APK', sub: 'Real .apk file' },
            { id: 'pwa', label: '⚡ Quick Install', sub: '30 seconds' },
            { id: 'branding', label: '🎨 Fix Branding', sub: 'Remove Zite logo' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-xl border text-center transition-all active:scale-95 ${
                tab === t.id
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'bg-white/[0.03] border-white/[0.07] text-white/40 hover:text-white/70 hover:border-white/15'
              }`}
            >
              <div className="text-[11px] font-black leading-none">{t.label}</div>
              <div className={`text-[9px] mt-0.5 font-medium ${tab === t.id ? 'text-primary/70' : 'text-white/25'}`}>{t.sub}</div>
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3" style={{ scrollbarWidth: 'thin' }}>

          {/* ── APK TAB ── */}
          {tab === 'apk' && (
            <>
              {/* Honest notice */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-300">Why can't you just give me the APK directly?</p>
                  <p className="text-[11px] text-white/55 mt-1 leading-relaxed">
                    An APK is compiled native code — like a .exe file. No AI or website can compile Android binaries without running Google's actual Android SDK tools. But the services below do exactly that for you, completely free!
                  </p>
                </div>
              </div>

              {/* Method 1 — WebIntoApp ONE TAP */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] overflow-hidden">
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Star className="w-4 h-4 text-emerald-400" />
                    <span className="font-black text-emerald-300 text-sm">WebIntoApp.com</span>
                    <span className="text-[10px] bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full font-bold">FREE · RECOMMENDED</span>
                  </div>
                  <p className="text-[11px] text-white/50 mb-4">
                    Tap the button below. Your app URL is auto-copied to clipboard. On the website, just paste it and hit "Create App" — done!
                  </p>

                  {/* Steps visual */}
                  <div className="grid grid-cols-4 gap-1 mb-4">
                    {[
                      { emoji: '👆', label: 'Tap button below' },
                      { emoji: '📋', label: 'Paste URL (auto-copied)' },
                      { emoji: '⚙️', label: 'Tap "Create App"' },
                      { emoji: '📥', label: 'Download APK' },
                    ].map((s, i) => (
                      <div key={i} className="bg-black/30 border border-white/[0.06] rounded-xl p-2 text-center">
                        <div className="text-xl mb-1">{s.emoji}</div>
                        <p className="text-[9px] text-white/50 leading-tight">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* THE ONE TAP BUTTON */}
                  <button
                    onClick={() => launchApkBuilder('webintoapp')}
                    disabled={launching}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 text-white font-black text-base flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-70 shadow-xl shadow-emerald-900/40"
                  >
                    {launching ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Copying URL & Launching…
                      </>
                    ) : (
                      <>
                        <span className="text-2xl leading-none">🚀</span>
                        One-Tap: Open APK Builder
                      </>
                    )}
                  </button>
                  <p className="text-center text-[10px] text-white/30 mt-2">
                    ✅ URL auto-copied • Opens WebIntoApp.com • ~3 min to get APK
                  </p>
                </div>

                {/* Install steps after download */}
                <div className="px-4 pb-4 border-t border-white/[0.06] pt-3">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">After downloading the APK:</p>
                  <div className="space-y-2">
                    {[
                      'Open Settings → Security (or Privacy)',
                      'Enable "Install Unknown Apps" or "Unknown sources"',
                      'Open the downloaded APK file',
                      'Tap Install → Done! ✅',
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Pill n={i + 1} />
                        <p className="text-xs text-white/60">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Method 2 — AppsGeyser */}
              <Accordion
                icon={<Package className="w-4 h-4 text-primary" />}
                title="AppsGeyser.com"
                badge="FREE BACKUP"
                badgeColor="text-blue-400 bg-blue-500/10 border-blue-500/20"
                desc="Alternative service if WebIntoApp doesn't work for you"
                open={expanded === 1}
                onToggle={() => tog(1)}
              >
                <div className="space-y-3">
                  <p className="text-xs text-white/60">Same process — choose "Website" template, paste your URL, download APK.</p>
                  <div className="flex items-center gap-3 bg-black/30 border border-white/[0.07] rounded-xl p-3">
                    <Globe className="w-4 h-4 text-primary/70 flex-shrink-0" />
                    <span className="text-xs text-white/60 font-mono flex-1 truncate">{appUrl}</span>
                    <CopyBtn url={appUrl} />
                  </div>
                  <button
                    onClick={() => launchApkBuilder('appsgeyser')}
                    className="w-full py-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-600/30 transition-colors active:scale-95"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open AppsGeyser.com
                  </button>
                </div>
              </Accordion>

              {/* Method 3 — Android Studio project */}
              <Accordion
                icon={<Download className="w-4 h-4 text-primary" />}
                title="Android Studio Project"
                badge="ADVANCED"
                badgeColor="text-white/40 bg-white/[0.05] border-white/10"
                desc="Full Kotlin source — send to someone with a PC to build"
                open={expanded === 2}
                onToggle={() => tog(2)}
              >
                <p className="text-xs text-white/60">
                  The Profile → Downloads tab has a "📱 Download Android Project" button. Download the zip and send it to anyone with Android Studio — they can build the APK in 5 minutes and send it back to you.
                </p>
              </Accordion>

              {/* Security tips */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
                <Shield className="w-4 h-4 text-primary/70 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-white/70">Security tip for installing APKs</p>
                  <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
                    After installing, go back to Settings and turn off "Install Unknown Apps" again. This keeps your phone safe from other unknown apps.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ── PWA TAB ── */}
          {tab === 'pwa' && (
            <>
              {isPwa ? (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                  <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-emerald-300">Already installed! 🎉</p>
                    <p className="text-xs text-white/50 mt-0.5">Quiz Master Pro is running as an installed app on your device.</p>
                  </div>
                </div>
              ) : installEvent ? (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="font-black text-white text-sm">Chrome detected — install in one tap!</span>
                  </div>
                  <p className="text-xs text-white/55 mb-4">Your browser supports direct installation. Tap below — no APK, no downloads!</p>
                  <button
                    onClick={handleInstall}
                    disabled={installing || installed}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-black text-base flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-70 shadow-xl shadow-primary/30"
                  >
                    {installed ? (
                      <><CheckCircle className="w-5 h-5" /> Installed! Check your home screen 🎉</>
                    ) : installing ? (
                      <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Installing…</>
                    ) : (
                      <><Download className="w-5 h-5" /> Install Quiz Master Pro ⚡</>
                    )}
                  </button>
                </div>
              ) : null}

              {/* Manual Chrome steps */}
              <div className="rounded-2xl border border-white/[0.09] bg-white/[0.03] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <p className="text-xs font-black text-white/50 uppercase tracking-widest">Add to Home Screen manually</p>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    { n: 1, title: 'Open Chrome on your Android', desc: 'Must be Google Chrome browser' },
                    { n: 2, title: 'Visit this URL', desc: appUrl, mono: true },
                    { n: 3, title: 'Tap the ⋮ menu (top-right)', desc: 'Three dots in Chrome' },
                    { n: 4, title: 'Tap "Add to Home Screen"', desc: 'Then tap "Add" in the popup' },
                    { n: 5, title: 'Done! 🎉', desc: 'App icon appears on your home screen — full-screen, no browser bar', done: true },
                  ].map(s => (
                    <div key={s.n} className="flex items-start gap-3">
                      <Pill n={s.n} done={s.done} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${s.done ? 'text-emerald-400' : 'text-white'}`}>{s.title}</p>
                        {s.mono ? (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-primary font-mono truncate">{s.desc}</span>
                            <CopyBtn url={appUrl} />
                          </div>
                        ) : (
                          <p className="text-xs text-white/45 mt-0.5">{s.desc}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-primary/[0.08] border border-primary/20">
                <Wifi className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-white/60">
                  Works just like a real app — full screen, no browser bar, loads fast. Goes to your home screen with an icon. The only difference: no offline use (needs internet like any web app).
                </p>
              </div>
            </>
          )}

          {/* ── BRANDING TAB ── */}
          {tab === 'branding' && (
            <>
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-gradient-to-br from-accent/10 to-primary/10 border border-purple-500/25">
                <Paintbrush className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-white text-sm">Remove Zite branding from home screen</p>
                  <p className="text-xs text-white/55 mt-1 leading-relaxed">
                    When you "Add to Home Screen", the icon and name come from your app's settings — not from Zite. You just need to set your own icon and title in Zite's Settings panel. Here's exactly how:
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.09] bg-white/[0.03] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <p className="text-xs font-black text-white/50 uppercase tracking-widest">Steps (takes 2 minutes)</p>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <Pill n={1} />
                    <div>
                      <p className="text-sm font-bold text-white">Publish your app first</p>
                      <p className="text-xs text-white/45 mt-0.5">Tap the purple "Publish" button in the top-right of the Zite editor. Settings are locked until the app is published.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Pill n={2} />
                    <div>
                      <p className="text-sm font-bold text-white">Open Settings</p>
                      <p className="text-xs text-white/45 mt-0.5">Tap the ⚙️ gear icon in the top-right corner of the Zite editor.</p>
                      <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-black/30 rounded-xl border border-white/[0.07] w-fit">
                        <Settings className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs text-white/60 font-mono">⚙️ Settings → Branding tab</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Pill n={3} />
                    <div>
                      <p className="text-sm font-bold text-white">Change the Title</p>
                      <p className="text-xs text-white/45 mt-0.5">Set Title to <strong className="text-white/70">"Quiz Master Pro"</strong> — this becomes the app name on the home screen.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Pill n={4} />
                    <div>
                      <p className="text-sm font-bold text-white">Upload a Favicon/Icon</p>
                      <p className="text-xs text-white/45 mt-0.5">Upload any square PNG image as your favicon — this becomes your home screen icon. Use a graduation cap 🎓 or trophy 🏆 emoji screenshot.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Pill n={5} done />
                    <div>
                      <p className="text-sm font-bold text-emerald-400">Done! Now "Add to Home Screen" shows YOUR branding</p>
                      <p className="text-xs text-white/45 mt-0.5">The home screen icon will be your uploaded image, name will be "Quiz Master Pro" — zero Zite branding visible!</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Icon tip */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-xs font-bold text-white/60 mb-3">💡 Quick free icon idea</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { emoji: '🎯', label: 'Take emoji screenshot on phone' },
                    { emoji: '🎓', label: 'Use AI like Gemini to generate icon' },
                    { emoji: '🏆', label: 'Crop any image to square 512×512px' },
                    { emoji: '✏️', label: 'Draw one at canva.com (free)' },
                  ].map((t, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-black/20 rounded-xl border border-white/[0.05]">
                      <span className="text-lg">{t.emoji}</span>
                      <p className="text-[10px] text-white/50 leading-tight">{t.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-primary/[0.08] border border-primary/20">
                <ArrowRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-white/60">
                  After fixing branding + using "Add to Home Screen" (Quick Install tab), you'll have a full-screen Quiz Master Pro app on your Android with zero Zite branding anywhere — and it works exactly like a native app!
                </p>
              </div>
            </>
          )}

          <div className="h-2" />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
          <p className="text-[10px] text-white/25">Quiz Master Pro — Premium Edition</p>
          <button onClick={onClose} className="text-xs text-white/30 hover:text-white/60 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}
