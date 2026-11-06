/**
 * App-level cloud guardrails (modelled on RJ Tracker Pro):
 *  1. First contact with an account that already holds data -> ask before mixing, from ANY screen.
 *  2. Data changed by another device -> toast, then the platform runtime reloads so every screen reflects it.
 *  3. A gentle, once-in-a-while invitation for guests to sign in (never blocks anything).
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { isCloudConfigured } from '../../platform/cloud/config';
import { getAuthState } from '../../platform/cloud/authStore';
import { DATA_APPLIED_EVENT, useSyncState } from '../../platform/cloud/syncEngine';
import { getHistorySync } from '../../utils/historyStore';
import { ChoiceCard } from '../profile/settings/sectionsCloud';

const PROMPT_KEY = 'qm-cloud-prompt-v1';
const PROMPT_EVERY_MS = 14 * 86_400_000;
const PROMPT_DELAY_MS = 25_000;

export const OPEN_SETTINGS_EVENT = 'qm:open-settings';

export function requestOpenSettingsSection(section: string): void {
  try { sessionStorage.setItem('qm-open-section', section); } catch { /* ignore */ }
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export default function CloudGate({ onSignIn }: { onSignIn: () => void }) {
  const sync = useSyncState();
  const [choiceOpen, setChoiceOpen] = useState(false);

  useEffect(() => { setChoiceOpen(sync.phase === 'needs-choice' && !!sync.needsChoice); }, [sync.phase, sync.needsChoice]);

  useEffect(() => {
    const onApplied = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      if (detail?.reason === 'restore') return;
      toast.success('Synced from another device', { description: 'Refreshing to show the latest data...', duration: 2500 });
    };
    window.addEventListener(DATA_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(DATA_APPLIED_EVENT, onApplied);
  }, []);

  useEffect(() => {
    if (!isCloudConfigured()) return;
    const timer = setTimeout(() => {
      try {
        if (getAuthState().status !== 'signed-out') return;
        if (getHistorySync().length === 0) return;                       // nothing worth protecting yet
        const last = Number(localStorage.getItem(PROMPT_KEY) || 0);
        if (Date.now() - last < PROMPT_EVERY_MS) return;
        localStorage.setItem(PROMPT_KEY, String(Date.now()));
      } catch { return; }
      toast('Back up and sync your progress', {
        description: 'Sign in to keep your quizzes safe and the same on every device.',
        duration: 14_000,
        action: { label: 'Sign in', onClick: () => onSignIn() },
      });
    }, PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [onSignIn]);

  if (!isCloudConfigured()) return null;
  return (
    <AlertDialog open={choiceOpen} onOpenChange={() => { /* a choice is required, nothing else dismisses it */ }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="sr-only">Combine this device with your cloud account</AlertDialogTitle>
          <AlertDialogDescription className="sr-only">This account already has data. Choose how to combine it with this device.</AlertDialogDescription>
        </AlertDialogHeader>
        <ChoiceCard />
      </AlertDialogContent>
    </AlertDialog>
  );
}
