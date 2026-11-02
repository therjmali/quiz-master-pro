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
});

export default createEndpoint({
  description: 'Retrieve non-trashed quiz history summaries (lightweight, no quiz data) with pagination and incremental sync',
  authenticated: true,
  inputSchema: z.object({
    limit: z.number().optional(),
    offset: z.number().optional(),
    /** Timestamp for incremental sync — only returns records with localTimestamp >= since */
    since: z.number().optional(),
    /** @deprecated Ignored — always returns lite summaries */
    lite: z.boolean().optional(),
  }),
  outputSchema: z.object({
    records: z.array(historyRecord),
    hasMore: z.boolean(),
    totalCount: z.number(),
  }),
  execute: async ({ input, context }) => {
    await enrichCurrentUser(context);
    const email = context.user!.email;
    const limit = Math.min(input.limit || 200, 500);
    const offset = input.offset || 0;

    // Build WHERE clause
    let whereClause = '"userEmail" = $1 AND ("isTrashed" IS NOT TRUE)';
    const params: any[] = [email];

    if (input.since) {
      params.push(input.since);
      whereClause += ` AND "localTimestamp" >= $${params.length}`;
    }

    // Accurate total count via SQL
    const countResult = await zite.sql({
      query: `SELECT COUNT(*) AS "cnt" FROM "QuizHistory" WHERE ${whereClause}`,
      params,
    });
    const totalCount = Number(countResult.rows[0]?.cnt ?? 0);

    // Deterministic pagination with ORDER BY
    params.push(limit, offset);
    const dataResult = await zite.sql({
      query: `
        SELECT
          id,
          "questionPreview",
          "score",
          "maxScore",
          "percentage",
          "totalQuestions",
          "correctCount",
          "wrongCount",
          "skippedCount",
          "timeTakenSeconds",
          "difficulty",
          created_at AS "createdAt",
          "quizTitle",
          "subject",
          "gain",
          "penalty",
          "localTimestamp",
          "attemptType",
          "attemptNumber",
          "parentQuizId",
          "notes"
        FROM "QuizHistory"
        WHERE ${whereClause}
        ORDER BY "localTimestamp" DESC NULLS LAST
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    });

    const records = dataResult.rows.map((r: any) => ({
      id: String(r.id),
      questionPreview: r.questionPreview ?? undefined,
      score: r.score != null ? Number(r.score) : undefined,
      maxScore: r.maxScore != null ? Number(r.maxScore) : undefined,
      percentage: r.percentage != null ? Number(r.percentage) : undefined,
      totalQuestions: r.totalQuestions != null ? Number(r.totalQuestions) : undefined,
      correctCount: r.correctCount != null ? Number(r.correctCount) : undefined,
      wrongCount: r.wrongCount != null ? Number(r.wrongCount) : undefined,
      skippedCount: r.skippedCount != null ? Number(r.skippedCount) : undefined,
      timeTakenSeconds: r.timeTakenSeconds != null ? Number(r.timeTakenSeconds) : undefined,
      difficulty: r.difficulty ?? undefined,
      createdAt: r.createdAt ? String(r.createdAt) : undefined,
      quizTitle: r.quizTitle ?? undefined,
      subject: r.subject ?? undefined,
      gain: r.gain != null ? Number(r.gain) : undefined,
      penalty: r.penalty != null ? Number(r.penalty) : undefined,
      localTimestamp: r.localTimestamp != null ? Number(r.localTimestamp) : undefined,
      attemptType: r.attemptType ?? undefined,
      attemptNumber: r.attemptNumber != null ? Number(r.attemptNumber) : undefined,
      parentQuizId: r.parentQuizId ?? undefined,
      notes: r.notes ?? undefined,
    }));

    return {
      records,
      hasMore: offset + records.length < totalCount,
      totalCount,
    };
  },
});
