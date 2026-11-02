import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import Anthropic from '@anthropic-ai/sdk';

export default createEndpoint({
  description: 'Generate a condensed revision sheet from wrong answers',
  inputSchema: z.object({
    wrongQuestions: z.array(z.object({
      question: z.string(),
      correctAnswer: z.string(),
      userAnswer: z.string().optional(),
      rationale: z.string().optional(),
    })),
    subject: z.string().optional(),
    quizTitle: z.string().optional(),
  }),
  outputSchema: z.object({
    revisionSheet: z.string(),
  }),
  execute: async ({ input }) => {
    const questionsText = input.wrongQuestions.map((q, i) =>
      `Q${i + 1}: ${q.question}\nCorrect Answer: ${q.correctAnswer}${q.userAnswer ? `\nStudent Picked: ${q.userAnswer}` : ''}${q.rationale ? `\nRationale: ${q.rationale}` : ''}`
    ).join('\n\n');

    const subjectLine = input.subject ? `Subject: ${input.subject}` : '';
    const quizLine = input.quizTitle ? `Quiz: ${input.quizTitle}` : '';

    const prompt = `You are an expert tutor creating a CONCISE REVISION SHEET for a student who got these questions wrong.

${subjectLine}
${quizLine}
Total wrong: ${input.wrongQuestions.length}

WRONG QUESTIONS:
${questionsText}

FORMAT RULES — FOLLOW EXACTLY:
- Use proper markdown formatting throughout
- Every bullet point MUST be on its own line
- Leave a blank line before every heading (### )
- Bold key terms with **double asterisks**
- Keep each bullet to 1-2 lines maximum — exam-focused, not verbose

PRODUCE THIS EXACT STRUCTURE:

## 📝 Quick Revision Sheet

### 📌 Key Facts

Write each concept the student got wrong as a bullet point. Start each bullet with the **key term** in bold, followed by a dash and a clear 1-line explanation.

Group related facts together. Put a blank line between groups.

Example format:
- **Vaginal pH** — Normal range is 3.8–4.5 (acidic), maintained by lactobacilli
- **Bacterial Vaginosis** — Associated with elevated pH above 4.5

### 🧠 Memory Aids

Create 2-3 memorable mnemonics or memory tricks for the hardest concepts. Format each one as:

- **MNEMONIC PHRASE** — What it helps you remember: explanation

### ❌ Common Mistakes

For each wrong answer the student gave, explain WHY it was wrong in 1 line:

- Q1: You picked "X" — this is wrong because [reason]. The answer is **Y** because [reason].

### ⚡ Quick Recall

Bullet-point summary of the MOST critical facts (max 8 bullets). Each line:

- **Term** — one-line definition or fact

---

> 💡 Focus on the ❌ mistakes section to understand your errors, then memorize the ⚡ Quick Recall points.

IMPORTANT: Output ONLY the markdown. No extra commentary. No code blocks. Keep it concise and scannable.`;

    // Try Gemini first, fallback to Anthropic
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.ZITE_GEMINI_ACCESS_TOKEN);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text) return { revisionSheet: text };
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
    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    return { revisionSheet: text };
  },
});
