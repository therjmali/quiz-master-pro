import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';

export default createEndpoint({
  description: 'Restore a quiz result from trash',
  authenticated: true,
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    await enrichCurrentUser(context);
    const record = await zite.quizHistory.findOne({ id: input.id });
    if (!record) throw new Error('Record not found');
    if (record.userEmail !== context.user!.email) throw new Error('Unauthorized');
    await zite.quizHistory.update({ id: input.id, record: { isTrashed: false } });
    return { success: true };
  },
});
