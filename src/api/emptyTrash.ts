import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';

export default createEndpoint({
  description: 'Permanently delete all trashed quiz results for the authenticated user',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ deleted: z.number() }),
  execute: async ({ context }) => {
    await enrichCurrentUser(context);
    const result = await zite.quizHistory.findAll({
      filters: { userEmail: context.user!.email, isTrashed: true },
      limit: 500,
    });
    let deleted = 0;
    // Delete in batches of 10 to stay within rate limits
    const records = result.records;
    for (let i = 0; i < records.length; i += 10) {
      const batch = records.slice(i, i + 10);
      await Promise.all(batch.map(r => zite.quizHistory.delete({ id: r.id })));
      deleted += batch.length;
    }
    return { deleted };
  },
});
