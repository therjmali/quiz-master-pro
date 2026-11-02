import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import Anthropic from '@anthropic-ai/sdk';

export default createEndpoint({
  description: 'Generate professional AI revision notes from bookmarked questions using Anthropic Claude',
  inputSchema: z.object({
    questions: z.array(z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctAnswer: z.string(),
      rationale: z.string().optional(),
      difficulty: z.string().optional(),
    })),
    subject: z.string().optional(),
    quizTitle: z.string().optional(),
  }),
  outputSchema: z.object({ notes: z.string() }),
  async execute({ input }) {
    const qList = input.questions.map((q, i) =>
      `Q${i + 1}: ${q.question}\nAnswer: ${q.correctAnswer}${q.rationale ? `\nRationale: ${q.rationale}` : ''}${q.difficulty ? `\nDifficulty: ${q.difficulty}` : ''}`
    ).join('\n\n');

    const prompt = `You are a professional study notes generator. Given these ${input.questions.length} quiz questions${input.subject ? ` from "${input.subject}"` : ''}${input.quizTitle ? ` (Quiz: "${input.quizTitle}")` : ''} and their correct answers, generate concise, exam-focused revision notes.

RULES:
1. Organize by topic/concept clusters (not question-by-question)
2. Use clear bullet points with bold key terms
3. Include mnemonics or memory aids where helpful
4. Add "⚠️ Common Mistake" callouts for tricky concepts
5. Keep it concise — exam revision style, not textbook
6. Use markdown formatting (## headings, **bold**, - bullets)
7. End with a "🎯 Quick Recall Checklist" of the most important points

QUESTIONS:
${qList}

Generate the revision notes now:`;

    // Try Gemini first, fallback to Anthropic
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.ZITE_GEMINI_ACCESS_TOKEN);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const notes = result.response.text();
      if (notes) return { notes };
    } catch {
      // Gemini failed, fall through to Anthropic
    }

    // Fallback: Anthropic Claude
    const client = new Anthropic({ apiKey: process.env.ZITE_ANTHROPIC_ACCESS_TOKEN });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    const notes = message.content[0].type === 'text' ? message.content[0].text : '';
    return { notes };
  },
});
