import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';

export default createEndpoint({
  description: 'Fetch full quiz detail (including quizDataJson and userAnswersJson) for a single quiz by ID',
  authenticated: true,
  inputSchema: z.object({
    id: z.string(),
  }),
  outputSchema: z.object({
    record: z.object({
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
      localTimestamp: z.number().optional(),
      attemptType: z.string().optional(),
      attemptNumber: z.number().optional(),
      parentQuizId: z.string().optional(),
      notes: z.string().optional(),
    }).nullable(),
  }),
  execute: async ({ input, context }) => {
    await enrichCurrentUser(context);
    const record = await zite.quizHistory.findOne({ id: input.id });
    if (!record || record.userEmail !== context.user!.email) {
      return { record: null };
    }
    return {
      record: {
        id: record.id,
        questionPreview: record.questionPreview,
        score: record.score,
        maxScore: record.maxScore,
        percentage: record.percentage,
        totalQuestions: record.totalQuestions,
        correctCount: record.correctCount,
        wrongCount: record.wrongCount,
        skippedCount: record.skippedCount,
        timeTakenSeconds: record.timeTakenSeconds,
        quizDataJson: record.quizDataJson,
        userAnswersJson: record.userAnswersJson,
        difficulty: record.difficulty,
        createdAt: record.createdAt,
        quizTitle: record.quizTitle,
        subject: record.subject,
        gain: record.gain,
        penalty: record.penalty,
        localTimestamp: record.localTimestamp,
        attemptType: record.attemptType,
        attemptNumber: record.attemptNumber,
        parentQuizId: record.parentQuizId,
        notes: record.notes,
      },
    };
  },
});
