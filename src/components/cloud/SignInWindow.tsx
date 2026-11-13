import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GraduationCap,
  Cloud,
  ShieldCheck,
  Wifi,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  X,
  User,
  Smartphone,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@project/components/ui/dialog';
import { isCloudConfigured } from '../../platform/cloud/config';
import {
  clearAuthMessages,
  getAuthState,
  useCloudAuth,
  signIn,
  signUp,
  requestPasswordReset,
  MIN_PASSWORD_LENGTH,
} from '../../platform/cloud/authStore';
import { deviceAccountInfo, deviceAccountSupported, isValidEmail, lastEmail, passwordProblem } from '../../platform/account/localAccount';
import { OPEN_SIGNIN_EVENT, type SignInMode, type SignInRequest } from '../../platform/cloud/signInWindow';

const TRUST_POINTS = [
  {
    icon: Cloud,
    title: 'Every device, same data',
    copy: 'Phone, tablet, laptop — one account, one syllabus.',
  },
  {
    icon: ShieldCheck,
    title: 'Your own server',
    copy: 'Nothing is sold, mined or shared. Protected by HTTPS.',
  },
  {
    icon: Wifi,
    title: 'Offline is still first',
    copy: 'Practice on a train; changes sync when you reconnect.',
  },
];

const DEVICE_POINTS = [
  {
    icon: Smartphone,
    title: 'Saved on this phone',
    copy: 'Quizzes, notes and streaks stay on the device — no network needed.',
  },
  {
    icon: KeyRound,
    title: 'Your password is hashed',
    copy: 'Only a PBKDF2 hash is stored. The password itself is never saved or sent.',
  },
  {
    icon: Wifi,
    title: 'Works with no signal',
    copy: 'Create the account, sign in and study in airplane mode.',
  },
];

type SubmitState = { tone: 'error' | 'info'; text: string; showSignUp?: boolean } | null;

