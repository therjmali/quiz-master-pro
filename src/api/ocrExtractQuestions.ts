import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default createEndpoint({
  description: 'Extract MCQ questions from a photo using Gemini Vision OCR',
  authenticated: true,
  inputSchema: z.object({
    imageBase64: z.string(),
    mimeType: z.string().default('image/jpeg'),
  }),
  outputSchema: z.object({
    questions: z.array(z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctAnswer: z.string(),
      difficulty: z.string(),
      rationale: z.string().optional(),
      questionType: z.string().optional(),
    })),
    rawText: z.string(),
  }),
  async execute({ input }) {
    const genAI = new GoogleGenerativeAI(process.env.ZITE_GEMINI_ACCESS_TOKEN);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an OCR and quiz extraction expert. Analyze this image of a textbook page or question paper.

Extract ALL multiple-choice questions (MCQs) you can find. For each question:
1. Extract the full question text
2. Extract all answer options (A, B, C, D)
3. If the correct answer is marked/highlighted, identify it. If not, make your best educated guess based on the subject matter.
4. Classify difficulty as "easy", "medium", or "hard"
5. If possible, provide a brief rationale for the correct answer
6. Auto-detect questionType — classify into the most specific academic/medical discipline (e.g. Pharmacology, Anatomy, Pathology, Surgery, Medicine, Biochemistry, Microbiology, Physiology, etc.)

Return ONLY valid JSON (no markdown, no code blocks):
{
  "questions": [
    {
      "question": "The full question text",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correctAnswer": "The correct option text (must match one of the options exactly)",
      "difficulty": "medium",
      "rationale": "Brief explanation why this is correct",
      "questionType": "Detected discipline like Pharmacology, Anatomy, etc."
    }
  ],
  "rawText": "The full OCR text extracted from the image"
}

If no MCQs are found, extract the text content and generate relevant MCQs from it.
If the image is unclear, do your best to extract what you can.`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: input.mimeType,
          data: input.imageBase64,
        },
      },
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return { questions: [], rawText: text };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const questions = (parsed.questions || []).map((q: any) => ({
      question: String(q.question || ''),
      options: (q.options || []).map(String).filter((o: string) => o.length > 0),
      correctAnswer: String(q.correctAnswer || q.options?.[0] || ''),
      difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
      rationale: q.rationale ? String(q.rationale) : undefined,
      questionType: q.questionType ? String(q.questionType).trim() : undefined,
    })).filter((q: any) => q.question && q.options.length >= 2);

    return {
      questions,
      rawText: String(parsed.rawText || text.slice(0, 500)),
    };
  },
});
