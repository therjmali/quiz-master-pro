/**
 * Who is signed in, as one simple answer for every screen.
 *
 * The app's account is the Supabase one (cloud sync). The legacy hosted-backend session
 * (`zitejs/auth`) can still exist in non-standalone builds, so it counts as a fallback - but the
 * Supabase account always wins when both are present.
 */
import { useAuth } from 'zitejs/auth';
import { useCloudAuth } from './authStore';
import { accountName } from './accountName';

export interface AccountView {
  /** Auth is still being checked (never true when cloud is not configured). */
  loading: boolean;
  signedIn: boolean;
  /** First name or e-mail prefix; '' when signed out. */
  name: string;
  email: string;
  source: 'cloud' | 'legacy' | null;
}

export function useAccount(): AccountView {
  const cloud = useCloudAuth();
  const legacy = useAuth();
  if (cloud.status === 'signed-in' && cloud.user) {
    return { loading: false, signedIn: true, name: accountName(cloud.user.name, cloud.user.email), email: cloud.user.email, source: 'cloud' };
  }
  if (legacy.user) {
    const u = legacy.user as { firstName?: string; email?: string };
    return { loading: false, signedIn: true, name: accountName(u.firstName, u.email), email: u.email ?? '', source: 'legacy' };
  }
  return { loading: cloud.configured && cloud.status === 'loading', signedIn: false, name: '', email: '', source: null };
}
