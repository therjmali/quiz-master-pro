# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [2.5.0] - 2026-11-08

Reliable timed quizzes, a merged quiz header, in-app updates, and a signed-update fix.

### Fixed
- **"App not installed as package conflicts with an existing package"** when updating. Every release was signed with a new throw-away key. A permanent release key is now stored as repository secrets, so builds from v2.5.0 on update in place. (APKs from before v2.5.0 need a one-time uninstall — back up first; see README → Signing.)
- **Per-question timer**: when time runs out the quiz now moves on by itself (and finishes after the last question), the expired question is locked — no Previous, no jumping back, skipped by Next — and shows 🔒 in the navigator. Fixes quizzes stuck on an expired question after a resume or when going back.
- Timers measure real clock time, so they no longer freeze or run slow when the screen is off or the app is in the background.
- Resuming a saved quiz now keeps the quiz's own timer/marks/mode instead of letting the app-wide settings overwrite them.
- **Header overlapping the status bar** on phones (clock and signal icons drawn over the quiz header) — the header now respects the status-bar inset.
- Quiz screen on phones is now truly edge-to-edge (a generic card padding rule left gaps left, right and top).
- **Dialogs cut off on the right** (e.g. "Exit without saving?") — every centred dialog is now fitted to the screen.

### Changed
- **Quiz header redesign**: the running header and the separate progress card are one premium bar — countdown/progress ring, "Q4/30 · 1 answered · 29 left", timer, flag, bookmark, pause, and a ⋯ menu (edit, settings, zoom, exit) so nothing overflows on small phones. Tap it to open the question navigator.
- **Create Quiz**: removed the header banner. Order is now Quiz name + content → Preview → More options (quick mode, subject, folder) → Settings. New **Preview** card shows parsed questions with correct answers marked, warnings, or a notes summary.

