// Migration shim: preserves database user sync on the Zite auth model.
// The users table stays the source of truth for who may use this app:
// these hooks gate sign-in, end a session on removal, and mirror sign-ups
// back. Endpoints get `context.user` from src/lib/currentUser.ts instead.
import { zite } from 'zitejs/db';
import { ziteAuth } from 'zitejs/auth/server';

const findRosterUser = async (email: string) => {
  const { records } = await zite.users.findAll({
    filters: { email: { contains: email } },
    limit: 50,
  });
  const wanted = email.toLowerCase();
  return (
    records.find(
      record => String(record.email ?? '').toLowerCase() === wanted,
    ) ?? null
  );
};

export default ziteAuth({
  hooks: {
    // In the table -> may sign up. Anyone else defers to the app's rules.
    async beforeSignUp(input) {
      const record = await findRosterUser(input.email);
      return record ? { allow: true } : {};
    },

    // An existing member must still be in the users table to sign in.
    async beforeSignIn(input) {
      const record = await findRosterUser(input.email);
      return record
        ? {}
        : { deny: true, reason: 'No user found with that email' };
    },

    // Removal locks them out mid-session, and the row's fields are merged
    // into the app-visible user while active.
    async verifySession(input) {
      const record = await findRosterUser(input.user.email);
      if (!record) return { active: false };
      return { active: true, user: { ...record } };
    },

    // Mirror sign-ups back so workflows built on the table keep seeing them.
    async afterSignUp(input) {
      const existing = await findRosterUser(input.user.email);
      if (existing) return;
      await zite.users.create({
        record: {
          email: input.user.email,
          displayName: input.user.name.split(' ')[0] ?? '',
        },
      });
    },
  },
});
