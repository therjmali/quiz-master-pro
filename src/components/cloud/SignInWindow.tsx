/**
 * The sign-in window: a dialog that opens from anywhere (header button, dashboard card, reminders)
 * via openSignIn(). Uses the same form as Settings -> Account & Cloud Sync, closes itself the moment
 * the account is signed in, and never blocks the app - "Not now" is always there.
 */
import { useCallback, useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { isCloudConfigured } from '../../platform/cloud/config';
import { clearAuthMessages, useCloudAuth } from '../../platform/cloud/authStore';
import { OPEN_SIGNIN_EVENT, type SignInMode, type SignInRequest } from '../../platform/cloud/signInWindow';
import { AuthForm, NotConfigured } from '../profile/settings/sectionsCloud';

export default function SignInWindow() {
  const auth = useCloudAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SignInMode>('signin');
  // Re-mount the form on every open so a previous attempt's fields never linger.
  const [session, setSession] = useState(0);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<SignInRequest | undefined>).detail;
      setMode(detail?.mode === 'signup' ? 'signup' : 'signin');
      setSession(n => n + 1);
      clearAuthMessages();
      setOpen(true);
    };
    window.addEventListener(OPEN_SIGNIN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SIGNIN_EVENT, onOpen);
  }, []);

  // Signed in (here or in another tab): the job is done.
  useEffect(() => { if (open && auth.status === 'signed-in') setOpen(false); }, [open, auth.status]);

  const onOpenChange = useCallback((next: boolean) => { if (!next) clearAuthMessages(); setOpen(next); }, []);

  const configured = isCloudConfigured();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100%-1.5rem)] rounded-2xl border-border bg-background p-5 sm:p-6">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold text-foreground">
            <span className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center"><Cloud className="w-4 h-4" /></span>
            {mode === 'signup' ? 'Create your account' : 'Sign in'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Sync your quizzes and progress across devices. The app works fully offline without an account.
          </DialogDescription>
        </DialogHeader>

        {!configured ? <NotConfigured />
          : auth.status === 'loading' ? <p className="py-8 text-center text-sm text-foreground/50" role="status">Checking sign-in…</p>
          : <AuthForm key={session} initialMode={mode} />}

        <button type="button" onClick={() => onOpenChange(false)}
          className="w-full h-10 rounded-xl text-xs font-bold text-foreground/55 hover:text-foreground hover:bg-foreground/[0.05] transition">
          Not now - continue as guest
        </button>
      </DialogContent>
    </Dialog>
  );
}
