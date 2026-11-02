import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';

export default createEndpoint({
  description: 'Save a completed quiz result to the database',
  authenticated: true,
  inputSchema: z.object({
    quizDataJson: z.string(),
    userAnswersJson: z.string(),
    score: z.number(),
    maxScore: z.number(),
    percentage: z.number(),
    totalQuestions: z.number(),
    correctCount: z.number(),
    wrongCount: z.number(),
    skippedCount: z.number(),
    timeTakenSeconds: z.number(),
    questionPreview: z.string(),
    difficulty: z.string().optional(),
    quizTitle: z.string().optional(),
    subject: z.string().optional(),
    gain: z.number().optional(),
    penalty: z.number().optional(),
    localTimestamp: z.number().optional(),
    attemptType: z.string().optional(),
    attemptNumber: z.number().optional(),
    parentQuizId: z.string().optional(),
    notes: z.string().optional(),
  }),
  outputSchema: z.object({ id: z.string(), success: z.boolean() }),
  execute: async ({ input, context }) => {
    await enrichCurrentUser(context);
    // Dedup check: if localTimestamp exists, check for existing record with same timestamp + user
    if (input.localTimestamp) {
      const existing = await zite.quizHistory.findAll({
        filters: {
          userEmail: context.user!.email,
          localTimestamp: input.localTimestamp,
        },
        limit: 1,
        fields: ['id'],
      });
      if (existing.records.length > 0) {
        return { id: existing.records[0].id, success: true };
      }
    }

    const record = await zite.quizHistory.create({
      record: {
        questionPreview: input.questionPreview.slice(0, 200),
        score: input.score,
        maxScore: input.maxScore,
        percentage: input.percentage,
        totalQuestions: input.totalQuestions,
        correctCount: input.correctCount,
        wrongCount: input.wrongCount,
        skippedCount: input.skippedCount,
        timeTakenSeconds: input.timeTakenSeconds,
        quizDataJson: input.quizDataJson,
        userAnswersJson: input.userAnswersJson,
        difficulty: input.difficulty || 'Mixed',
        userEmail: context.user!.email,
        quizTitle: input.quizTitle || undefined,
        subject: input.subject || undefined,
        gain: input.gain,
        penalty: input.penalty,
        localTimestamp: input.localTimestamp || Date.now(),
        attemptType: input.attemptType || 'Main',
        attemptNumber: input.attemptNumber,
        parentQuizId: input.parentQuizId || undefined,
        notes: input.notes || undefined,
      },
    });
    return { id: record.id, success: true };
  },
});
