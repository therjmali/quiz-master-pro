/**
 * Create Quiz → AI Generation: which saved API keys can be offered.
 * Pure helpers (unit-tested). Only keys the user really saved (and did not switch off) are listed.
 */
import type { UserApiKeys } from './apiKeys';
import type { AIPrefs } from '../types/quiz';

export type KeyProvider = 'gemini' | 'anthropic' | 'openai' | 'cohere';

/** Short names shown as `🔑 Gemini`. */
export const KEY_PROVIDER_NAMES: Record<KeyProvider, string> = {
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  cohere: 'Cohere',
};

const ORDER: KeyProvider[] = ['gemini', 'anthropic', 'openai', 'cohere'];

export interface AiKeyChoice { id: KeyProvider; label: string }

/** Providers with a non-empty saved key that is not switched off, in a stable order. */
export function savedKeyChoices(keys: UserApiKeys): AiKeyChoice[] {
  return ORDER
    .filter(id => (keys[id] || '').trim() !== '' && keys[`${id}Enabled` as keyof UserApiKeys] !== false)
    .map(id => ({ id, label: `🔑 ${KEY_PROVIDER_NAMES[id]}` }));
}

/** The provider that is selected: the stored preference if it is still offered, else the first one. */
export function resolveSelected(choices: AiKeyChoice[], preferred: string | null): KeyProvider | null {
  if (!choices.length) return null;
  return choices.find(c => c.id === preferred)?.id ?? choices[0].id;
}

/** AI generation is ON when quiz generation is not 'off'. */
export function isAiOn(prefs: AIPrefs): boolean { return prefs.quizHelper !== 'off'; }

/** Switch AI generation on or off. ON uses your own saved key ('cloud'), OFF turns quiz and rationale AI off. */
export function withAiOn(prefs: AIPrefs, on: boolean): AIPrefs {
  return on ? { ...prefs, quizHelper: 'cloud', reportHelper: 'cloud' } : { ...prefs, quizHelper: 'off', reportHelper: 'off' };
}
