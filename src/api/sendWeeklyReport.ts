import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';
import { Email } from 'zitejs/email';

export default createEndpoint({
  description: 'Send weekly progress report email (manual trigger)',
  authenticated: true,
  inputSchema: z.object({
    email: z.string().email(),
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  execute: async ({ input, context }) => {
    await enrichCurrentUser(context);
    const userEmail = context.user.email;
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000);

    const thisWeek = await zite.quizHistory.findAll({
      filters: { userEmail, createdAt: { gte: oneWeekAgo }, isTrashed: { not: true } },
      limit: 200,
    });

    const lastWeek = await zite.quizHistory.findAll({
      filters: { userEmail, createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo }, isTrashed: { not: true } },
      limit: 200,
    });

    const thisCount = thisWeek.records.length;
    const lastCount = lastWeek.records.length;
    const thisAvg = thisCount > 0 ? Math.round(thisWeek.records.reduce((a, r) => a + (r.percentage || 0), 0) / thisCount) : 0;
    const lastAvg = lastCount > 0 ? Math.round(lastWeek.records.reduce((a, r) => a + (r.percentage || 0), 0) / lastCount) : 0;
    const totalTime = thisWeek.records.reduce((a, r) => a + (r.timeTakenSeconds || 0), 0);
    const hours = Math.floor(totalTime / 3600);
    const mins = Math.round((totalTime % 3600) / 60);

    const subjects = new Map<string, { correct: number; total: number }>();
    thisWeek.records.forEach(r => {
      if (r.subject) {
        const s = subjects.get(r.subject) || { correct: 0, total: 0 };
        s.correct += r.correctCount || 0;
        s.total += r.totalQuestions || 0;
        subjects.set(r.subject, s);
      }
    });
    const weakTopics = Array.from(subjects.entries())
      .map(([name, d]) => ({ name, pct: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);

    const scoreArrow = thisAvg > lastAvg ? '↑' : thisAvg < lastAvg ? '↓' : '→';
    const diff = Math.abs(thisAvg - lastAvg);
    const motivational = thisAvg >= 80 ? '🌟 Outstanding performance! Keep this momentum going!' :
      thisAvg >= 60 ? '💪 Good progress! Focus on your weak areas to push even higher.' :
      thisCount > 0 ? '📚 Keep practicing! Consistency is the key to improvement.' :
      '🎯 No quizzes this week — try to start fresh tomorrow!';

    await Email.send({
      to: input.email,
      subject: `📊 Your Weekly Quiz Report — ${thisAvg}% avg score`,
      body: [
        { type: 'text' as const, content: `<strong>Weekly Progress Report</strong>\n\nHi ${context.user.firstName || 'there'},\n\nHere's your study summary for the past week:` },
        { type: 'divider' as const },
        { type: 'text' as const, content: `📝 <strong>Quizzes Taken:</strong> ${thisCount} (last week: ${lastCount})\n🎯 <strong>Average Score:</strong> ${thisAvg}% ${scoreArrow} ${diff > 0 ? `(${diff}% ${thisAvg > lastAvg ? 'improvement' : 'decrease'})` : '(same)'}\n⏱️ <strong>Study Time:</strong> ${hours}h ${mins}m\n${weakTopics.length > 0 ? `\n📚 <strong>Topics to Focus On:</strong>\n${weakTopics.map(t => `  • ${t.name}: ${t.pct}%`).join('\n')}` : ''}` },
        { type: 'divider' as const },
        { type: 'text' as const, content: motivational },
        { type: 'button' as const, label: 'Open Quiz Master Pro', href: process.env.ZITE_APP_URL! },
      ],
    });

    return { success: true, message: `Report sent to ${input.email}` };
  },
});
