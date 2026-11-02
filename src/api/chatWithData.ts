import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';
import Anthropic from '@anthropic-ai/sdk';

interface QuizRecord {
  id: string;
  quizTitle?: string;
  subject?: string;
  percentage?: number;
  correctCount?: number;
  wrongCount?: number;
  skippedCount?: number;
  totalQuestions?: number;
  timeTakenSeconds?: number;
  difficulty?: string;
  createdAt?: string;
  gain?: number;
  penalty?: number;
}

export default createEndpoint({
  description: 'AI chatbot that answers questions about user quiz data, progress, weak topics, subject analysis, streaks, etc.',
  authenticated: true,
  stream: true,
  inputSchema: z.object({
    message: z.string(),
    conversationHistory: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })).optional(),
    localSettings: z.string().optional(),
  }),
  outputSchema: z.object({ text: z.string() }),
  execute: async ({ input, context, stream }) => {
    await enrichCurrentUser(context);
    const email = context.user.email;

    // Fetch all quiz history for the user
    const allRecords: QuizRecord[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const batch = await zite.quizHistory.findAll({
        filters: { userEmail: email, isTrashed: false },
        offset,
        limit: 500,
        fields: ['id', 'quizTitle', 'subject', 'percentage', 'correctCount', 'wrongCount', 'skippedCount', 'totalQuestions', 'timeTakenSeconds', 'difficulty', 'createdAt', 'gain', 'penalty'],
      });
      allRecords.push(...(batch.records as QuizRecord[]));
      hasMore = batch.hasMore;
      offset += batch.records.length;
    }

    // Compute stats in JS
    const totalQuizzes = allRecords.length;
    const totalCorrect = allRecords.reduce((s, r) => s + (r.correctCount || 0), 0);
    const totalWrong = allRecords.reduce((s, r) => s + (r.wrongCount || 0), 0);
    const totalSkipped = allRecords.reduce((s, r) => s + (r.skippedCount || 0), 0);
    const totalQuestions = allRecords.reduce((s, r) => s + (r.totalQuestions || 0), 0);
    const totalTime = allRecords.reduce((s, r) => s + (r.timeTakenSeconds || 0), 0);
    const totalGain = allRecords.reduce((s, r) => s + (r.gain || 0), 0);
    const totalPenalty = allRecords.reduce((s, r) => s + (r.penalty || 0), 0);
    const avgPercentage = totalQuizzes > 0 ? Math.round(allRecords.reduce((s, r) => s + (r.percentage || 0), 0) / totalQuizzes) : 0;
    const bestPercentage = totalQuizzes > 0 ? Math.round(Math.max(...allRecords.map(r => r.percentage || 0))) : 0;
    const worstPercentage = totalQuizzes > 0 ? Math.round(Math.min(...allRecords.map(r => r.percentage || 0))) : 0;
    const accuracy = (totalCorrect + totalWrong) > 0 ? Math.round(totalCorrect / (totalCorrect + totalWrong) * 100) : 0;

    // Subject breakdown
    const subjectMap = new Map<string, { count: number; pctSum: number; correct: number; wrong: number; total: number }>();
    for (const r of allRecords) {
      const subj = r.subject?.trim();
      if (!subj) continue;
      const e = subjectMap.get(subj) || { count: 0, pctSum: 0, correct: 0, wrong: 0, total: 0 };
      e.count++;
      e.pctSum += r.percentage || 0;
      e.correct += r.correctCount || 0;
      e.wrong += r.wrongCount || 0;
      e.total += r.totalQuestions || 0;
      subjectMap.set(subj, e);
    }
    const subjects = [...subjectMap.entries()]
      .map(([name, d]) => ({ name, ...d, avgPct: Math.round(d.pctSum / d.count) }))
      .sort((a, b) => b.count - a.count);

    const weakSubjects = [...subjects].filter(s => s.total >= 5).sort((a, b) => a.avgPct - b.avgPct).slice(0, 5);

    // Daily breakdown & streak
    const dailyMap = new Map<string, { count: number; pctSum: number; correct: number; wrong: number }>();
    for (const r of allRecords) {
      if (!r.createdAt) continue;
      const day = r.createdAt.split('T')[0];
      const e = dailyMap.get(day) || { count: 0, pctSum: 0, correct: 0, wrong: 0 };
      e.count++;
      e.pctSum += r.percentage || 0;
      e.correct += r.correctCount || 0;
      e.wrong += r.wrongCount || 0;
      dailyMap.set(day, e);
    }
    const dailyEntries = [...dailyMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

    // Streak
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const dates = dailyEntries.map(d => d[0]);
    if (dates.length > 0 && (dates[0] === today || dates[0] === yesterday)) {
      streak = 1;
      for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / 86400000;
        if (diff <= 1.5) streak++;
        else break;
      }
    }

    // Weekly breakdown
    const weeklyMap = new Map<string, { count: number; pctSum: number }>();
    for (const r of allRecords) {
      if (!r.createdAt) continue;
      const d = new Date(r.createdAt);
      const day = d.getDay();
      const weekStart = new Date(d.getTime() - day * 86400000).toISOString().split('T')[0];
      const e = weeklyMap.get(weekStart) || { count: 0, pctSum: 0 };
      e.count++;
      e.pctSum += r.percentage || 0;
      weeklyMap.set(weekStart, e);
    }
    const weeklyEntries = [...weeklyMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);

    // Best day/week
    const bestDay = dailyEntries.length > 0
      ? dailyEntries.reduce((best, d) => (d[1].pctSum / d[1].count) > (best[1].pctSum / best[1].count) ? d : best)
      : null;
    const bestWeek = weeklyEntries.length > 0
      ? weeklyEntries.reduce((best, w) => (w[1].pctSum / w[1].count) > (best[1].pctSum / best[1].count) ? w : best)
      : null;

    // Recent quizzes
    const recent = [...allRecords].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 15);

    const dataContext = `
## USER QUIZ DATA SUMMARY
- Name: ${context.user.firstName || context.user.displayName || email.split('@')[0]}
- Email: ${email}
- Total Quizzes Taken: ${totalQuizzes}
- Total Questions Attempted: ${totalQuestions}
- Total Correct: ${totalCorrect}
- Total Wrong: ${totalWrong}
- Total Skipped: ${totalSkipped}
- Overall Accuracy: ${accuracy}%
- Average Score: ${avgPercentage}%
- Best Score: ${bestPercentage}%
- Worst Score: ${worstPercentage}%
- Total Study Time: ${Math.round(totalTime / 60)} minutes
- Average Time per Quiz: ${totalQuizzes > 0 ? Math.round(totalTime / totalQuizzes) : 0} seconds
- Total Gain: ${totalGain}
- Total Penalty: ${totalPenalty}
- Net Score: ${totalGain - totalPenalty}
- Current Streak: ${streak} day(s)

## SUBJECT-WISE BREAKDOWN
${subjects.length > 0 ? subjects.slice(0, 20).map(s => `- ${s.name}: ${s.count} quizzes, Avg ${s.avgPct}%, ${s.correct} correct / ${s.wrong} wrong out of ${s.total} total`).join('\n') : 'No subject data yet.'}

## WEAK SUBJECTS (Lowest accuracy)
${weakSubjects.length > 0 ? weakSubjects.map(s => `- ${s.name}: Avg ${s.avgPct}% (${s.wrong} wrong out of ${s.total})`).join('\n') : 'Not enough data to identify weak subjects yet.'}

## RECENT 15 QUIZZES
${recent.length > 0 ? recent.map(r => `- ${r.quizTitle || r.subject || 'Quiz'} | ${r.percentage}% | ${r.correctCount}/${r.totalQuestions} correct | ${r.difficulty || 'mixed'} | ${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'N/A'}`).join('\n') : 'No quizzes yet.'}

## DAILY PERFORMANCE (last 30 days)
${dailyEntries.length > 0 ? dailyEntries.slice(0, 10).map(([day, d]) => `- ${day}: ${d.count} quiz(es), Avg ${Math.round(d.pctSum / d.count)}%, ${d.correct} correct / ${d.wrong} wrong`).join('\n') : 'No daily data.'}

## WEEKLY PERFORMANCE (last 12 weeks)
${weeklyEntries.length > 0 ? weeklyEntries.slice(0, 6).map(([week, w]) => `- Week of ${week}: ${w.count} quiz(es), Avg ${Math.round(w.pctSum / w.count)}%`).join('\n') : 'No weekly data.'}

## BEST PERFORMANCE
- Best Day: ${bestDay ? `${bestDay[0]} — Avg ${Math.round(bestDay[1].pctSum / bestDay[1].count)}% (${bestDay[1].count} quizzes)` : 'N/A'}
- Best Week: ${bestWeek ? `Week of ${bestWeek[0]} — Avg ${Math.round(bestWeek[1].pctSum / bestWeek[1].count)}% (${bestWeek[1].count} quizzes)` : 'N/A'}

## LOCAL SETTINGS (if provided)
${input.localSettings || 'Not provided'}
`;

    const systemPrompt = `You are "QMP AI" — the personal study assistant inside Quiz Master Pro. You have FULL access to the user's quiz data, progress, analytics, and settings (shown below). Answer questions about their performance, weak topics, study strategy, progress trends, and more.

Rules:
- Be warm, encouraging, and data-driven. Use emojis sparingly (1-2 per message).
- When discussing stats, cite specific numbers from the data.
- For weak topics, be specific about which subjects need improvement and by how much.
- For study strategy, give actionable advice based on their actual data patterns.
- Keep responses concise but thorough — 2-4 paragraphs max.
- Use markdown formatting (bold, bullet points) for readability.
- If the user asks something not in the data, say so honestly.
- Current date: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

${dataContext}`;

    const messages: Anthropic.MessageParam[] = [
      ...(input.conversationHistory || []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: input.message },
    ];

    const client = new Anthropic({ apiKey: process.env.ZITE_ANTHROPIC_ACCESS_TOKEN! });
    const messageStream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    let fullText = '';
    for await (const event of messageStream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        await stream.write(event.delta.text);
      }
    }

    return { text: fullText };
  },
});
