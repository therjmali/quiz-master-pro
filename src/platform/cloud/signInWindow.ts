/**
 * One place to open the sign-in window from anywhere (header, dashboard card, toasts, settings).
 * The window itself (components/cloud/SignInWindow.tsx) listens for this event. Kept free of React
 * so any module - and the unit tests - can use it.
 */
export const OPEN_SIGNIN_EVENT = 'qm:open-signin';

export type SignInMode = 'signin' | 'signup';

export interface SignInRequest { mode: SignInMode }

export function openSignIn(mode: SignInMode = 'signin'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SignInRequest>(OPEN_SIGNIN_EVENT, { detail: { mode } }));
}

/** Dashboard invitation: hidden for a week after "dismiss". Pure, so it is unit-tested. */
export const SIGNIN_CARD_KEY = 'qm-signin-card-dismissed-v1';
export const SIGNIN_CARD_HIDE_MS = 7 * 86_400_000;
export function shouldShowSignInCard(dismissedAt: number, now = Date.now()): boolean {
  return !(Number.isFinite(dismissedAt) && dismissedAt > 0 && now - dismissedAt < SIGNIN_CARD_HIDE_MS);
}
