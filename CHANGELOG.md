# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [3.1.0] - 2026-11-13

Signing in now works in the build that is installed, and the app no longer pays for effects the phone cannot afford.

### Fixed
- **Sign-in could never succeed on the APK.** The released app ships without a Supabase project (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not set in CI), so `isCloudConfigured()` was false: the sign-in window replaced the form with a "not configured" notice, *Create account* and *Sign in* threw `CloudConfigError` behind the scenes, and Settings → Cloud hid the form entirely. Every user who typed an e-mail and password got nothing back. The account layer is now dual-mode: with a Supabase project it is the cloud account as before; without one, the account is created and verified **on the device** — e-mail, display name and a PBKDF2-SHA256 password hash (210 000 rounds, random 16-byte salt). Nothing is sent anywhere, and it works in airplane mode.
- **Wrong passwords, unknown e-mails and lock-outs now explain themselves.** The form shows the exact reason ("Wrong email or password. 4 attempts left.", "No account exists on this device yet — create one first", a timed cool-down after five wrong attempts), instead of failing silently. Both wrong-email and wrong-password cases give the same wording, so the form never reveals whether an account exists.
- **Password reset is honest.** On a device account there is no mail server, so *Forgot password?* says exactly that instead of pretending a link was sent.
- **Cloud failures of the "not configured" kind were invisible** (`friendlyAuthError` had no case for `CloudConfigError`, so the raw message was dropped in some paths). A missing project now reads as "the account is kept on this device instead".
- **Settings → Cloud hid the account form** when there was no cloud project, leaving a dead warning. The form is always present, with a clear note about what syncs (nothing, in this build) and what is protected.
- **Sign-out was unreachable** in Settings → Account for anyone without a Supabase project (`hasBackend()` gated the whole block). Account, sign-out, rename and *Change password* now work in both builds; a device account asks for the current password before changing it.

### Fixed (performance)
- **The analog dashboard clock re-rendered 30 times a second forever** — a `requestAnimationFrame` loop that kept painting the second hand even after the card scrolled off screen (Chrome and the Android WebView keep rAF running for off-screen elements). It is now one 1 s tick, stopped by an `IntersectionObserver` when the card leaves the viewport and by `visibilitychange` when the app is backgrounded.
- **Every exam countdown card kept a 1 s timer alive** whether or not it was on screen. Timers now stop off-screen, so a dashboard with several exam posters no longer wakes the CPU dozens of times a minute.
- **A 60 Hz motion sensor listener ran all the time** for shake-to-undo. It is sampled at 10 Hz — the gesture needs two shakes over ~0.5 s, so nothing is lost.
- **Frosted glass everywhere, on every phone.** Backdrop blur forces the WebView to re-composite the layer behind every blurred surface on every frame; on a 4-core phone that is the difference between a smooth list and a stutter. A single performance budget (`src/platform/perfMode.ts`) now decides before the first paint: full glass on capable devices, a light mode without blur on low-end ones (cores ≤ 4, ≤ 2 GB RAM, data-saver or reduced-motion). After the first screen is up, the app measures real frames and drops to light mode if the device cannot hold 45 fps. *Settings → Accessibility → Smoothness* lets the user pick Auto / Full / Light.

### Added
- **Diagnostics, on the device** (*Settings → Accessibility → Diagnostics*): app health (version, rendering mode, cores, RAM, storage used, network) plus the last problems the app recorded — window errors, unhandled rejections, render crashes and high-memory warnings — with *Copy report* for a support message. Bounded to 40 entries, never includes quiz content, never uploaded.
- **`tests/localAccount.test.ts`, `tests/accountStore.test.ts`, `tests/performance.test.ts`** — password hashing, lock-outs, session persistence across restarts, the exact reasons a sign-in fails, the performance-budget rules and the diagnostics log.
- 12 new `verify:repo` guards so the account path, the password reveal control, the blur budget and the clock fix cannot silently regress.

