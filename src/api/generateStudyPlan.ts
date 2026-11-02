import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default createEndpoint({
  description: 'Generate an AI-powered study plan based on weak topics and exam date',
  authenticated: true,
  inputSchema: z.object({
    weakTopics: z.array(z.object({
      subject: z.string(),
      accuracy: z.number(),
      totalQuestions: z.number(),
    })),
    examDate: z.string().optional(),
    hoursPerDay: z.number().default(2),
    totalQuizzes: z.number(),
    averageScore: z.number(),
  }),
  outputSchema: z.object({
    plan: z.array(z.object({
      day: z.number(),
      date: z.string(),
      subject: z.string(),
      activity: z.string(),
      duration: z.string(),
      priority: z.string(),
    })),
    summary: z.string(),
    tips: z.array(z.string()),
  }),
  async execute({ input }) {
    const genAI = new GoogleGenerativeAI(process.env.ZITE_GEMINI_ACCESS_TOKEN);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const daysUntilExam = input.examDate
      ? Math.max(1, Math.ceil((new Date(input.examDate).getTime() - Date.now()) / 86400000))
      : 14;

    const topicsList = input.weakTopics
      .map(t => `- ${t.subject}: ${t.accuracy}% accuracy (${t.totalQuestions} questions attempted)`)
      .join('\n');

    const prompt = `You are a study planner for a nursing exam student. Create a ${Math.min(daysUntilExam, 14)}-day study plan.

Student profile:
- Average quiz score: ${input.averageScore}%
- Total quizzes completed: ${input.totalQuizzes}
- Available study time: ${input.hoursPerDay} hours/day
- Days until exam: ${daysUntilExam}

Weak topics (need most focus):
${topicsList || '- No specific weak topics identified yet'}

Rules:
1. Prioritize weak topics (below 60% accuracy) heavily
2. Include review sessions for stronger topics too
3. Mix difficulty levels throughout the week
4. Add rest/light review days
5. Include practice quiz sessions

Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "plan": [
    {"day": 1, "date": "${new Date().toISOString().split('T')[0]}", "subject": "CHN Unit 3", "activity": "Focus study: 30 practice questions + review wrong answers", "duration": "2h", "priority": "high"}
  ],
  "summary": "Brief 2-sentence summary of the plan strategy",
  "tips": ["tip1", "tip2", "tip3"]
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        plan: [{
          day: 1,
          date: new Date().toISOString().split('T')[0],
          subject: input.weakTopics[0]?.subject || 'General Review',
          activity: 'Practice 30 questions on weak topics',
          duration: `${input.hoursPerDay}h`,
          priority: 'high',
        }],
        summary: 'Focus on your weakest topics first, then review stronger areas.',
        tips: ['Start with weak topics', 'Take breaks every 45 minutes', 'Review mistakes immediately'],
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      plan: (parsed.plan || []).slice(0, 14).map((p: any, i: number) => ({
        day: p.day || i + 1,
        date: p.date || new Date(Date.now() + i * 86400000).toISOString().split('T')[0],
        subject: String(p.subject || 'General'),
        activity: String(p.activity || 'Study session'),
        duration: String(p.duration || '1h'),
        priority: String(p.priority || 'medium'),
      })),
      summary: String(parsed.summary || 'Study plan generated based on your performance data.'),
      tips: (parsed.tips || []).slice(0, 5).map(String),
    };
  },
});
