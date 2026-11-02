import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';

export default createEndpoint({
  description: 'Server-side aggregation of quiz history stats to avoid frontend iteration over 600+ records',
  authenticated: true,
  inputSchema: z.object({
    subject: z.string().optional(),
    sinceTimestamp: z.number().optional(),
  }),
  outputSchema: z.object({
    totalQuizzes: z.number(),
    totalCorrect: z.number(),
    totalWrong: z.number(),
    totalSkipped: z.number(),
    totalQuestions: z.number(),
    avgPercentage: z.number(),
    totalTimeSecs: z.number(),
    subjectBreakdown: z.array(z.object({
      subject: z.string(),
      count: z.number(),
      avgPct: z.number(),
      totalCorrect: z.number(),
      totalWrong: z.number(),
    })),
  }),
  execute: async ({ input, context }) => {
    await enrichCurrentUser(context);
    const email = context.user!.email;

    // Build filters
    const filters: Record<string, any> = {
      userEmail: email,
      isTrashed: { not: true },
    };
    if (input.subject) {
      filters.subject = input.subject;
    }
    if (input.sinceTimestamp) {
      filters.localTimestamp = { gte: input.sinceTimestamp };
    }

    // Fetch all records (lite fields only) and aggregate in JS
    const LITE_FIELDS = [
      'id', 'percentage', 'totalQuestions', 'correctCount', 'wrongCount',
      'skippedCount', 'timeTakenSeconds', 'subject', 'gain', 'penalty', 'maxScore',
    ];

    let allRecords: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const page = await zite.quizHistory.findAll({
        filters,
        limit: 500,
        offset,
        fields: LITE_FIELDS,
      });
      allRecords = allRecords.concat(page.records);
      hasMore = page.hasMore;
      offset += page.records.length;
      if (allRecords.length >= 5000) break;
    }

    // Aggregate
    let totalCorrect = 0, totalWrong = 0, totalSkipped = 0, totalQuestions = 0;
    let totalGain = 0, totalPenalty = 0, totalMaxScore = 0, totalTimeSecs = 0;
    const subjectMap = new Map<string, { count: number; totalCorrect: number; totalWrong: number; totalMaxScore: number; totalGain: number; totalPenalty: number }>();

    for (const r of allRecords) {
      totalCorrect += r.correctCount || 0;
      totalWrong += r.wrongCount || 0;
      totalSkipped += r.skippedCount || 0;
      totalQuestions += r.totalQuestions || 0;
      totalGain += r.gain || 0;
      totalPenalty += r.penalty || 0;
      totalMaxScore += r.maxScore || r.totalQuestions || 0;
      totalTimeSecs += r.timeTakenSeconds || 0;

      if (r.subject) {
        const prev = subjectMap.get(r.subject) || { count: 0, totalCorrect: 0, totalWrong: 0, totalMaxScore: 0, totalGain: 0, totalPenalty: 0 };
        prev.count++;
        prev.totalCorrect += r.correctCount || 0;
        prev.totalWrong += r.wrongCount || 0;
        prev.totalMaxScore += r.maxScore || r.totalQuestions || 0;
        prev.totalGain += r.gain || 0;
        prev.totalPenalty += r.penalty || 0;
        subjectMap.set(r.subject, prev);
      }
    }

    const totalQuizzes = allRecords.length;
    // Weighted percentage from raw aggregated totals (not average of per-quiz %)
    const totalNetScore = Math.max(0, totalGain - totalPenalty);
    const effectiveMax = totalMaxScore > 0 ? totalMaxScore : totalQuestions;

    return {
      totalQuizzes,
      totalCorrect,
      totalWrong,
      totalSkipped,
      totalQuestions,
      avgPercentage: effectiveMax > 0 ? Math.round((totalNetScore / effectiveMax) * 100) : 0,
      totalTimeSecs,
      subjectBreakdown: Array.from(subjectMap.entries())
        .map(([subject, data]) => {
          const subNet = Math.max(0, data.totalGain - data.totalPenalty);
          const subMax = data.totalMaxScore > 0 ? data.totalMaxScore : (data.totalCorrect + data.totalWrong);
          return {
            subject,
            count: data.count,
            avgPct: subMax > 0 ? Math.round((subNet / subMax) * 100) : 0,
            totalCorrect: data.totalCorrect,
            totalWrong: data.totalWrong,
          };
        })
        .sort((a, b) => b.count - a.count),
    };
  },
});