## [3.0.0] - 2026-11-13

Every popup in the app is now rendered in one place, on one z-index scale, so nothing can hide behind the tab bar, be clipped by a translucent card or ignore the back button — and reports are rebuilt as a premium, print-ready dashboard with a real page engine behind it.

### Fixed
- **Popups opened inside the card they were launched from.** Sync Center → *Rename device*, the Generate Quiz shuffle sheet and the Download Report rationale sheet were rendered inline inside a glass card whose `backdrop-filter` and `transform` make it the containing block for `position: fixed`. The overlay was therefore sized to that card — off-screen, clipped and impossible to close. Every overlay now portals to `document.body` (one `Overlay` component, `MobilePopover` built on it), so a popup is always full-screen regardless of where its trigger lives.
- **Sheets rendering underneath the bottom navigation.** Hand-picked z-indexes (50, 60, 200, 300 … 1300) overlapped the tab bar at `z-100`, so a sheet could open *behind* it. Replaced with a single named scale — nav `100` < sheet `400` < menu `450` < panel `500` < dialog `600` < blocking `800` < toast `900` — applied through `--qmp-z-*` variables, including the shared Radix primitives. A popup that opens from another popup is stacked relative to its parent instead of guessing.
- **Dialogs taller than the screen** (Alert Dialogs in Generate Quiz, report rationale, question editing at 90 % zoom or in landscape) had no maximum height, so their buttons fell off-screen. Dialog surfaces now cap at `90vh` on a scroll-capable track, and every dialog footer is a sticky bar so the buttons stay visible; the alert dialog footer also stacks full-width on phones.
- **Page scrolling unlocked under an open popup.** Each overlay used to save and restore `document.body.style.overflow` itself, so closing one popup (or the second of two) re-enabled scrolling while another was still open. One refcounted lock now owns it, together with a refcounted "screen busy" lock for blocking overlays.
- **Android back button closed the app instead of the popup.** There was no back-button handler at all. A single chain now closes the top-most popup (newest first) and only leaves the screen — or the app — when nothing is open.
- **`PromptTool`'s floating trigger** used `z-[100]`, landing on top of the tab bar; it now sits one step above the nav. `AISourceControls` used `z-[60]` inside a `relative` card; it is a normal flow-level dropdown again.
- **Long content silently truncated in reports.** Text that exceeded an element's line budget was cut without a marker. Cards now grow, options/explanations wrap in full, and anything genuinely cut is shown with an ellipsis.

### Added
- **New "Master" report template (v3)** — the premium dashboard, on screen and in the exported PDF from the same layout engine, so the preview is exactly what prints:
  deep-purple gradient masthead with trophy, brand line, title, metadata and a verdict badge with a bar chart; a six-card statistics bar (Shown · Correct · Wrong · Skipped · Accuracy · Score); question cards in two balanced columns tinted by result (green `#f0fdf4`/`#bbf7d0`, red `#fef2f2`/`#fecaca`, amber `#fffbeb`/`#fde68a`) with numbered badges, status pills and a purple `#f5f3ff` explanation box headed `Ans.N.: (B) …`; a `Quiz Summary` card closing the last column; and a footer with the report name, `Page N of M` and the brand.
- **Self-contained HTML report** using the same design — one file, inlined CSS, inline SVG icons, Inter with a system fallback, `max-width:1000px` column, 16 px grid, 12 px radii and print rules. No scripts, fonts or network requests, so it opens offline and exports to PDF from any browser.
- **Options adapt per card**: short options sit two-up, long options get the full card width, so nothing is squeezed or stretched.
- **Answer-key and markdown modes** (revision sheets, notes, legacy HTML) render as full-width cards on the same design.
- **`circle` and `opacity` page operations**, drawn identically by the SVG preview and the pdf-lib writer, so status dots and the chart motifs print exactly as previewed.
- **`scripts/audit-report.ts`** and **`tests/masterTemplate.test.ts` / `tests/reportTemplateWiring.test.ts`** — layout invariants (nothing outside the margins, no overlapping cards, no text overflowing its card, footers and page numbers, every question present), template dispatch, and the design tokens, so the report cannot silently regress.

