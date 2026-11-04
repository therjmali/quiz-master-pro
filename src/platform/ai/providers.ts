/**
 * Bring-your-own-key AI providers, called straight from the device.
 *
 * Why: the app must be useful offline-first and without any server of ours. Your key lives only in
 * this browser/app (see utils/apiKeys.ts) and requests go directly to the provider you chose - there
 * is no proxy in between. Each provider's browser/CORS access is used as documented by the vendor.
 */
import { getUserApiKeys } from '../../utils/apiKeys';

export type ProviderId = 'gemini' | 'anthropic' | 'openai' | 'cohere';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
  keyHint: string;
  keyUrl: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.5-flash', keyHint: 'AIza...', keyUrl: 'https://aistudio.google.com/apikey' },
  anthropic: { id: 'anthropic', label: 'Anthropic Claude', defaultModel: 'claude-haiku-5-5', keyHint: 'sk-ant-...', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini', keyHint: 'sk-...', keyUrl: 'https://platform.openai.com/api-keys' },
  cohere: { id: 'cohere', label: 'Cohere', defaultModel: 'command-r-plus-08-2024', keyHint: 'Cohere API key', keyUrl: 'https://dashboard.cohere.com/api-keys' },
};

export const PROVIDER_ORDER: ProviderId[] = ['gemini', 'anthropic', 'openai', 'cohere'];

export type AiErrorCode = 'no_key' | 'auth' | 'rate_limit' | 'unavailable' | 'network' | 'bad_response' | 'unsupported' | 'timeout';

export class AiError extends Error {
  constructor(message: string, public code: AiErrorCode, public provider?: ProviderId) {
    super(message);
    this.name = 'AiError';
  }
}

/* ---- preferences (which provider first, custom model names) -------------------------------- */

export interface AiClientPrefs {
  preferred: ProviderId | null;
  models: Partial<Record<ProviderId, string>>;
}

const PREFS_KEY = 'qmp_ai_client_prefs';

export function getAiClientPrefs(): AiClientPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return { preferred: PROVIDER_ORDER.includes(raw.preferred) ? raw.preferred : null, models: raw.models && typeof raw.models === 'object' ? raw.models : {} };
  } catch { return { preferred: null, models: {} }; }
}

