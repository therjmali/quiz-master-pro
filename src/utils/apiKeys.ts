// User-provided API keys — stored in localStorage (never sent to Zite servers)

export interface UserApiKeys {
  gemini?: string;
  cohere?: string;
  openai?: string;
  anthropic?: string;
  geminiEnabled?: boolean;  // true by default when key exists
  cohereEnabled?: boolean;
  openaiEnabled?: boolean;
  anthropicEnabled?: boolean;
}

const STORAGE_KEY = 'qmp_user_api_keys';

export function getUserApiKeys(): UserApiKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveUserApiKeys(keys: UserApiKeys): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function maskKey(key: string): string {
  if (!key || key.length < 8) return '••••••••••••';
  return key.slice(0, 6) + '•'.repeat(8) + key.slice(-4);
}

export type ApiProvider = 'gemini_user' | 'cohere' | 'openai' | 'anthropic' | 'system';

export function getActiveProvider(keys: UserApiKeys): ApiProvider {
  if (keys.gemini?.trim() && keys.geminiEnabled !== false) return 'gemini_user';
  if (keys.cohere?.trim() && keys.cohereEnabled !== false) return 'cohere';
  if (keys.openai?.trim() && keys.openaiEnabled !== false) return 'openai';
  if (keys.anthropic?.trim() && keys.anthropicEnabled !== false) return 'anthropic';
  return 'system';
}

export function isKeyEnabled(keys: UserApiKeys, id: 'gemini' | 'cohere' | 'openai' | 'anthropic'): boolean {
  const enabledField = `${id}Enabled` as keyof UserApiKeys;
  const val = keys[enabledField];
  // Default to true if not explicitly set to false
  return val !== false;
}

export const PROVIDER_INFO: Record<ApiProvider, { label: string; color: string; badge: string }> = {
  gemini_user: { label: 'Gemini AI (Your Key)', color: 'text-blue-400', badge: 'bg-blue-500/20 border-blue-500/30' },
  cohere:      { label: 'Cohere AI (Your Key)', color: 'text-violet-400', badge: 'bg-violet-500/20 border-violet-500/30' },
  openai:      { label: 'ChatGPT / OpenAI (Your Key)', color: 'text-emerald-400', badge: 'bg-emerald-500/20 border-emerald-500/30' },
  anthropic:   { label: 'Anthropic Claude (Your Key)', color: 'text-orange-400', badge: 'bg-orange-500/20 border-orange-500/30' },
  system:      { label: 'Gemini AI (System Default)', color: 'text-white/50', badge: 'bg-white/5 border-white/10' },
};