### Added
- **Tap the selected option again to clear it** (exam mode; instant-feedback answers stay final).
- **In-app updates**: Profile → App updates ("Check for updates", what's new, one-tap APK download) and a home-screen notice. Quiet 12-hourly check, offline-safe.

## [2.4.0] - 2026-11-08

Create Quiz redesign and a new floating dock. Design language adapted from the Vyxel Apps "expressive" theme (soft tonal glass, pill shapes, springy motion, a primary action that carries its own status) — ideas only, no code copied; colours follow each of this app's own themes.

### Added
- **Create Quiz screen redesign**: hero header with live setting chips; separate "Your content", "Quiz details" and "Settings & Rules" cards; content now comes first so you can paste immediately.
- **Two-column layout on tablets/desktop** (≥1024 px): content and details on the left, settings always visible on the right in a sticky column. Phones keep a single column with settings tucked away.
- **Generate & Start action bar**: fixed above the dock, shows live readiness ("22 words · AI will generate", "30 questions ready · loads instantly, no AI needed", "2 files attached"), a sweep animation while generating, and a "Return to Quiz" companion when editing a live quiz. It glides down when the dock tucks away.
- **Floating glass dock** replaces the full-width bottom bar: selected tab lifts into a gradient tile, a glow glides between tabs on a spring, raised Create button, badges kept, reduced-motion respected.

### Fixed
- Duplicate "Scoring & Marks" header (accordion inside an accordion) and duplicate "Settings & Rules" label in the settings panel.
- Screen-enter animation left a permanent transform on the screen wrapper, which anchored every `position: fixed` element inside a screen to the wrapper instead of the viewport; it now leaves no transform.
- Create screen no longer capped at a narrow width on tablets.

## [2.3.1] - 2026-11-08

Edge-to-edge tablet layout: the whole app now fills the screen in landscape and portrait, with no dead gutters or overlaps.

### Fixed
- **Quiz screen did not fill landscape tablets** — it was a narrow rounded card (`70vh` wide) with empty left/right/top/bottom. It is now a full-bleed screen on every size; only the reading column inside is bounded on very wide displays.
- **Dead space from app zoom** — full-screen layouts used viewport units that CSS `zoom` mis-scales. They now use a measured, zoom-corrected viewport (`--qmp-app-w` / `--qmp-app-h`) that updates on resize, rotation and zoom.
- **Inconsistent widths across screens** — Home, Library, Stats, Profile and Settings had different hard caps (`max-w-4xl/5xl/6xl`) and padding. One shared, safe-area-aware app shell (`.qmp-shell`) now frames every screen; header and cards line up.
- **Overlaps** — the full-width offline bar covering the header is now a small, tap-through status pill that auto-hides; the floating zoom control no longer sits over answer options (collapsed by default, opens from the header zoom badge, auto-hides); toasts during a quiz appear above the footer instead of over the header buttons; bottom-nav clearance no longer hides the last card.
- Wasted 5–7 rem of empty space under quiz content removed.
- Header zoom badge was unreachable (`xs:` breakpoint does not exist); it is now a visible button.

## [2.3.0] - 2026-11-06

Header Overlap Resolution, Compact Horizontal Subject & Quiz Suggestion Carousels, 90% Mobile Zoom Default, Cloud Auth Profile Parity, and Editorial Split Sign-In Screen.

### Added
- **Single-Row Non-Overlapping Floating Header**:
  - Re-architected top navigation bar into a single-row floating capsule matching RJ Study Tracker.
  - Eliminated collision and badge stacking on compact mobile screens (<400px).
  - Compact brand pill (`Quiz Master PRO`), network status indicator (`📶 NET`), live cloud sync status, Android home-screen widget launcher, and notifications badge.
- **Space-Saving Horizontal Swipe Carousels**:
  - Replaced bulky multi-line subject chips with a single-row horizontal swipe carousel (`overflow-x-auto`) for subjects and topics.
  - Empty by default: no cluttering pre-loaded subjects. Users can add custom subjects or tap *From History*.
  - Horizontal swipe carousel for quiz name suggestions with `Daily Practice` as the default first recommendation.
- **Ultra-Premium Collapsible Settings & Rules Card**:
  - Refined bottom Settings & Rules panel into a collapsible accordion with live configuration summary badge (`Mixed • Classic • 60s/Q • +1/-0.25`).
- **Cloud Account & Profile Screen Parity**:
  - Resolved session state inconsistency between Supabase cloud sync and profile screen: active cloud accounts (`RDJ / ranarammali866@gmail.com`) now properly reflect in user display name, avatar, and live cloud sync indicator.
- **Editorial Split Sign-In Screen**:
  - Redesigned sign-in window into the split editorial layout matching RJ Study Tracker (`One syllabus. Every device.`, privacy assurances, trust cards, and seamless guest mode continuation).
- **Mobile Display & Zoom Optimization**:
  - Default out-of-the-box UI zoom set to 90% (10% zoomed out) for optimal mobile readability and layout balance.
  - Default theme set to Light mode (Parchment).

## [2.2.0] - 2026-11-06

Complete UI/UX transformation based on RJ Study Tracker design system, 4 Display Themes, 7 Accent Palettes, Mechanical Split-Flap Clock, Luxury Roman Watch Face, Multi-Exam Countdown Carousel, Android Native Home-Screen Widgets, Command Center & Smart Alerts, and Cloud Sync Center.

### Added
- **Liquid Glass Design System & Theme Engine**:
  - Full Liquid Glass design with translucent frosted glass, refined gradients, borders, and depth.
  - 4 Display Modes (Parchment, Ink, Papyrus, and Liquid Glass) cycling seamlessly via the theme toggle and persisted across sessions.
  - 7 Handcrafted Accent Palettes (Emerald, Amber, Rose, Amethyst, Azure, Copper, Slate) with dynamic CSS variables and edge-to-edge support.
  - Offline Typography: bundled Fraunces, Inter, JetBrains Mono, and Space Mono for a 100% offline-ready, luxury editorial experience.
- **Hero Clock & Mechanical Split-Flap Timer**:
  - Luxury Dashboard clock featuring Digital mode, mechanical Split-Flap animation, and luxury Roman Watch Face with live hands.
  - Integrated daily question counters, streak tracker, and average accuracy indicators.
- **Multi-Exam Countdown Carousel & Exam Shelf**:
  - Interactive Exam Countdown Shelf (`LiveExamCountdown` & `ExamPosterCard`) with real-time days/hours/minutes/seconds countdown cards.
  - Preloaded NORCET 8, NORCET 9, and ESIC Nursing Officer milestones with customizable target exam configurations.
- **Native Android Home-Screen Widgets**:
  - 4 native Android AppWidgets:
    - *Study Progress Widget* (streak, questions solved today, live accuracy progress bar).
    - *Subject Mastery Widget* (nursing subject shortcuts, quick practice launcher).
    - *Exam Countdown Widget* (days remaining, target milestone, direct exam review).
    - *Focus Practice Widget* (SRS flashcard review count, quick test launcher).
  - Native Capacitor plugin `QmNativePlugin` for updating RemoteViews and Android 12+ pinned shortcut requests (`requestPinAppWidget`).
  - Interactive in-app `WidgetManagerModal` with live phone previews and "Pin to Home Screen" actions.
- **Notification Center & Smart Command Center**:
  - Unified command center slide-over with actionable Smart Alerts (SRS reviews due, streak preservation alerts, upcoming exam countdown alerts, and daily goal targets).
  - Integrated Daily To-Do list with priority badges, completion toggles, and persistence.
- **Cloud Sync Center (`SyncCenter.tsx`)**:
  - Full 4-tab synchronization experience matching RJ Study Tracker: Overview, Devices (with remote device sign-out and device renaming), Recovery (restore points and revision rollbacks), and On-Device local data storage manager.

## [2.1.0] - 2026-11-06

Full UI/UX consistency and feature parity with RJ Study Tracker.

### Added
- **Interactive Cloud Sync badge.** Header sync status badge is now interactive: tapping it opens the Cloud & Sync settings section immediately.
- **Live StatusStrip in Profile.** Embedded the 4-tile system status card (Cloud sync status, Backup age, Storage protection, App version) with 1-tap navigation to corresponding settings sections.
- **Unified Design System tokens.** Shared Liquid Glass 2.0 material specifications with subtle aurora refraction, rounded card surfaces, and consistent typography and iconography across both applications.

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
