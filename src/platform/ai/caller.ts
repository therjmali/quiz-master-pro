/**
 * Drop-in replacement for `zitejs/caller` (aliased in vite.config.ts).
 *
 * Every backend call still goes through the original caller. For endpoints that have an in-app
 * implementation (AI quiz generation and explanations) the call is answered on the device when:
 *   - the build has no backend configured (the standalone web app / APK), or
 *   - the backend call failed and the user has saved their own AI key.
 * So with a key saved, AI works offline-first and without any server; without a key the user gets a
 * clear instruction instead of a network error.
 */
import { createCaller as realCreateCaller, createStreamingCaller as realCreateStreamingCaller } from 'zitejs-real-caller';
import { env } from '../native';
import { LOCAL_ENDPOINTS } from './localEndpoints';
import { AiError, hasAnyAiKey } from './providers';

export const createStreamingCaller = realCreateStreamingCaller;

export function hasBackend(): boolean { return env('VITE_ZITE_RUNNER_URL') !== ''; }

export function createCaller<I = unknown, O = unknown>(...args: unknown[]): (input: I) => Promise<O> {
  const real = (realCreateCaller as (...a: unknown[]) => (input: I) => Promise<O>)(...args);
  const name = typeof args[0] === 'string' ? (args[0] as string) : String(args[1] ?? '');
  const local = LOCAL_ENDPOINTS[name] as ((input: I) => Promise<O>) | undefined;
  if (!local) return real;

  return async (input: I): Promise<O> => {
    if (!hasBackend()) {
      if (!hasAnyAiKey() && !hasExplicitKey(input)) {
        throw new AiError('Add your AI key in Settings -> AI to use this feature. It stays on your device.', 'no_key');
      }
      return local(input);
    }
    try {
      return await real(input);
    } catch (err) {
      if (hasAnyAiKey() || hasExplicitKey(input)) return local(input);
      throw err;
    }
  };
}

function hasExplicitKey(input: unknown): boolean {
  const i = input as Record<string, unknown> | null;
  return !!i && ['userGeminiKey', 'userCohereKey', 'userOpenaiKey', 'userAnthropicKey'].some(k => typeof i[k] === 'string' && (i[k] as string).trim() !== '');
}
