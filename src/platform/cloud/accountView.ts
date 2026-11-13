/**
 * The single answer to "is someone signed in, and who?" - with no React and no network code, so the
 * header, dashboards, reports and the unit tests all derive it from the same rule.
 */
import type { AuthState } from './authStore';
import { accountName } from './accountName';

export interface AccountView {
  /** Auth is still being checked (never true when cloud is not configured). */
  loading: boolean;
  signedIn: boolean;
  /** First name or e-mail prefix; '' when signed out. */
  name: string;
  email: string;
  source: 'cloud' | 'device' | 'legacy' | null;
}

/** Map the account store onto the view every screen consumes. */
export function viewFromAuth(cloud: AuthState): AccountView {
  if (cloud.status === 'signed-in' && cloud.user) {
    return {
      loading: false,
      signedIn: true,
      name: accountName(cloud.user.name, cloud.user.email),
      email: cloud.user.email,
      source: cloud.configured ? 'cloud' : 'device',
    };
  }
  return { loading: cloud.configured && cloud.status === 'loading', signedIn: false, name: '', email: '', source: null };
}