export function saveAiClientPrefs(prefs: AiClientPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export function modelFor(provider: ProviderId): string {
  return (getAiClientPrefs().models[provider] || '').trim() || PROVIDERS[provider].defaultModel;
}

export interface ProviderKey { provider: ProviderId; key: string }

/** Keys the user saved, in the order they should be tried. `override` lets an endpoint pass explicit keys. */
export function availableProviders(override: Partial<Record<ProviderId, string | undefined>> = {}): ProviderKey[] {
  const stored = getUserApiKeys();
  const prefs = getAiClientPrefs();
  const found: ProviderKey[] = [];
  for (const provider of PROVIDER_ORDER) {
    const explicit = override[provider]?.trim();
    const saved = (stored[provider] || '').trim();
    const enabledFlag = stored[`${provider}Enabled` as keyof typeof stored];
    const key = explicit || (enabledFlag === false ? '' : saved);
    if (key) found.push({ provider, key });
  }
  if (prefs.preferred) found.sort((a, b) => (a.provider === prefs.preferred ? -1 : b.provider === prefs.preferred ? 1 : 0));
  return found;
}

export function hasAnyAiKey(): boolean { return availableProviders().length > 0; }

/* ---- calling a provider -------------------------------------------------------------------- */

export interface InlineFile { base64: string; mimeType: string }

export interface CallOptions {
  provider: ProviderId;
  key: string;
  prompt: string;
  system?: string;
  files?: InlineFile[];
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function statusToError(status: number, body: string, provider: ProviderId): AiError {
  const label = PROVIDERS[provider].label;
  const snippet = body.replace(/\s+/g, ' ').slice(0, 160);
  if (status === 401 || status === 403) return new AiError(`${label} rejected the key (${status}). Check it in Settings -> AI.`, 'auth', provider);
  if (status === 429) return new AiError(`${label} rate limit (429). Wait a little and try again.`, 'rate_limit', provider);
  if (status === 400 && /api key|api_key|invalid/i.test(body)) return new AiError(`${label} refused the request: ${snippet}`, 'auth', provider);
  if (status >= 500) return new AiError(`${label} is temporarily unavailable (${status}).`, 'unavailable', provider);
  return new AiError(`${label} error ${status}: ${snippet}`, 'bad_response', provider);
}

export async function callProvider(opts: CallOptions): Promise<string> {
  const { provider, key, prompt, system, files = [], timeoutMs = 60_000 } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  const model = opts.model || modelFor(provider);

  if (files.length && provider !== 'gemini') {
    throw new AiError('Reading PDFs or images needs a Google Gemini key. Paste the text instead, or add a Gemini key.', 'unsupported', provider);
  }

  let url: string;
  let headers: Record<string, string>;
  let body: unknown;

  switch (provider) {
    case 'gemini':
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
      body = {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }, ...files.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } }))] }],
        generationConfig: { temperature: 0.4 },
      };
      break;
    case 'anthropic':
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      };
      body = { model, max_tokens: 4096, temperature: 0.4, ...(system ? { system } : {}), messages: [{ role: 'user', content: prompt }] };
      break;
    case 'openai':
      url = 'https://api.openai.com/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
      body = { model, temperature: 0.4, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] };
      break;
    case 'cohere':
      url = 'https://api.cohere.com/v2/chat';
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
      body = { model, temperature: 0.4, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] };
      break;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  } catch (err) {
    const aborted = err instanceof Error && /abort/i.test(err.name + err.message);
    throw new AiError(aborted ? `${PROVIDERS[provider].label} took too long to answer.` : 'No internet connection - AI needs to be online.', aborted ? 'timeout' : 'network', provider);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw statusToError(res.status, await res.text().catch(() => ''), provider);

  let data: any;
  try { data = await res.json(); } catch { throw new AiError(`${PROVIDERS[provider].label} sent an unreadable answer.`, 'bad_response', provider); }

  let text = '';
  if (provider === 'gemini') text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
  else if (provider === 'anthropic') text = (data?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  else if (provider === 'openai') text = data?.choices?.[0]?.message?.content ?? '';
  else text = (data?.message?.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');

  if (!text.trim()) throw new AiError(`${PROVIDERS[provider].label} returned an empty answer.`, 'bad_response', provider);
  return text;
}

/** Cheap "does this key work?" probe used by Settings. */
export async function testProviderKey(provider: ProviderId, key: string, fetchImpl?: typeof fetch): Promise<{ ok: boolean; message: string }> {
  try {
    await callProvider({ provider, key, prompt: 'Reply with the single word: ok', timeoutMs: 20_000, fetchImpl });
    return { ok: true, message: `${PROVIDERS[provider].label} key works.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Key test failed.' };
  }
}

/* ---- try providers in order ---------------------------------------------------------------- */

export interface FallbackOptions<T> {
  providers: ProviderKey[];
  attempt: (p: ProviderKey) => Promise<T>;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Retries rate-limit/unavailable errors with back-off, then moves on to the next provider. */
export async function withFallback<T>({ providers, attempt, retries = 2, sleep = ms => new Promise(r => setTimeout(r, ms)) }: FallbackOptions<T>): Promise<{ value: T; provider: ProviderId }> {
  if (providers.length === 0) throw new AiError('Add an AI key in Settings -> AI to use this feature without the cloud backend.', 'no_key');
  let last: unknown = null;
  for (const p of providers) {
    for (let i = 0; i <= retries; i++) {
      try {
        return { value: await attempt(p), provider: p.provider };
      } catch (err) {
        last = err;
        const code = err instanceof AiError ? err.code : null;
        if ((code === 'rate_limit' || code === 'unavailable') && i < retries) { await sleep(1500 * (i + 1)); continue; }
        break;
      }
    }
  }
  throw last instanceof Error ? last : new AiError('AI request failed.', 'bad_response');
}
