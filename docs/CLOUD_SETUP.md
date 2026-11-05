# Cloud sync setup (Supabase)

Quiz Master works completely offline with no account. Cloud sync is optional: it lets you sign in and keep
your history, library, bookmarks, mistake book, flashcards, notes and preferences identical on your phone and
computer. It runs on a free [Supabase](https://supabase.com) project - there is no server to host.

The app owner does this **once**. Everyone else just taps *Settings -> Account & Cloud Sync -> Create account*.

## 1. Create (or reuse) a Supabase project

1. Create a project at <https://supabase.com/dashboard> (the free plan is enough).
2. **Already use RJ Tracker Pro?** Reuse the same project. Everything here lives in separate `quiz_*` tables
   and functions, so it never touches the other app, and one sign-in works in both apps.

## 2. Create the tables (one minute)

1. Dashboard -> **SQL Editor** -> **New query**.
2. Paste the contents of [`supabase/quiz_schema.sql`](../supabase/quiz_schema.sql) (or use the
   **Copy setup SQL** button the app shows when the database is not set up yet) and press **Run**.
3. It is safe to run again later - it is idempotent.

What it creates, all protected by Row-Level Security (a signed-in user can only ever see their own rows):

| Object | Purpose |
| --- | --- |
| `quiz_sync_docs` / `quiz_sync_sections` | One versioned document per user, split into small sections |
| `quiz_sync_revisions` | The last 5 saved versions (restore points) |
| `quiz_devices` | The devices that have signed in |
| `quiz_sync_pull / push / restore / wipe` | The only way clients read and write sync data (version-checked) |
| `quiz_delete_my_data`, `quiz_delete_my_account` | Privacy controls shown in the app |

Limits per user: 8 MB per section, 24 MB in total, 300 sections, 5 restore points. Quiz history is split per month,
and large sections are gzip-compressed on the device before upload.

## 3. Authentication settings

Dashboard -> **Authentication**:

- **Providers -> Email** must be enabled.
- **Confirm email**: switch it **off** for a private app (the free mailer is rate-limited), or leave it on and users
  confirm through the mailed link.
- **Allow new users to sign up**: leave on while people create their accounts, then switch it off if you want to
  close registration. Existing users keep working.
- **URL Configuration -> Site URL**: your web app address (for password-reset links), e.g.
  `https://<you>.github.io/quiz-master-pro/`.

## 4. Connect the app

Dashboard -> **Project Settings -> API**: copy the **Project URL** and the **publishable (anon) key**.
The anon key is designed to be public - it can do nothing without a signed-in user and Row-Level Security.
**Never** use the `service_role` key anywhere in this project.

In GitHub: repository **Settings -> Secrets and variables -> Actions -> Variables** and add

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | the Project URL, e.g. `https://abcd1234.supabase.co` |
| `SUPABASE_ANON_KEY` | the publishable (anon) key |

Re-run **Deploy web app** and push a version tag (or run **Build Android APK**) so the new builds contain them.

For local development copy `.env.example` to `.env.local` and fill in the same two values
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

## How sync behaves

- **Offline first.** The app always reads and writes the device. Sync is a background copy.
- **First sign-in on a device that already has data** and an account that already has data: the app asks whether to
  *merge* (recommended), *use the cloud copy* or *use this device*. A safety backup is saved first.
- **Two devices editing at once** are merged field by field. If both changed the very same value, the most recent
  sync wins and the other value is listed under *Sync log* so nothing is silently lost.
- **Deleting** something on one device deletes it everywhere (quiz results go to the trash first, which also syncs).
- **Stays on the device:** AI keys, caches, drafts, the quiz in progress, backup files and notification schedules.

## Troubleshooting

| Message | Fix |
| --- | --- |
| "Cloud database is not set up yet" | Run `supabase/quiz_schema.sql` (step 2) |
| "New sign-ups are turned off" | Enable sign-ups temporarily, or create the user in Authentication -> Users |
| "No internet connection" | Normal while offline; everything syncs when you are back online |
| Free project paused | Open the Supabase dashboard and restore the project |
| "rejected ... section too large" | One month of history exceeded 8 MB: export a backup, trim old results, sync again |

## Testing the database yourself

`npm run test:sql` applies the schema twice to a throw-away PostgreSQL database and runs 14 behavioural tests
(version conflicts, incremental pull, restore points and their cap, size limits, Row-Level Security isolation,
delete-my-data, delete-my-account, anonymous lock-out). CI runs the same tests on every change.