### Changed
- Reports default to the new template; **exam papers keep the classic two-column paper look** (`template: 'classic'`), and the choice is available per report.
- The web-page export now produces the same dashboard as the PDF instead of a separate lightweight HTML page.

## [2.10.0] - 2026-11-13

Every AI feature now runs directly on your device with your own key, cloud sync and quota bugs are fixed, exports and Trash preserve full question details on synced devices, Android home-screen widgets show real data and open the right screen, and offline/APK builds are leaner and stricter.

### Added
- **Full on-device BYOK AI (no backend needed):** AI Study Coach & streaming chat, Photo-to-Quiz OCR, 7-day Study Plan, Study Strategy, AI Notes, Revision Notes, Question Verification / Dispute auto-fix, Quiz Generation and Simple Explanations all run directly from the PWA and Android APK using your Gemini, Claude, OpenAI or Cohere key in *Settings → AI*.
- **Multimodal vision across providers:** Photo-to-Quiz OCR and image prompts work with OpenAI, Anthropic Claude and Google Gemini keys (no longer restricted to Gemini only).
- **Android widget deep-links & real widget data:** Tapping home-screen widgets now opens Quick Quiz, Subject Setup or Exam Countdown directly, and Subject / Exam widgets display your real subjects and upcoming exams instead of sample Nursing/NORCET placeholders.
- **RFC-4180 CSV importer:** Supports multiline quoted questions/explanations, escaped `""` quotes, CRLF line endings and UTF-8 BOM files.

### Fixed
- **Cloud sync write-guard & 24 MB quota math:** Applying incoming cloud changes or restore points no longer triggers a redundant re-dirty sync loop, and `quiz_sync_push` in `supabase/quiz_schema.sql` now processes deletions first and subtracts replaced section sizes before checking the 24 MB cap.
- **Offline exports, imports & Trash on synced devices:** Notes PDF/Word/HTML/Text exports, JSON history exports/imports and 30-day Quiz Trash now hydrate sharded `qd:YYYY-MM` question details and use the offline-capable report pipeline (`exportSmartReport` / `exportTextReport`) instead of `window.print` popups that silently fail in Android WebView.
- **Unified Trash:** *Settings → Trash* and the Library toolbar badge now show both deleted library items and deleted quiz results (`history_trash`) in one place.
- **Zero-network font boot:** Removed the runtime `fonts.googleapis.com` stylesheet injection on launch so cold starts make zero external requests; enforced in `verify-repo` and `offline-smoke`.
- **Security & accessibility:** Escaped HTML attributes and `$&` replacement patterns in offline notes, restricted `<mark>` HTML passthrough in Markdown to attribute-free tags, and enabled pinch-to-zoom in the viewport.
- **Monotonic Android `versionCode`:** Release APKs now compute a semver-derived monotonic `versionCode` so manual builds and tag builds always upgrade cleanly over earlier releases.
- **Exact local backup restore:** Restoring or importing a backup file now resets sections (including `library_tree` and `qd:*` shards) that were absent from the snapshot.

### Removed
- **371 unused template packages** (`@aws-sdk/*`, `googleapis`, `stripe`, `twilio`, `dropbox`, `@elevenlabs/*`, `express`, etc.) removed from `package.json` and `package-lock.json` for faster installs and a cleaner supply chain.

## [2.9.0] - 2026-11-11

Drafts, true multi-device sync of quiz data, and a tighter question / report UI.

