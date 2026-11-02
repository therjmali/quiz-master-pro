import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';

export default createEndpoint({
  description: 'Bulk soft-delete: move multiple quiz results to trash in one request',
  authenticated: true,
  inputSchema: z.object({
    ids: z.array(z.string()).min(1).max(100),
  }),
  outputSchema: z.object({
    trashedCount: z.number(),
    success: z.boolean(),
  }),
  execute: async ({ input, context }) => {
    await enrichCurrentUser(context);
    const email = context.user!.email;
    let trashedCount = 0;

    // Process in batches of 10 to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < input.ids.length; i += batchSize) {
      const batch = input.ids.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (id) => {
          try {
            const record = await zite.quizHistory.findOne({ id });
            if (record && record.userEmail === email) {
              await zite.quizHistory.update({ id, record: { isTrashed: true } });
              trashedCount++;
            }
          } catch {
            // Skip individual failures
          }
        })
      );
    }

    return { trashedCount, success: true };
  },
});
