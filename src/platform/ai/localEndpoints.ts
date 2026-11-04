/**
 * In-app implementations of the AI endpoints, used when there is no backend (the standalone
 * GitHub / APK build) or the backend is unreachable. They reuse the very same prompts and parsers as
 * the server versions (src/lib/aiPrompts.ts), so questions and explanations look identical.
 */
import { buildExplainPrompt, buildQuizSystemPrompt, buildSimpleExplainPrompt, EXPLAIN_SYSTEM_PROMPT, extractJsonArray, validateAndMap } from '../../lib/aiPrompts';
import { cleanExplanationBlock } from '../../lib/rationaleFormat';
import { AiError, availableProviders, callProvider, withFallback, type InlineFile, type ProviderId } from './providers';

interface KeyOverrides { userGeminiKey?: string; userCohereKey?: string; userOpenaiKey?: string; userAnthropicKey?: string }

function overrides(input: KeyOverrides): Partial<Record<ProviderId, string | undefined>> {
  return { gemini: input.userGeminiKey, cohere: input.userCohereKey, openai: input.userOpenaiKey, anthropic: input.userAnthropicKey };
}

export interface GenerateQuizInput extends KeyOverrides {
  text?: string;
  files?: InlineFile[];
  difficulty?: string;
}

export async function localGenerateQuiz(input: GenerateQuizInput, fetchImpl?: typeof fetch) {
  const hasFiles = (input.files?.length ?? 0) > 0;
  let providers = availableProviders(overrides(input));
  if (hasFiles) {
    providers = providers.filter(p => p.provider === 'gemini');
    if (providers.length === 0) throw new AiError('Reading PDFs or images needs a Google Gemini key. Paste the text instead, or add a Gemini key in Settings -> AI.', 'unsupported');
  }
  const system = buildQuizSystemPrompt(input.difficulty || 'all');
  const content = input.text || 'Generate MCQs from the attached file(s).';
  const { value, provider } = await withFallback({
    providers,
    attempt: async p => {
      const text = await callProvider({ provider: p.provider, key: p.key, system, prompt: `Content:\n${content}`, files: input.files, fetchImpl });
      const questions = validateAndMap(extractJsonArray(text));
      if (questions.length === 0) throw new AiError('No valid questions found. Try different content or paste MCQs directly.', 'bad_response', p.provider);
      return questions;
    },
  });
  return { questions: value, provider: `${provider}_device` };
}

export interface ExplainInput extends KeyOverrides {
  question: string;
  correctAnswer: string;
  userAnswer?: string;
  options?: string[];
  status: 'correct' | 'wrong' | 'skipped';
  style?: 'normal' | 'simple';
}

export async function localExplainQuestion(input: ExplainInput, fetchImpl?: typeof fetch) {
  const prompt = input.style === 'simple'
    ? buildSimpleExplainPrompt(input.question, input.correctAnswer)
    : buildExplainPrompt(input.question, input.correctAnswer, input.userAnswer, input.options, input.status);
  const { value, provider } = await withFallback({
    providers: availableProviders(overrides(input)),
    attempt: async p => {
      const text = await callProvider({ provider: p.provider, key: p.key, system: EXPLAIN_SYSTEM_PROMPT, prompt, fetchImpl });
      const clean = cleanExplanationBlock(text);
      if (!clean) throw new AiError('The AI answer was empty.', 'bad_response', p.provider);
      return clean;
    },
  });
  return { rationale: value, provider: `${provider}_device` };
}

export const LOCAL_ENDPOINTS: Record<string, (input: never) => Promise<unknown>> = {
  generateQuiz: localGenerateQuiz as (input: never) => Promise<unknown>,
  explainQuestion: localExplainQuestion as (input: never) => Promise<unknown>,
};