### Added
- **Drafts.** Leaving a quiz now saves it to Drafts instead of throwing it away. Last **5** quizzes only (the oldest is replaced by the 6th), **one draft per quiz** (same questions = same draft, even if shuffled). The home screen shows them as swipeable cards with progress, device and time, Resume and delete with Undo. Finishing a quiz removes its draft.
- **Drafts follow you between devices**: leave a quiz on the phone, resume it on the tablet. The newest save wins; resuming something another device used in the last 3 minutes asks first.
- **Question details sync** (`qd:YYYY-MM` sections). Before, only the summary of a finished quiz synced, so a second device counted it in the totals but could not open it (“Quiz details not available”), and automatic backups and restores had the same hole. Questions, answers and explanations are now part of sync, automatic backups and restore.

### Changed
- **Reports & downloads**: eight squircle tiles in a compact two-line grid (Full, Correct, Mistakes, Skipped, Notes, Exam, Revise, Saved), one-tap PDF on each, the sentence “Made on your device. Works offline. Saved to Downloads.” on one straight line, filters in a smooth swipeable capsule line.
- **Capsule filters everywhere** (report options, Progress filters, review dashboard): one line, smooth sideways swipe with snap, rounded capsules, no overlapping labels.
- **Review dashboard**: status filters are emoji only except **All** (✅ ❌ ⏭️ 🔖); the question card header is one straight line of emoji (number, ✅/❌/⏭️, 🟢/🟡/🔴); tinted card by result; **📖 Rational | ⚖️ Dispute | 💾 Save | 🤖 AI** in one line at the bottom; the explanation sits in a white box with a purple bar titled “Ans. - (b) text”.
- Exit-quiz dialog now says “Save & exit”.

### Notes
- The server keeps the last 5 versions of your synced data; question details make those versions larger. The server limits (24 MB total, 300 sections) still apply; details are packed per month and compressed.
- Question details written on a device reach the other devices after that device's next sync; open the app once on the device that has the quizzes while signed in.

## [2.8.0] - 2026-11-11

Reports rebuilt from scratch: one new format, made on the device, saved to Downloads with a notification, full-page premium preview. Plus Sync Center fixes.

### Added
- **New report format** (numbered `Q1.`, lettered options, dashed rule, bold `Ans.1. : (B) …`, explanation, one or two columns, `Page N of M` footer with your brand). Used for Full report, Correct, Mistakes, Skipped, Study notes, Exam paper (answer key at the end) and Revision sheet. Hindi, Greek and medical symbols render correctly (fonts are bundled).
- **PDF is created on the device**: no print window, no server, works with no internet. Word, text and web-page versions follow the same settings.
- **Saved to Downloads / R.J QUIZ** (Android, no permission needed) with a **“Report saved” notification** that opens the file when tapped. Open / Share buttons, a “Recently saved” list, and a share-sheet fallback.
- **Full-page premium preview**: real pages (exactly what you download), page indicator and jump, zoom and pinch, report-type tabs, options for answers (after each / key at end / hidden), your answer, book and AI rationale, columns, text size, level and order. “Generate AI explanations” fills missing ones with your own key.
- **Settings → Reports & downloads**: columns, text size, paper (A4 / Letter), footer name, notifications, saved-files list.
- **Revision sheets run on the device** with your own AI key (no server).

### Changed
- The “All systems healthy…” status card moved from Progress to **Settings** (profile photo). Progress now shows only your progress.
- E-mail report button is hidden when there is no server (it could not work).

### Fixed
- **Sync Center**: header no longer sits under the status bar; **dialogs (rename device, sign out others, upload / download copy, delete, change password) were rendering behind the Sync Center and could not be seen or used** — fixed for every dialog in the app; **sign out now works offline** and really forgets the saved session (it used to silently stay signed in); sign-out asks for confirmation; renaming a device updates the cloud list.
- Back from a report preview returned to the home screen instead of Progress.
- Report downloads in the Android app (blob links and the print window do nothing in the WebView).
- Server-only PDF/revision calls no longer delay or break downloads.

## [2.7.0] - 2026-11-10

