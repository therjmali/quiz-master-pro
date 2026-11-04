import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractJsonArray, isRateLimitErr, validateAndMap, buildQuizSystemPrompt } from '../lib/aiPrompts';

// ─── Helpers ─────────────────────────────────────────────────────────────────


const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));





// ─── Provider: Gemini ─────────────────────────────────────────────────────────
async function callGemini(apiKey: string, prompt: string, parts: any[]): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 8192, temperature: 0.4 },
  });
  const allParts = [{ text: prompt }, ...parts];
  const result = await model.generateContent({ contents: [{ role: 'user', parts: allParts }] });
  return result.response.text();
}

// ─── Provider: Cohere ─────────────────────────────────────────────────────────
async function callCohere(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      model: 'command-r-plus',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cohere error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.message?.content?.[0]?.text || data.text || '';
}

// ─── Provider: OpenAI ─────────────────────────────────────────────────────────
async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8192,
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────
export default createEndpoint({
  description: 'Generate quiz questions using AI (Gemini / Cohere / OpenAI)',
  inputSchema: z.object({
    text: z.string().optional(),
    files: z.array(z.object({ base64: z.string(), mimeType: z.string() })).optional(),
    difficulty: z.string().default('all'),
    // Optional user-provided API keys (only used in "Custom Key" mode)
    userGeminiKey: z.string().optional(),
    userCohereKey: z.string().optional(),
    userOpenaiKey: z.string().optional(),
  }),
  outputSchema: z.object({
    questions: z.array(z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctAnswer: z.string(),
      difficulty: z.string(),
      rationale: z.string().optional(),
      topic: z.string().optional(),
      subject: z.string().optional(),
      questionType: z.string().optional(),
    })),
    provider: z.string().optional(),
  }),
  execute: async ({ input }) => {
    const systemPrompt = buildQuizSystemPrompt(input.difficulty);

    const userContent = input.text || 'Generate MCQs from the attached file(s).';
    const fullPrompt = `${systemPrompt}\n\nContent:\n${userContent}`;
    const fileParts = (input.files || []).map(f => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } }));

    // Priority order:
    // 1. User's own Gemini key (Custom Key mode)
    // 2. User's own OpenAI key (Custom Key mode)
    // 3. User's own Cohere key (Custom Key mode)
    // 4. System Gemini key — ALWAYS available (Zite AI mode & fallback)
    const userGemini = input.userGeminiKey?.trim();
    const userOpenAI = input.userOpenaiKey?.trim();
    const userCohere = input.userCohereKey?.trim();
    const systemGeminiKey = process.env.ZITE_GEMINI_ACCESS_TOKEN!;

    type Provider = { name: string; fn: () => Promise<string> };
    const providers: Provider[] = [
      // User's custom Gemini (if provided)
      ...(userGemini ? [{ name: 'gemini_user', fn: () => callGemini(userGemini, fullPrompt, fileParts) }] : []),
      // User's OpenAI (if provided)
      ...(userOpenAI ? [{ name: 'openai', fn: () => callOpenAI(userOpenAI, fullPrompt) }] : []),
      // User's Cohere (if provided)
      ...(userCohere ? [{ name: 'cohere', fn: () => callCohere(userCohere, fullPrompt) }] : []),
      // System Gemini — always available as primary/fallback
      { name: 'gemini_system', fn: () => callGemini(systemGeminiKey, fullPrompt, fileParts) },
    ];

    const MAX_TRIES = 3;
    let lastError: Error = new Error('Generation failed');

    for (const provider of providers) {
      for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        try {
          const responseText = await provider.fn();
          const questions = validateAndMap(extractJsonArray(responseText));
          if (questions.length === 0) throw new Error('No valid questions found. Try different content or paste MCQs directly.');
          return { questions, provider: provider.name };
        } catch (err: any) {
          lastError = err;
          const msg = String(err?.message || '');

          if (isRateLimitErr(msg)) {
            const delays = [2000, 5000, 12000];
            if (attempt < MAX_TRIES - 1) { await sleep(delays[attempt] ?? 5000); continue; }
            break; // try next provider
          }
          if (msg.includes('503') || msg.includes('overloaded') || msg.includes('UNAVAILABLE')) {
            if (attempt < MAX_TRIES - 1) { await sleep(2000 * (attempt + 1)); continue; }
            break;
          }
          if (msg.includes('DEADLINE') || msg.includes('timeout')) {
            if (attempt < MAX_TRIES - 1) { await sleep(1500); continue; }
            break;
          }
          // Non-retryable
          break;
        }
      }
    }

    // All providers failed
    const msg = String(lastError?.message || '');
    if (isRateLimitErr(msg)) {
      throw new Error(
        '⏳ AI is temporarily busy (rate limit). Please wait 15–30 seconds and try again.\n' +
        'Or paste MCQs in the required format (Q1(E). Question · (a)–(d) · Answer - (b) text · • explanation) for instant offline loading.'
      );
    }
    throw lastError;
  },
});
