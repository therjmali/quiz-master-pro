# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-11-06

Sign-in is now a proper window you can open from anywhere, and zoom has its own menu in Settings.

### Added
- **Sign-in window.** One dialog (sign in / create account / reset password) that opens from the header "Sign in" button, the dashboard, the sign-in reminder toast and the AI chat. It closes itself the moment you are signed in, always has "Not now - continue as guest", and says clearly when cloud login is not configured in the build.
- **Dashboard sign-in card** for guests: "Sign in" and "Create account" buttons. Dismiss hides it for a week. Never shown to signed-in users or when cloud login is not configured.
- **Settings -> Accessibility -> Zoom.** Zoom the whole app in or out (70-150 %, 5 % steps) with - / + buttons, a slider (applies on release so it does not jump under your finger), five presets, a reset button and a section reset. Searchable ("zoom", "magnify", "accessibility"). Saved on the device.
- **App-wide zoom shortcuts** (Ctrl/Cmd + `+`, `-`, `0`) on every screen, not only during a quiz.
- 11 new unit tests (zoom limits, persistence and recovery from bad stored values, shortcut mapping, settings search, sign-in event, dashboard card timing).

### Fixed
- The header "Sign in" button used the old hosted-backend login, which does nothing in the web and Android builds. It now opens the real (Supabase) sign-in. The header avatar, the AI chat and the study-plan card now recognise a cloud-signed-in account.
- Saved zoom was only applied once the quiz screen had loaded; it is now applied at startup on every screen.
- The Trash tab no longer shows a dead "Sign in" button in builds without the hosted backend.

## [1.1.1] - 2026-11-04

Login is switched on in every build and easier to find.

### Added
- **Login enabled** for the web app and the Android app (Supabase project configured through the `SUPABASE_URL` / `SUPABASE_ANON_KEY` repository variables).
- **App-wide cloud gate.** The "merge / use cloud / use this device" question now appears from any screen the moment you sign in to an account that already has data, instead of only inside Settings. A toast announces data arriving from another device before the app refreshes.
- **Gentle sign-in invitation** for guests who already have quiz history (once every two weeks at most, never blocking), with a one-tap deep link to *Settings -> Account & Cloud Sync*.
- **`npm run check:cloud` + the "Cloud check" workflow** - a read-only health check of the Supabase project (reachable? e-mail login on? sign-ups open? tables installed? anonymous access locked down?). Uses only the public key, never creates users or writes data. Runs twice a week, which also keeps a free project from pausing.

## [1.1.0] - 2026-11-04

Accounts, cloud sync, notifications, automatic backups, on-device AI and a proper Data & Trash hub - modelled on RJ Tracker Pro and rebuilt for quiz data.

### Added
- **Account & Cloud Sync (Supabase).** Sign in, create an account, reset or change a password, edit your name, see and remove devices, sign out of other devices. Offline-first sync of quiz history (split per month), library tree, bookmarks, mistake book, flashcards, spaced repetition, study plan, exam dates, notes and preferences. Three-way merge, version-checked uploads with automatic retry, a first-sign-in choice (merge / use cloud / use this device) with a safety backup, restore points, a readable sync log, and privacy controls (delete cloud data, delete account). Large sections are gzip-compressed. See `docs/CLOUD_SETUP.md`.
- **`supabase/quiz_schema.sql`** - isolated `quiz_*` tables and functions with Row-Level Security; shares sign-in accounts with other RJ apps without touching their data. Covered by 14 behavioural tests on real PostgreSQL.
- **Automatic local backups.** Scheduled, checksummed, compressed snapshots with rotation, a read-back verification, safety snapshots before every restore/import/cloud replacement, export to file (share sheet on Android) and import with integrity checks.
- **Smart reminders.** Real Android notifications (work with the app closed) for the daily reminder, cards due for review, streak saver, exam countdown (30/14/7/3/1 days and on the day) and a weekly summary, with quiet hours, permission handling, a test button and a preview of what is coming. On the web they appear while the app is open.
- **AI on this device.** Bring your own Gemini, Claude, OpenAI or Cohere key: quiz generation and explanations run straight from the device with automatic retry and fallback between providers. Keys never sync and are never backed up. Shares its prompts and parsers with the backend endpoints.
- **Data & Trash.** Deleted quiz results go to a local trash (30 days by default, configurable) that syncs between devices and can be restored; storage meter with "protect my data"; one-tap data check.
- **App icon & device.** Use your own picture as the app icon (browser tab, installed web app, and a pinned home-screen shortcut on Android); install the web app; check for and apply updates.
- 46+ unit tests (`npm run test:unit`) and a CI job for the database tests.

### Changed
- The legacy hosted-backend sign-in and cloud rows are hidden in standalone builds, where they cannot work.
- `setHistory` now parks removed results in the trash instead of destroying them.
- Reminder permission requests use the native layer inside the Android app.

### Fixed
- The sync "touched during sync" guard, apply-time trash suppression and first-contact verification are covered by tests.

## [1.0.0] - 2026-11-03

First public release of R.J QUIZ - Quiz Master Pro as a standalone, installable app.

### Added
- **Offline-first PWA**: service worker precaches the whole build (JS, CSS, fonts, icons); the app
  opens, reloads and deep-links with the network switched off. Safe update flow - a new version waits
  until the old one is released, so a session is never reloaded under you.
- **Android APK** (Capacitor): the full web app is bundled inside the package and served locally, so
  it never needs a website to start. Built, signed, verified and released by GitHub Actions.
- **GitHub Actions**: `Verify` (types, build, repository files, real-Chrome offline test),
  `Deploy web app` (GitHub Pages) and `Build Android APK` (build, verify, Android-emulator
  install/launch/offline-start test, then release).
- `scripts/verify-repo.mjs` - integrity checks for required files, manifest and icon sizes, Android
  resources, workflows, secrets and the production build (precache coverage, no remote assets).
- Bundled web fonts (Plus Jakarta Sans, DM Sans, Syne, JetBrains Mono) instead of Google Fonts.
- Original app icon set (PWA, maskable, Apple touch, Android adaptive) generated by
  `scripts/generate-icons.py`.

### Changed
- Flattened the Zite monorepo export into a standard single-package project.
- The hosting runtime script is no longer injected into standalone builds (it is opt-in via
  `ZITE_HOSTED=1`), removing the only remote script dependency.
- Router base path follows `VITE_BASE`, so the app works at the root and under `/<repo>/`.

### Security
- Removed a hard-coded personal address from the backup-report e-mail; the optional CC is now read
  from the `BACKUP_REPORT_CC` environment variable.