In-app updates that really install, a Settings hub behind your profile photo, and a premium Progress screen.

### Added
- **True in-app update (like RJ Tracker).** *Settings → App updates* downloads the new APK inside the app with live progress, verifies SHA-256 (when published), package name, higher version and the same signing key on the device, then opens Android's installer. Handles the "allow installs from this app" permission, offline, GitHub rate limits and bad downloads with clear messages. Only `github.com/therjmali/quiz-master-pro/releases/download/…` over https is ever downloaded; the native side re-checks this. A leftover downloaded APK is removed on the next start.
- **Settings hub behind the profile photo (top right)**: account card (photo, name, emoji, sign-in, cloud data), quick jumps (updates, cloud, backups, trash), the full searchable settings list, and sub-pages for Awards, AI notes, Quiz templates, Trash and API keys. A dot on the photo shows when an update is waiting.
- **Profile photo that works offline**: the chosen picture is centre-cropped and stored on the device as a small JPEG (the old upload needed a server that does not exist in the APK).
- **Premium Progress screen** (bottom tab, was *Profile*): status hero with avatar, rank, streak and cloud state, a **next-rank meter** (quizzes and accuracy still needed), six lifetime tiles, live Cloud / Backup / Storage / App status, Lifetime Score, report builder, and the Overview with Correct / Mistakes / Skipped views.
- `npm run test:ui:settings`: real-browser checks for the new navigation on three screen sizes. New unit tests for the updater state machine, URL trust, digest parsing, rank maths and photo cropping.

### Changed
- Status-strip tiles and the home update strip open the right Settings section directly.
- *App icon & device* no longer duplicates update buttons.

### Removed
- **Export, Deploy & Install** (source-code zip, Android project template, third-party APK generators, install guide) and the *Downloads* tab. Backup & restore stays under Settings → Library & Data and Automatic Backups.
- Profile tabs (Notes, Awards, Templates, Trash, API keys, Settings, Downloads) from the bottom screen; they now live in Settings.

### Notes
- Updating requires the installed copy to be signed with the permanent key (v2.5.0 and later). Older copies still need the one-time backup, uninstall, install, restore.
- Android's install confirmation cannot be bypassed by any app.

## [2.6.0] - 2026-11-08

Status-bar fix, compact header, results that fit, and a UI regression suite.

### Fixed
- **Status bar drawn over the quiz header** (clock/signal icons on top of "Q1/30" and the buttons) on phones and tablets. The Android WebView reports no safe-area inset, so MainActivity now measures how much the system bars actually cover the WebView and the app pads every screen by exactly that (works on any WebView version; 0 when the content already sits below the bars). All safe-area uses go through one token.
- **Results screen did not fit the screen** — a narrow centred column with empty sides. It now uses the full width: two columns in landscape (score gauge left, details right), single column in portrait.
- **Result action buttons stacked vertically** (a `xs:` breakpoint that does not exist kept them in a column): now compact tiles — one single row in landscape, a 2-row grid in portrait.
- **Submitting asked twice** ("Submit All Answers?" and then again on a summary page). The dialog now submits directly.
- Exit dialog dismissed with Esc or a tap outside left the quiz paused; it now resumes. Esc closes the question editor.
- Going back when blocked (expired question / Mock Exam) now says why instead of doing nothing.
- Results no longer fire a failing background request to a revision-sheet server that does not exist in static/offline builds.

### Changed
- **Quiz header, all orientations**: bookmark, pause and **exit** stay outside; **flag**, edit question, quiz settings and zoom live in the ⋯ menu (a dot on ⋯ shows a flagged question). Landscape no longer shows a wide row of icons.

### Added
- `npm run test:ui` — 45 real-browser checks: header fit on phone/tablet in both orientations, left/right swipes (including slow, vertical and edge cases), every popup and menu, pause/resume, submit, exit, results tiles, safe-area handling.

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
