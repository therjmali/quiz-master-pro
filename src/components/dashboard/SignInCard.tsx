/**
 * Dashboard invitation for guests: create an account to protect this device (offline build) or to
 * sync across devices (cloud build). Opens the sign-in window; never blocks anything. "Dismiss"
 * hides it for a week.
 */
import { useState } from 'react';
import { CloudUpload, X } from 'lucide-react';
import { isCloudConfigured } from '../../platform/cloud/config';
import { useAccount } from '../../platform/cloud/useAccount';
import { openSignIn, shouldShowSignInCard, SIGNIN_CARD_KEY } from '../../platform/cloud/signInWindow';

function readDismissed(): number {
  try { return Number(localStorage.getItem(SIGNIN_CARD_KEY) || 0); } catch { return 0; }
}

export default function SignInCard() {
  const account = useAccount();
  const [dismissedAt, setDismissedAt] = useState(readDismissed);

  // Shown in both builds: an on-device account is just as worth having as a cloud one.
  if (account.loading || account.signedIn || !shouldShowSignInCard(dismissedAt)) return null;
  const cloud = isCloudConfigured();

  const dismiss = () => {
    const now = Date.now();
    try { localStorage.setItem(SIGNIN_CARD_KEY, String(now)); } catch { /* storage blocked: hide for this session only */ }
    setDismissedAt(now);
  };

  return (
    <section aria-label={cloud ? 'Sign in to sync' : 'Create an account'} className="relative flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] px-4 py-3 animate-slide-up">
      <span className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0"><CloudUpload className="w-5 h-5" /></span>
      <div className="flex-1 min-w-0 pr-5">
        <p className="text-sm font-black text-foreground leading-tight">{cloud ? 'Sign in to sync your progress' : 'Protect your progress'}</p>
        <p className="text-[11px] text-foreground/50 mt-0.5 leading-snug">
          {cloud ? 'Same quizzes on every device, with a cloud backup. Works offline either way.' : 'Create an account on this phone in seconds — your quizzes stay here, behind your password.'}
        </p>
        <div className="flex flex-wrap gap-2 mt-2.5">
          <button type="button" onClick={() => openSignIn('signin')}
            className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-bold active:scale-95 transition">Sign in</button>
          <button type="button" onClick={() => openSignIn('signup')}
            className="h-8 px-4 rounded-lg border border-border bg-foreground/[0.04] text-foreground/70 text-xs font-bold hover:bg-foreground/[0.08] active:scale-95 transition">Create account</button>
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label="Hide for a week"
        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-foreground/35 hover:text-foreground/70 hover:bg-foreground/[0.06] transition">
        <X className="w-3.5 h-3.5" />
      </button>
    </section>
  );
}
