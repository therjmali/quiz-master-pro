/**
 * Who is signed in, as one simple answer for every screen.
 *
 * The account is the cloud one (Supabase) when this build has a Supabase project, and the on-device
 * account (platform/account/localAccount.ts) when it does not - which is the Android APK. The legacy
 * hosted-backend session (`zitejs/auth`) can still exist in editor builds, so it counts as a last
 * resort. Order: account (cloud or device) → legacy → guest.
 *
 * The mapping itself lives in `accountView.ts` (no React, no auth client) so it is unit-tested.
 */
import { useAuth } from 'zitejs/auth';
import { useCloudAuth } from './authStore';
import { viewFromAuth, type AccountView } from './accountView';
import { accountName } from './accountName';

export type { AccountView };
export { viewFromAuth };

export function useAccount(): AccountView {
  const cloud = useCloudAuth();
  const view = viewFromAuth(cloud);
  // Only reach for the legacy session when there is no account at all (it needs a backend URL).
  const legacy = useAuth();
  if (view.signedIn) return view;
  if (legacy.user) {
    const u = legacy.user as { firstName?: string; email?: string };
    return { loading: false, signedIn: true, name: accountName(u.firstName, u.email), email: u.email ?? '', source: 'legacy' };
  }
  return view;
}
