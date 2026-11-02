import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { cleanExplanationBlock } from '../lib/rationaleFormat';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function isRateLimitErr(msg: string) {
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') || msg.includes('rate') || msg.includes('spending cap') ||
    msg.includes('overloaded');
}

const SYSTEM_PROMPT = [
  'You are an expert exam tutor giving concise, accurate, exam-focused explanations.',
  '',
  'Write 2 to 3 short plain-text points. No emojis, no symbols, no bullet characters, no markdown, no bold. Each point is one or two sentences.',
  '',
  'Put each point on its own line. Do not add headings, labels, numbering, introductions or closing remarks.',
  'Be factual and direct. Never invent facts.',
].join('\n');

async function callAnthropic(prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ZITE_ANTHROPIC_ACCESS_TOKEN! });
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}

async function callGemini(key: string, prompt: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 400, temperature: 0.2 },
    systemInstruction: SYSTEM_PROMPT,
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.25,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callCohere(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ model: 'command-r-plus', messages: [{ role: 'user', content: SYSTEM_PROMPT + '\n\n' + prompt }] }),
  });
  if (!res.ok) throw new Error(`Cohere error ${res.status}`);
  const data = await res.json();
  return data.message?.content?.[0]?.text || '';
}

function buildPrompt(
  question: string,
  correctAnswer: string,
  userAnswer: string | undefined,
  options: string[] | undefined,
  status: 'correct' | 'wrong' | 'skipped'
): string {
  const optionsBlock = options?.length
    ? `\nAll Options:\n${options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}`
    : '';

  const base = `Question: "${question}"${optionsBlock}\nCorrect Answer: "${correctAnswer}"`;

  if (status === 'wrong' && userAnswer) {
    return `${base}\nStudent answered: "${userAnswer}" (wrong)\n\nExplain concisely why "${correctAnswer}" is correct, and why "${userAnswer}" is wrong. Mention the student's choice in one point.`;
  }
  if (status === 'skipped') {
    return `${base}\nStudent skipped.\n\nExplain concisely why "${correctAnswer}" is correct.`;
  }
  return `${base}\n\nExplain concisely why "${correctAnswer}" is correct.`;
}

export default createEndpoint({
  description: 'Generate a premium AI explanation — primary: Claude (Anthropic) → fallback: Gemini → OpenAI → Cohere',
  inputSchema: z.object({
    question: z.string(),
    correctAnswer: z.string(),
    userAnswer: z.string().optional(),
    options: z.array(z.string()).optional(),
    status: z.enum(['correct', 'wrong', 'skipped']),
    style: z.enum(['normal', 'simple']).optional(),
    userGeminiKey: z.string().optional(),
    userCohereKey: z.string().optional(),
    userOpenaiKey: z.string().optional(),
  }),
  outputSchema: z.object({
    rationale: z.string(),
    provider: z.string().optional(),
  }),
  execute: async ({ input }) => {
    let prompt = buildPrompt(input.question, input.correctAnswer, input.userAnswer, input.options, input.status);
    if (input.style === 'simple') {
      prompt = `Question: "${input.question}"\nCorrect Answer: "${input.correctAnswer}"\n\nExplain this answer like I'm 5 years old. Use super simple words, a fun analogy or comparison, and keep it to 2 to 3 very short plain-text points, one per line. No emojis, no symbols, no bullet characters, no markdown, no bold.`;
    }

    const systemGeminiKey = process.env.ZITE_GEMINI_ACCESS_TOKEN!;
    const userGemini = input.userGeminiKey?.trim();
    const userOpenAI = input.userOpenaiKey?.trim();
    const userCohere = input.userCohereKey?.trim();

    const providers: Array<{ name: string; fn: () => Promise<string> }> = [
      { name: 'claude', fn: () => callAnthropic(prompt) },
      ...(userGemini ? [{ name: 'gemini_user', fn: () => callGemini(userGemini, prompt) }] : []),
      ...(userOpenAI ? [{ name: 'openai', fn: () => callOpenAI(userOpenAI, prompt) }] : []),
      { name: 'gemini_system', fn: () => callGemini(systemGeminiKey, prompt) },
      ...(userCohere ? [{ name: 'cohere', fn: () => callCohere(userCohere, prompt) }] : []),
    ];

    let lastError: Error = new Error('Failed to get explanation');

    for (const provider of providers) {
      let tries = 0;
      const maxTries = provider.name.startsWith('claude') ? 3 : 2;
      while (tries < maxTries) {
        try {
          const text = await provider.fn();
          const clean = cleanExplanationBlock(text);
          if (clean) return { rationale: clean, provider: provider.name };
          break;
        } catch (err: any) {
          lastError = err;
          const msg = String(err?.message || '');
          if (isRateLimitErr(msg)) {
            tries++;
            if (tries < maxTries) { await sleep(2000 * tries); continue; }
            break;
          }
          if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
            tries++;
            if (tries < maxTries) { await sleep(1500); continue; }
            break;
          }
          break;
        }
      }
    }

    throw new Error('AI explanation unavailable. Please try again shortly.');
  },
});
