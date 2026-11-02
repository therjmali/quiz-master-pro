import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { Email } from 'zitejs/email';
import { ZitePdf } from 'zitejs/pdf';

export default createEndpoint({
  description: 'Generate PDF report and email it to the user',
  authenticated: true,
  inputSchema: z.object({
    email: z.string().email(),
    quizTitle: z.string().optional(),
    subject: z.string().optional(),
    percentage: z.number(),
    correct: z.number(),
    wrong: z.number(),
    skipped: z.number(),
    totalQuestions: z.number(),
    accuracy: z.number(),
    timeTaken: z.number(),
    pdfUrl: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  async execute({ input, context }) {
    await enrichCurrentUser(context);
    const title = input.quizTitle || 'Quiz Report';
    const grade = input.percentage >= 90 ? 'A+' : input.percentage >= 80 ? 'A' : input.percentage >= 70 ? 'B' : input.percentage >= 60 ? 'C' : input.percentage >= 50 ? 'D' : 'F';
    const passed = input.percentage >= 50;
    const userName = context.user.firstName || context.user.email.split('@')[0];

    const attachments = input.pdfUrl
      ? [{ filename: `${title.replace(/[^a-zA-Z0-9]/g, '_')}_Report.pdf`, url: input.pdfUrl, contentType: 'application/pdf' }]
      : undefined;

    await Email.send({
      to: input.email,
      subject: `📊 Quiz Report: ${title} — ${input.percentage}% (${grade})`,
      body: [
        {
          type: 'text' as const,
          content: `Hi ${userName},\n\nHere's your quiz performance report for <strong>${title}</strong>.\n\n<strong>📊 Results Summary</strong>\n• Score: <strong>${input.percentage}%</strong> (Grade: ${grade})\n• Status: ${passed ? '✅ PASSED' : '❌ FAILED'}\n• Correct: <strong>${input.correct}</strong> / ${input.totalQuestions}\n• Wrong: <strong>${input.wrong}</strong>\n• Skipped: <strong>${input.skipped}</strong>\n• Accuracy: <strong>${input.accuracy}%</strong>\n• Time: <strong>${Math.floor(input.timeTaken / 60)}m ${input.timeTaken % 60}s</strong>${input.subject ? `\n• Subject: <strong>${input.subject}</strong>` : ''}`,
        },
        ...(input.pdfUrl ? [{
          type: 'button' as const,
          label: '📄 View Full PDF Report',
          href: input.pdfUrl,
        }] : []),
        {
          type: 'text' as const,
          content: `Keep up the practice! 💪\n\n— Quiz Master Pro`,
        },
      ],
      attachments,
    });

    return { success: true, message: `Report emailed to ${input.email}` };
  },
});
