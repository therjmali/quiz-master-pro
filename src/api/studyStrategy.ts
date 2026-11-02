import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import Anthropic from '@anthropic-ai/sdk';

export default createEndpoint({
  description: 'Generate a personalized 3-paragraph AI study strategy from lifetime quiz stats',
  authenticated: true,
  inputSchema: z.object({
    totalQuizzes: z.number(),
    totalQuestions: z.number(),
    correctCount: z.number(),
    wrongCount: z.number(),
    skippedCount: z.number(),
    avgAccuracy: z.number(),
    bestScore: z.number(),
    streak: z.number(),
    totalTimeSec: z.number(),
    weakSubjects: z.array(z.string()).optional(),
    strongSubjects: z.array(z.string()).optional(),
    recentTrend: z.enum(['improving', 'declining', 'stable', 'unknown']),
  }),
  outputSchema: z.object({
    strategy: z.string(),
  }),
  execute: async ({ input }) => {
    const prompt = `You are an expert study coach. Based on this student's quiz performance data, write a personalized 3-paragraph study strategy. Be specific, actionable, and encouraging.

STUDENT DATA:
- Total Quizzes: ${input.totalQuizzes}
- Total Questions Attempted: ${input.totalQuestions}
- Correct: ${input.correctCount} | Wrong: ${input.wrongCount} | Skipped: ${input.skippedCount}
- Overall Accuracy: ${input.avgAccuracy}%
- Best Score: ${input.bestScore}%
- Current Streak: ${input.streak} day(s)
- Total Study Time: ${Math.round(input.totalTimeSec / 60)} minutes
- Recent Trend: ${input.recentTrend}
${input.weakSubjects?.length ? `- Weak Subjects: ${input.weakSubjects.join(', ')}` : ''}
${input.strongSubjects?.length ? `- Strong Subjects: ${input.strongSubjects.join(', ')}` : ''}

FORMAT:
**Paragraph 1 — Current Standing:** Analyze their performance honestly. Highlight strengths and areas for improvement.
**Paragraph 2 — Focused Strategy:** Give specific study techniques based on their weak areas. Mention spaced repetition, practice timing, and mistake review.
**Paragraph 3 — Action Plan:** Give a concrete weekly plan (e.g., "Take 2 quizzes daily focusing on X, review mistakes every evening").

Keep it under 250 words. Use bold for key terms. Be motivating but realistic.`;

    // Try Gemini first, fallback to Anthropic
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.ZITE_GEMINI_ACCESS_TOKEN);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text?.trim()) return { strategy: text.trim() };
    } catch {
      // Gemini failed, fall through to Anthropic
    }

    const client = new Anthropic({ apiKey: process.env.ZITE_ANTHROPIC_ACCESS_TOKEN });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    if (!text?.trim()) throw new Error('Could not generate strategy. Try again.');
    return { strategy: text.trim() };
  },
});
