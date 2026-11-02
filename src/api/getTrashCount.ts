import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';

export default createEndpoint({
  description: 'Count the signed-in user\'s trashed quiz history records (lightweight, powers the Library Trash badge)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ count: z.number() }),
  execute: async ({ context }) => {
    await enrichCurrentUser(context);
    const result = await zite.sql({
      query: 'SELECT COUNT(*) AS "cnt" FROM "QuizHistory" WHERE "userEmail" = $1 AND "isTrashed" IS TRUE',
      params: [context.user!.email],
    });
    return { count: Number(result.rows[0]?.cnt ?? 0) };
  },
});
