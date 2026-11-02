import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint, ZiteError } from 'zitejs/backend';

export default createEndpoint({
  authenticated: true,
  description: 'Update quiz title, subject, timestamp, and attempt info for a quiz history record',
  inputSchema: z.object({
    id: z.string(),
    quizTitle: z.string().optional(),
    subject: z.string().optional(),
    localTimestamp: z.number().optional(),
    attemptType: z.string().optional(),
    attemptNumber: z.number().optional(),
    parentQuizId: z.string().optional(),
    notes: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
  execute: async ({ input, context }) => {
    await enrichCurrentUser(context);
    const record = await zite.quizHistory.findOne({ id: input.id });
    if (!record) {
      throw new ZiteError({ code: 'NOT_FOUND', message: 'Quiz record not found' });
    }
    if (record.userEmail?.toLowerCase() !== context.user.email.toLowerCase()) {
      throw new ZiteError({ code: 'FORBIDDEN', message: 'You can only edit your own quizzes' });
    }
    const updates: Record<string, any> = {};
    if (input.quizTitle !== undefined) updates.quizTitle = input.quizTitle;
    if (input.subject !== undefined) updates.subject = input.subject;
    if (input.localTimestamp !== undefined) updates.localTimestamp = input.localTimestamp;
    if (input.attemptType !== undefined) updates.attemptType = input.attemptType;
    if (input.attemptNumber !== undefined) updates.attemptNumber = input.attemptNumber;
    if (input.parentQuizId !== undefined) updates.parentQuizId = input.parentQuizId;
    if (input.notes !== undefined) updates.notes = input.notes;

    if (Object.keys(updates).length > 0) {
      await zite.quizHistory.update({ id: input.id, record: updates });
    }
    return { success: true };
  },
});
