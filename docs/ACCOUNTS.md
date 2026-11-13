# Accounts: cloud and on-device

Quiz Master never requires an account. There are two kinds, and the app picks automatically at build
time based on whether a Supabase project is compiled in.

| Build | What "Create account" does | Where the password lives | Syncs between devices |
| --- | --- | --- | --- |
| **Cloud** — `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set (see [CLOUD_SETUP.md](CLOUD_SETUP.md)) | Registers with Supabase Auth | Supabase (hashed server-side) | Yes |
| **On-device** — no Supabase variables (this is how the Android APK ships) | Creates an account on the phone | Only a PBKDF2-SHA256 hash (210 000 rounds, 16-byte random salt) in the app's own storage | No |

## Why the on-device account exists

The released APK bundles the web app and ships without a Supabase project. Before 3.1.0 that meant the
sign-in window showed a "not configured" notice instead of a form, and every attempt to sign in threw
`CloudConfigError` — the form could not succeed no matter what was typed. Rather than hide the feature,
the account now lives on the device: it works with no network, it keeps the data on the phone behind a
password the user chose, and nothing is uploaded.

## Behaviour the user sees

- **Wrong password** — "Wrong email or password. N attempts left." (identical wording whether the
  e-mail or the password was wrong, so the form never reveals which accounts exist).
- **Five wrong attempts** — a 60-second cool-down, counted down in the message.
- **No account yet** — "No account exists on this device yet. Create one first", with a link that
  switches straight to *Create account*.
- **Forgot password** — says there is no reset e-mail for a device account (there is no mail server),
  instead of pretending to send one.
- **Keep me signed in** — the session is kept in `localStorage`; unchecked, it lives in
  `sessionStorage` and ends with the app.
- **Sign out** — removes the session, keeps the account and every quiz on the device.
- **Delete account** — removes the account only. Quizzes, notes and settings are untouched.

## Password hygiene

- The password is never stored, logged or synced. Only `salt` + `hash` are written.
- Hashing runs on the device through WebCrypto (`crypto.subtle.deriveBits`, PBKDF2/SHA-256). The APK
  serves from `https://localhost`, which is a secure context, so WebCrypto is available; if a browser
  cannot provide it, the form says so instead of storing anything weaker.
- Comparison is constant-time over the derived bytes.
- One account per device. Deleting it is the only way to change the e-mail.

## If someone says "it will not let me in"

1. *Settings → Cloud* shows the account on this device (e-mail, since when). If it is empty, no
   account was ever created on that phone — the data is still there, and *Create account* works.
2. *Settings → Accessibility → Diagnostics* prints an **Account** line: `none` / `ok` /
   `session-orphan` / `unreadable`, with the e-mail and the PBKDF2 round count (never the password).
   - `session-orphan` — a saved session points at an account that no longer exists; signing in again
     recreates the session. Clearing the app's storage also fixes it.
   - `unreadable` — the stored record is damaged (or storage is blocked); delete the account and
     create it again. Quizzes are not touched.
3. Five wrong passwords start a 60-second cool-down; the message counts it down, so waiting always
   works and the account is never permanently locked.
4. Anything typed into the form clears the previous message, so a stale error can never sit under a
   corrected entry.

## Turning on real cross-device sync

Set the two repository variables described in [CLOUD_SETUP.md](CLOUD_SETUP.md) and rebuild. The same
screens then use the cloud path; nothing else in the app changes. With a cloud project configured, the
device-account code is never reached.

## Where this lives

| File | Responsibility |
| --- | --- |
| `src/platform/account/localAccount.ts` | Pure device-account logic: validation, PBKDF2, lock-outs, session storage |
| `src/platform/cloud/authStore.ts` | One store, two backends: cloud (`supabase-js`) or device; friendly errors |
| `src/platform/cloud/accountView.ts` | Maps the store to the `{ signedIn, name, email, source }` every screen reads |
| `src/components/cloud/SignInWindow.tsx` | The sign-in / create-account window, including the password reveal |
| `src/components/profile/settings/sectionsCloud.tsx` | Settings → Cloud: profile, password change, account actions |
| `src/hooks/useClock.ts` | The single 1-second clock every live widget shares (sleeps while the app is hidden) |
| `tests/localAccount.test.ts`, `tests/accountStore.test.ts` | The rules above, asserted |
