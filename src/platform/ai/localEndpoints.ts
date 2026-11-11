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


export interface RevisionInput extends KeyOverrides {
  wrongQuestions: { question: string; correctAnswer: string; userAnswer?: string; rationale?: string }[];
  subject?: string;
  quizTitle?: string;
}

/** Same prompt as the server endpoint (src/api/generateRevisionSheet.ts), run with the user's own key on the device. */
export function buildRevisionPrompt(input: RevisionInput): string {
  const questionsText = input.wrongQuestions.map((q, i) =>
    `Q${i + 1}: ${q.question}\nCorrect Answer: ${q.correctAnswer}${q.userAnswer ? `\nStudent Picked: ${q.userAnswer}` : ''}${q.rationale ? `\nRationale: ${q.rationale}` : ''}`).join('\n\n');
  return `You are an expert tutor creating a CONCISE REVISION SHEET for a student who got these questions wrong.

${input.subject ? `Subject: ${input.subject}` : ''}
${input.quizTitle ? `Quiz: ${input.quizTitle}` : ''}
Total wrong: ${input.wrongQuestions.length}

WRONG QUESTIONS:
${questionsText}

FORMAT RULES - FOLLOW EXACTLY:
- Use proper markdown formatting throughout
- Every bullet point MUST be on its own line
- Leave a blank line before every heading (### )
- Bold key terms with **double asterisks**
- Keep each bullet to 1-2 lines maximum - exam-focused, not verbose

PRODUCE THIS EXACT STRUCTURE:

## Quick Revision Sheet

### Key Facts

Write each concept the student got wrong as a bullet point. Start each bullet with the **key term** in bold, followed by a dash and a clear 1-line explanation. Group related facts together.

### Memory Aids

Create 2-3 memorable mnemonics or memory tricks for the hardest concepts. Format each one as:

- **MNEMONIC PHRASE** - What it helps you remember: explanation

### Common Mistakes

For each wrong answer the student gave, explain WHY it was wrong in 1 line:

- Q1: You picked "X" - this is wrong because [reason]. The answer is **Y** because [reason].

### Quick Recall

Bullet-point summary of the MOST critical facts (max 8 bullets). Each line:

- **Term** - one-line definition or fact

---

> Focus on the Common Mistakes section to understand your errors, then memorize the Quick Recall points.

IMPORTANT: Output ONLY the markdown. No extra commentary. No code blocks. Keep it concise and scannable.`;
}

export async function localGenerateRevisionSheet(input: RevisionInput, fetchImpl?: typeof fetch) {
  const prompt = buildRevisionPrompt(input);
  const { value } = await withFallback({
    providers: availableProviders(overrides(input)),
    attempt: async p => {
      const text = (await callProvider({ provider: p.provider, key: p.key, system: 'You are an expert exam tutor. Answer only with the requested markdown.', prompt, fetchImpl })).trim();
      if (!text) throw new AiError('The AI answer was empty.', 'bad_response', p.provider);
      return text.replace(/^```(?:markdown)?\s*|\s*```$/g, '');
    },
  });
  return { revisionSheet: value };
}

export const LOCAL_ENDPOINTS: Record<string, (input: never) => Promise<unknown>> = {
  generateQuiz: localGenerateQuiz as (input: never) => Promise<unknown>,
  explainQuestion: localExplainQuestion as (input: never) => Promise<unknown>,
  generateRevisionSheet: localGenerateRevisionSheet as (input: never) => Promise<unknown>,
};