export default function SignInWindow() {
  const auth = useCloudAuth();
  const configured = isCloudConfigured();
  const deviceSupported = useMemo(() => configured || deviceAccountSupported(), [configured]);
  const storedAccount = useMemo(() => (configured ? null : deviceAccountInfo()), [configured]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SignInMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(auth.keepSignedIn);
  const [isReset, setIsReset] = useState(false);
  const [notice, setNotice] = useState<SubmitState>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const openWindow = useCallback((nextMode: SignInMode) => {
    setMode(nextMode);
    setIsReset(false);
    setPassword('');
    setShowPassword(false);
    setNotice(null);
    clearAuthMessages();
    const known = storedAccount?.email || lastEmail();
    setEmail(prev => prev || known);
    setOpen(true);
    // Focus the first field that still needs an answer (Android raises the keyboard for this).
    setTimeout(() => {
      const target = nextMode === 'signin' && known ? passwordRef.current : emailRef.current;
      target?.focus();
    }, 120);
  }, [storedAccount]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<SignInRequest | undefined>).detail;
      openWindow(detail?.mode === 'signup' ? 'signup' : 'signin');
    };
    window.addEventListener(OPEN_SIGNIN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SIGNIN_EVENT, onOpen);
  }, [openWindow]);

  // Close immediately when sign-in completes.
  useEffect(() => {
    if (open && auth.status === 'signed-in') setOpen(false);
  }, [open, auth.status]);

  const onOpenChange = useCallback((next: boolean) => {
    if (!next) { clearAuthMessages(); setNotice(null); setPassword(''); }
    setOpen(next);
  }, []);

  /** Any edit invalidates the last failure, so the message never contradicts what is on screen. */
  const edited = () => {
    setNotice(null);
    if (getAuthState().error || getAuthState().notice) clearAuthMessages();
  };

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setIsReset(false);
    setNotice(null);
    clearAuthMessages();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const cleanEmail = email.trim();

    if (isReset) {
      if (!isValidEmail(cleanEmail)) { setNotice({ tone: 'error', text: 'Enter the email you registered with.' }); return; }
      if (await requestPasswordReset(cleanEmail)) {
        setNotice({ tone: 'info', text: 'Reset link sent. Check your inbox.' });
        setIsReset(false);
      }
      return;
    }

    if (!isValidEmail(cleanEmail)) { setNotice({ tone: 'error', text: 'Enter a valid email address, e.g. you@example.com' }); return; }
    if (!password) { setNotice({ tone: 'error', text: 'Enter your password.' }); return; }
    if (mode === 'signup') {
      const problem = passwordProblem(password);
      if (problem) { setNotice({ tone: 'error', text: problem }); return; }
    }

    if (mode === 'signin') {
      const ok = await signIn(cleanEmail, password, keepSignedIn);
      if (ok) { toast.success('Welcome back!'); setOpen(false); return; }
      // Read the store, not this render's snapshot: the reason is written during the await.
      const live = getAuthState();
      const noAccount = !configured && !deviceAccountInfo();
      setNotice({ tone: 'error', text: live.error ?? 'Could not sign in. Check your email and password.', showSignUp: noAccount });
      passwordRef.current?.focus();
      passwordRef.current?.select();
      return;
    }

    const ok = await signUp(name, cleanEmail, password, keepSignedIn);
    const live = getAuthState();
    if (ok) {
      // Cloud sign-up with confirmation on stays signed out until the link is opened: keep the window open and explain.
      if (live.status === 'signed-in') { toast.success('Account created'); setOpen(false); }
      else { setNotice({ tone: 'info', text: live.notice ?? 'Account created. Open the confirmation link we emailed you, then sign in.' }); setMode('signin'); }
      return;
    }
    setNotice({ tone: 'error', text: live.error ?? 'Could not create the account.' });
  };

  const headline = isReset ? 'Reset password' : mode === 'signin' ? 'Welcome back' : 'Create account';
  const subline = isReset
    ? configured ? 'Enter your email to receive reset instructions.' : 'On-device accounts need no reset link — sign in with the password you chose.'
    : mode === 'signin'
      ? 'Your quizzes, progress and streaks are waiting.'
      : configured ? 'Sync your study progress across all your devices.' : 'Saved on this phone, protected by a hashed password.';
  const points = configured ? TRUST_POINTS : DEVICE_POINTS;
  const shownError = notice ?? (auth.error ? { tone: 'error' as const, text: auth.error } : null);
  const shownNotice = !shownError && (auth.notice ? { tone: 'info' as const, text: auth.notice } : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-[calc(100%-1.25rem)] sm:w-[94vw] max-h-[min(92dvh,calc(var(--qmp-app-h)-24px))] overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-background/95 p-0 shadow-2xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Sign in or create your Quiz Master account</DialogTitle>
        <div className="relative p-4 sm:p-8 md:p-10 lg:p-12">
          {/* Close button */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-6 md:gap-12 items-start md:items-center">
            {/* ── Left Column: Brand & Editorial Story ── */}
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25 border border-primary/20 shrink-0">
                  <GraduationCap className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading text-lg font-black tracking-tight text-foreground">Quiz Master</span>
                  <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-black tracking-widest border border-primary/15 uppercase">PRO</span>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80 mb-2">
                  {configured ? 'SYNC THAT RESPECTS YOUR PRIVACY' : 'YOUR ACCOUNT, ON YOUR DEVICE'}
                </p>
                <h2 className="text-2xl sm:text-4xl font-black text-foreground tracking-tight leading-[1.1]">
                  One syllabus.<br />
                  <span className="italic font-serif font-normal text-primary">{configured ? 'Every device.' : 'This phone.'}</span>
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-3 max-w-md">
                  {configured
                    ? 'Sign in once and your subjects, quizzes, sessions, flashcards and streaks follow you — phone, tablet or laptop. Everything is still saved on each device first, so practicing never waits for a network.'
                    : 'Create your account once and everything you study stays saved on this phone. No signal, no server and no sign-up e-mail — the password is kept only as a secure hash.'}
                </p>
              </div>

              {/* Trust Points */}
              <div className="hidden sm:grid gap-3 max-w-md">
                {points.map(point => {
                  const Icon = point.icon;
                  return (
                    <div key={point.title} className="flex items-start gap-3 rounded-2xl border border-white/5 bg-foreground/[0.02] dark:bg-white/[0.02] p-3">
                      <span className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary">
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground">{point.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{point.copy}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Right Column: Auth Card ── */}
            <div className="glass-card p-4 sm:p-7 rounded-3xl border border-white/10 shadow-xl bg-card/60">
              {!isReset && (
                <div role="tablist" aria-label="Sign in or create account" className="flex p-1 gap-1 rounded-2xl bg-foreground/[0.05] border border-border/40 mb-4">
                  {(['signin', 'signup'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => switchMode(m)}
                      className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                        mode === m ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {m === 'signin' ? 'Sign in' : 'Create account'}
                    </button>
                  ))}
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-xl font-black text-foreground">{headline}</h3>
                <p className="text-xs text-muted-foreground mt-1">{subline}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3" noValidate>
                {mode === 'signup' && !isReset && (
                  <div>
                    <label htmlFor="qm-account-name" className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Name</label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        id="qm-account-name"
                        type="text"
                        value={name}
                        onChange={e => { setName(e.target.value); edited(); }}
                        placeholder="Your full name"
                        autoComplete="name"
                        enterKeyHint="next"
                        className="w-full min-h-11 pl-10 pr-4 py-3 rounded-xl bg-foreground/[0.04] border border-border/70 text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="qm-account-email" className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="qm-account-email"
                      ref={emailRef}
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); edited(); }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="email"
                      enterKeyHint="next"
                      className="w-full min-h-11 pl-10 pr-4 py-3 rounded-xl bg-foreground/[0.04] border border-border/70 text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>
                </div>

                {!isReset && (
                  <div>
                    <label htmlFor="qm-account-password" className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">
                      Password{mode === 'signup' ? ` (min ${MIN_PASSWORD_LENGTH})` : ''}
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        id="qm-account-password"
                        ref={passwordRef}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); edited(); }}
                        placeholder="Your password"
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="go"
                        className="w-full min-h-11 pl-10 pr-14 py-3 rounded-xl bg-foreground/[0.04] border border-border/70 text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
                      />
                      {/* Big tap target: this is the control users ask for on a phone keyboard. */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowPassword(p => !p);
                          // Keep the caret where it was after re-rendering the input type.
                          requestAnimationFrame(() => passwordRef.current?.focus());
                        }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-9 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] active:scale-95 transition-all"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {!isReset && (
                  <div className="flex items-center justify-between gap-2 text-xs pt-0.5">
                    <label className="flex items-center gap-2 select-none cursor-pointer text-muted-foreground hover:text-foreground">
                      <input
                        type="checkbox"
                        checked={keepSignedIn}
                        onChange={e => setKeepSignedIn(e.target.checked)}
                        className="rounded border-border accent-primary w-4 h-4"
                      />
                      <span>Keep me signed in</span>
                    </label>
                    <button type="button" onClick={() => { setIsReset(true); setNotice(null); clearAuthMessages(); }} className="text-primary hover:underline font-bold">
                      Forgot password?
                    </button>
                  </div>
                )}

                {shownError && (
                  <div role="alert" className="text-xs font-bold text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-xl flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      {shownError.text}
                      {notice?.showSignUp && mode === 'signin' && (
                        <button type="button" onClick={() => switchMode('signup')} className="block mt-1 text-primary underline">Create the account now</button>
                      )}
                    </span>
                  </div>
                )}
                {shownNotice && (
                  <p role="status" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl">
                    {shownNotice.text}
                  </p>
                )}

                {!deviceSupported && (
                  <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                    This browser cannot store a secure password. Open the installed app, or sign in to cloud sync from a device that can.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={auth.busy || !deviceSupported}
                  className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.99] transition-all shadow-md shadow-primary/25 disabled:opacity-50"
                >
                  {auth.busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{mode === 'signup' ? 'Creating…' : 'Checking…'}</span>
                    </>
                  ) : (
                    <>
                      <span>{isReset ? 'Send reset link' : mode === 'signin' ? 'Sign in' : 'Create account'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>

                {isReset && (
                  <button type="button" onClick={() => { setIsReset(false); setNotice(null); clearAuthMessages(); }} className="w-full text-center text-xs font-bold text-muted-foreground hover:text-foreground pt-1">
                    ← Back to sign in
                  </button>
                )}
                {!isReset && mode === 'signin' && (
                  <p className="text-center text-[11px] text-muted-foreground pt-0.5">
                    First time on this device?{' '}
                    <button type="button" onClick={() => switchMode('signup')} className="font-bold text-primary hover:underline">Create an account</button>
                  </p>
                )}
              </form>

              {/* Offline continuation */}
              <div className="relative my-4 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <span className="relative bg-card px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">OR</span>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-full min-h-11 py-2.5 px-4 rounded-xl border border-border/70 bg-foreground/[0.02] text-xs font-bold text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground transition-all flex items-center justify-center gap-2"
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>Continue offline on this device</span>
              </button>
              <p className="text-[10px] text-muted-foreground/70 text-center mt-2 leading-relaxed">
                Guest mode keeps everything on this device. You can create an account later and upload without losing a single quiz.
              </p>
            </div>
          </div>

          <div className="mt-6 sm:mt-8 pt-4 border-t border-border/30 text-center text-[10px] text-muted-foreground/50">
            {configured ? 'Encrypted in transit (HTTPS) • No analytics • No third-party trackers' : 'Stored on this device • Password hashed with PBKDF2 • No analytics'}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
