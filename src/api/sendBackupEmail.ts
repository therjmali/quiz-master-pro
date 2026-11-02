import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';
import { Email } from 'zitejs/email';

export default createEndpoint({
  description: 'Send quiz backup/stats summary email to the authenticated user',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ context }) => {
    await enrichCurrentUser(context);
    const result = await zite.quizHistory.findAll({
      filters: { userEmail: context.user!.email, isTrashed: { not: true } },
      limit: 500,
    });
    const records = result.records;
    const totalQuizzes = records.length;
    const avgScore = records.length > 0
      ? Math.round(records.reduce((a, r) => a + (r.percentage || 0), 0) / records.length)
      : 0;
    const totalCorrect = records.reduce((a, r) => a + (r.correctCount || 0), 0);
    const totalWrong = records.reduce((a, r) => a + (r.wrongCount || 0), 0);
    const totalQ = records.reduce((a, r) => a + (r.totalQuestions || 0), 0);
    const accuracy = (totalCorrect + totalWrong) > 0
      ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0;
    const totalGain = records.reduce((a, r) => a + (r.gain || 0), 0);
    const totalPenalty = records.reduce((a, r) => a + (r.penalty || 0), 0);
    const netScore = Math.max(0, totalGain - totalPenalty);
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const name = context.user!.firstName || context.user!.email.split('@')[0];

    await Email.send({
      to: context.user!.email,
      ...(process.env.BACKUP_REPORT_CC ? { cc: [process.env.BACKUP_REPORT_CC] } : {}),
      subject: `📊 Your R.J QUIZ Backup Report — ${date}`,
      logo: {
        url: 'https://images.fillout.com/orgid-834569/flowpublicid-atbirpeh2j/widgetid-default/qHdonmhwjvhwxVYHGeZeEU/image_10fbdf93.png',
        width: 120, height: 40,
      },
      body: [
        { type: 'text', content: `Hi ${name} 👋\n\nHere is your <strong>R.J QUIZ</strong> backup report generated on <strong>${date}</strong>. Your quiz data is safely stored in the cloud.` },
        { type: 'divider' },
        { type: 'text', content: `<strong>📊 Lifetime Statistics</strong>\n\n🎯 Total Quizzes Attempted: <strong>${totalQuizzes}</strong>\n💯 Average Score: <strong>${avgScore}%</strong>\n🏆 Overall Accuracy: <strong>${accuracy}%</strong>\n✅ Total Correct Answers: <strong>${totalCorrect}</strong>\n❌ Total Wrong Answers: <strong>${totalWrong}</strong>\n📝 Total Questions Answered: <strong>${totalQ}</strong>\n➕ Total Gain: <strong>${totalGain.toFixed(2)}</strong>\n➖ Total Penalty: <strong>${totalPenalty.toFixed(2)}</strong>\n🔢 Net Score: <strong>${netScore.toFixed(2)}</strong>` },
        { type: 'spacer', height: 24 },
        { type: 'button', label: '📱 Open R.J QUIZ', href: process.env.ZITE_APP_URL },
        { type: 'divider' },
        { type: 'text', content: `<strong>💡 Download Full Backup</strong>\n\nTo download your complete quiz data as JSON:\nOpen App → Profile → Overview → Data Management → Backup JSON\n\nKeep studying and stay sharp! 💪🧠` },
      ],
    });

    return { success: true };
  },
});
