import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';

const historyRecord = z.object({
  id: z.string(),
  questionPreview: z.string().optional(),
  score: z.number().optional(),
  maxScore: z.number().optional(),
  percentage: z.number().optional(),
  totalQuestions: z.number().optional(),
  correctCount: z.number().optional(),
  wrongCount: z.number().optional(),
  skippedCount: z.number().optional(),
  timeTakenSeconds: z.number().optional(),
  quizDataJson: z.string().optional(),
  userAnswersJson: z.string().optional(),
  difficulty: z.string().optional(),
  createdAt: z.string().optional(),
  quizTitle: z.string().optional(),
  subject: z.string().optional(),
  gain: z.number().optional(),
  penalty: z.number().optional(),
});

export default createEndpoint({
  description: 'Get trashed quiz history for the authenticated user',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ records: z.array(historyRecord) }),
  execute: async ({ context }) => {
    await enrichCurrentUser(context);
    const result = await zite.quizHistory.findAll({
      filters: { userEmail: context.user!.email, isTrashed: true },
      limit: 200,
    });
    const sorted = [...result.records].sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
    return {
      records: sorted.map(r => ({
        id: r.id, questionPreview: r.questionPreview,
        score: r.score, maxScore: r.maxScore, percentage: r.percentage,
        totalQuestions: r.totalQuestions, correctCount: r.correctCount,
        wrongCount: r.wrongCount, skippedCount: r.skippedCount,
        timeTakenSeconds: r.timeTakenSeconds, quizDataJson: r.quizDataJson,
        userAnswersJson: r.userAnswersJson, difficulty: r.difficulty,
        createdAt: r.createdAt, quizTitle: r.quizTitle, subject: r.subject,
        gain: r.gain, penalty: r.penalty,
      })),
    };
  },
});
