import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default createEndpoint({
  description: 'AI-verify if a question answer is correct',
  inputSchema: z.object({
    question: z.string(),
    options: z.array(z.string()),
    markedCorrectAnswer: z.string(),
    disputeReason: z.string().optional(),
  }),
  outputSchema: z.object({
    verdict: z.enum(['confirmed', 'disputed', 'incorrect']),
    verdictText: z.string(),
    confidence: z.number(),
    suggestedAnswer: z.string().optional(),
  }),
  execute: async ({ input }) => {
    const genAI = new GoogleGenerativeAI(process.env.ZITE_GEMINI_ACCESS_TOKEN!);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
    });

    const prompt = `You are a fact-checker for exam questions. Verify if the marked correct answer is actually correct.

QUESTION: ${input.question}
OPTIONS:
${input.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}
MARKED CORRECT: ${input.markedCorrectAnswer}
${input.disputeReason ? `DISPUTE REASON: ${input.disputeReason}` : ''}

IMPORTANT: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no extra text.
The JSON must have this exact structure:
{"verdict": "confirmed", "verdictText": "explanation here", "confidence": 85, "suggestedAnswer": "option text if different"}

- verdict must be one of: "confirmed", "disputed", "incorrect"
- confidence must be a number 0-100
- suggestedAnswer is optional, include only if the answer is wrong

Respond with ONLY the JSON object:`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      // Try to extract JSON from the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { verdict: 'confirmed' as const, verdictText: 'Could not parse AI response. The answer may be correct.', confidence: 50 };
      }
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        verdict: ['confirmed', 'disputed', 'incorrect'].includes(parsed.verdict) ? parsed.verdict : 'confirmed',
        verdictText: String(parsed.verdictText || 'Unable to determine'),
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
        suggestedAnswer: parsed.suggestedAnswer ? String(parsed.suggestedAnswer) : undefined,
      };
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      if (msg.includes('quota') || msg.includes('limit')) {
        throw new Error('AI quota exceeded. Please try again later.');
      }
      if (msg.includes('timed out') || msg.includes('timeout')) {
        throw new Error('Verification timed out. Please try again.');
      }
      throw new Error(`Verification failed: ${msg.slice(0, 150)}`);
    }
  },
});
