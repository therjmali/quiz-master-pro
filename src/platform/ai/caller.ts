/**
 * Drop-in replacement for `zitejs/caller` (aliased in vite.config.ts).
 *
 * Every backend call still goes through the original caller when a backend is configured.
 * For AI endpoints (both request/response and streaming chat), the call is answered directly on
 * the device using the user's own saved API keys when:
 *   - the build has no backend configured (standalone web app / GitHub Pages / Android APK), or
 *   - the backend call failed and the user has saved an AI key.
 * Without a backend or a saved key, the user receives a clear instruction instead of a cryptic network error.
 *
 * Note: `LOCAL_ENDPOINTS` and `LOCAL_STREAMING_ENDPOINTS` are looked up inside the returned
 * call functions (not during `createCaller()` module init) so circular module initialization
 * (`localEndpoints` -> `loadFull` -> `zitejs/api` -> `caller`) never hits a TDZ ReferenceError.
 */
import {
  createCaller as realCreateCaller,
  createStreamingCaller as realCreateStreamingCaller,
  type StreamingResponse,
} from 'zitejs-real-caller';
import { env } from '../native';
import { LOCAL_ENDPOINTS, LOCAL_STREAMING_ENDPOINTS } from './localEndpoints';
import { AiError, hasAnyAiKey } from './providers';

export type { StreamingResponse };

export function hasBackend(): boolean { return env('VITE_ZITE_RUNNER_URL') !== ''; }

const NO_KEY_MSG = 'Add your AI key in Settings -> AI to use this feature. Your key stays strictly on your device.';

function hasExplicitKey(input: unknown): boolean {
  const i = input as Record<string, unknown> | null;
  return !!i && ['userGeminiKey', 'userCohereKey', 'userOpenaiKey', 'userAnthropicKey'].some(k => typeof i[k] === 'string' && (i[k] as string).trim() !== '');
}

export function createCaller<I = unknown, O = unknown>(...args: unknown[]): (input: I) => Promise<O> {
  const real = (realCreateCaller as (...a: unknown[]) => (input: I) => Promise<O>)(...args);
  const name = typeof args[0] === 'string' ? (args[0] as string) : String(args[1] ?? '');

  return async (input: I): Promise<O> => {
    const local = LOCAL_ENDPOINTS[name] as ((input: I) => Promise<O>) | undefined;
    if (!local) return real(input);

    if (!hasBackend()) {
      if (!hasAnyAiKey() && !hasExplicitKey(input)) {
        throw new AiError(NO_KEY_MSG, 'no_key');
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

function buildLocalStream<I, O>(local: (input: I) => Promise<{ text: string }>, input: I): StreamingResponse<O> {
  let resolveResult!: (value: O) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<O>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  result.catch(() => undefined);

  return {
    async *[Symbol.asyncIterator]() {
      try {
        if (!hasAnyAiKey() && !hasExplicitKey(input)) {
          throw new AiError(NO_KEY_MSG, 'no_key');
        }
        const out = await local(input);
        const text = out?.text ?? '';
        if (text) yield text;
        resolveResult(out as unknown as O);
      } catch (err) {
        rejectResult(err);
        throw err;
      }
    },
    result,
  };
}

export function createStreamingCaller<I = unknown, O = unknown>(name: string): (input: I) => StreamingResponse<O> {
  const real = realCreateStreamingCaller<I, O>(name);

  return (input: I): StreamingResponse<O> => {
    const local = LOCAL_STREAMING_ENDPOINTS[name] as ((input: I) => Promise<{ text: string }>) | undefined;
    if (!local) return real(input);

    if (!hasBackend()) {
      return buildLocalStream<I, O>(local, input);
    }

    let resolveResult!: (value: O) => void;
    let rejectResult!: (reason?: unknown) => void;
    const result = new Promise<O>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    result.catch(() => undefined);

    return {
      async *[Symbol.asyncIterator]() {
        let yieldedAny = false;
        try {
          const upstream = real(input);
          upstream.result.catch(() => undefined);
          for await (const chunk of upstream) {
            yieldedAny = true;
            yield chunk;
          }
          const finalVal = await upstream.result;
          resolveResult(finalVal);
        } catch (err) {
          if (!yieldedAny && (hasAnyAiKey() || hasExplicitKey(input))) {
            try {
              const out = await local(input);
              if (out?.text) yield out.text;
              resolveResult(out as unknown as O);
              return;
            } catch (fallbackErr) {
              rejectResult(fallbackErr);
              throw fallbackErr;
            }
          }
          rejectResult(err);
          throw err;
        }
      },
      result,
    };
  };
}
