# Crux redesign brief (2026-11-01)

Answers from the owner's design interview. This is the source of truth for the new look; fixplan Appendix D tokens will be rewritten from it once a palette is picked.

## Feel
- Premium and sleek. Simple, informative, easy to navigate.
- Vibrant but not oversaturated colour that works in light and dark.
- References: the owner's nav video (`New folder/inspo.mp4`), IXL (skill list, score, explanation then next), Brilliant (one question per screen), Khan Academy (mastery labels), PMT (three taps deep at most).

## Navigation
- **Phone:** floating glass pill at the bottom with the 4 tabs (Today, Units, Practise, Insights). The active tab grows into icon + label; the others are icons only.
- **Phone top bar:** small glass bar. Unit switcher pill on the left; search, bell and account on the right.
- **Laptop:** floating vertical glass rail on the left. Icons only; the active item grows sideways into a pill with its label, others show a tooltip on hover. Search, bell, unit switcher and account sit in the rail too.
- **Search** opens inline inside the bar (as in the video). Finds units and topics, hub files and notes, and actions ("practise", "settings", "export").
- **Bell** opens the bar into a glass panel listing: CAT and exam reminders, "ready" notices (unit prepared, sheet ready), Hub announcements. Yellow dot for unread.
- Icons: thin line icons (1.75 stroke), no emoji anywhere.

## Motion (CSS only, owner raised the limit from 200 ms)
- Video-level: the active pill slides and stretches to the new tab (~300 ms, gentle overshoot). Labels slide out of the pill as it grows.
- Icon animations on activate: box lid lifts (Units), gear turns (Settings), bell rocks and drops its dot (Notifications), similar small moves for the others.
- Search and the bell panel morph out of the bar.
- All of it is CSS keyframes on inline SVG, so it ships in the cached app bundle (service worker), with no extra files. Off under `prefers-reduced-motion`.

## Surfaces
- Glass: real `backdrop-filter` blur where supported; solid tinted panel when it isn't, on `prefers-reduced-transparency`, and on low-power devices.
- Background: a subtle gradient with fine grain (gives the glass something to show).
- Shapes: pills for nav, buttons and chips; cards and sheets 20-24 px radius.

## Wallpapers (palette board v3)
- Corners: cards 14 px, bars and nav 14-16 px, buttons 10 px, chips 6 px. Matte: frosted glass with a light grain; grain on the Start button, progress fill and active tab, none on status chips (readability).
- Each palette is a wallpaper the student can switch, with a texture from its own world:
  Lagoon (light lines on a pool floor), Dusk (stars and haze), Ember (paper fibre and flecks),
  Harbor (harbour chart: depth contours, soundings, compass rose), Fern (Barnsley fern fronds from two corners),
  Spectrum (a prism splitting white light into the unit colours).
- Textures are generated in code (SVG filters, a canvas for the fern), drawn once and cached; no image downloads.
- Motion: Lagoon drifts, Dusk twinkles, Ember's flecks rise, Fern sways. Harbor and Spectrum stay still.
  Transform and opacity only, on their own layers. Off for reduced motion and from a Settings toggle.
- Cost check (Edge, phone size, CPU slowed 4x, software compositing): with 22 px glass blur, motion dropped
  the page from 56 to 24-30 fps because the blur is redrawn every frame. At 14 px blur, motion runs at 55-57 fps,
  the same as still. So the glass blur is capped at 14 px. Not yet tried on a real mid-range Android phone.

## Colour and type
- Theme follows the phone, with the toggle in Settings.
- Primary button: Hub yellow `#F2C200` with dark text.
- Palette: owner picks from a palette board (several options in light and dark).
- Type: a display font for titles, system font for body text. Picked on the palette board.

## Devices
- A mix of phones (iPhones, mid-range Android). Glass and motion must stay smooth on mid-range Android.

## First screens after the nav
1. Today
2. Unit page (Topics, Papers, Notes, Sheet)

## Built (2026-11-01, first pass in study/web)
- Owner's picks: Fraunces titles (self-hosted, opsz), Manrope body, numbers in the body font. Wallpapers Lagoon and Ember; "auto" is Lagoon in light mode and Ember in dark. Nav grain is half the card grain.
- Nav.jsx: phone top bar (unit pill with code and name, search, bell, account) and floating tab pill; laptop rail with the sliding label pill. Search finds units, topics and actions. The bell lists units with a paper in the next 7 days.
- wallpaper.css is generated (Lagoon caustics drifting, Ember fibre and rising flecks). Settings has Wallpaper and Moving wallpaper; motion starts off on Save-Data or very low memory.
- Today: Next up card with Start, "After that" list, unit cards with code, name and days. Unit names sit beside codes everywhere.
- Real blur only on the nav; cards are matte and unblurred so scrolling stays cheap.
- Checks: 170 tests pass; build 99 KB JS gzip; axe 0 serious on all routes, light and dark; screenshots at 375 and 1280.

## Later
- Spectrum wallpaper: the prism picture is inconsistent; redo before offering it.
- Bell: "ready" notices and Hub announcements need a server feed. Search: hub files and notes need an index.
- The old panels inside .legacy (Study this topic, Sheet, Explain it, Timed paper, Units editor) still need the D5 rebuild.
- Try moving wallpapers on a real mid-range Android phone.

## Round 2 (2026-11-01)
- Units page rebuilt: one card per unit (code, name, days chip, date, stage, "Date not announced", Files, Open). The topic chips, their "why" panel and the long help text left this page; topics live on each unit's Topics tab. The course picker and file list still use the old look inside .legacy.
- Focus page (#/focus): 25/5 or 50/10 blocks, a long break after every fourth, ring timer, chime and vibration at the end. The timer is stored as an end time in localStorage, so it survives a reload and a sleeping tab. A glass mini bar shows it on every other screen (above the tab pill on phones, bottom right on laptops) with pause and resume.
- "Others focusing": the server keeps one row per person with the time their block ends (crux_focus). The app sends one request when a block starts or stops and reads the count every 2 minutes while you focus. Only the count leaves the server; the page shows plain person icons.
- New material in the bell: GET /api/inbox?since= reads the bot's files table for your units (one indexed query, at most 50 rows). The app asks when it opens and when you return to it, at most every 15 minutes, and keeps the answer on the device in between. No polling while you study; no push yet.
- Owner action: run the new lines at the end of supabase/crux.sql in Supabase → SQL Editor (crux_focus and an index on files). Until then the Focus page says it can't see who else is studying.
- Later: push notifications (Web Push needs VAPID keys and a server sender), Hub announcements in the bell.

## Round 3 (2026-11-01): one look everywhere
- Rebuilt on the new parts, legacy.css deleted: Study this topic, Sheet (make, saved tabs, edit, print), Explain it, Timed paper (sticky clock bar), the course picker and "Read all files". The unit dropdowns inside panels are gone; the nav's unit pill chooses the unit.
- Units page: units grouped by This week / Later / Date not announced / Already sat, one row each (code, name, topics meter, days chip). A pencil opens date, stage, "Date not announced" and a link to the unit's files. The old per-unit file list on this page is gone; the unit's Notes tab lists its files.
- Checks: 173 tests pass, build OK, axe 0 serious on Units, Topics, Sheet, Explain it and Timed paper in light and dark.

## Round 4 (2026-11-01): sync, offline, bell
- Sync across devices (Discord account): focus timer, bell seen state, wallpaper and motion, current unit. POST /api/sync stores each as { v, at } in the student's document; the newest change wins. Crux reloads your data when you come back to it (at most once a minute).
- Offline: every API read is network-first with the last copy kept by the service worker, so any screen you've opened works offline. Changes that need no AI (dates, ratings, topics, settings, sync, timer, hints, marks) go into an outbox on the device and are sent in order when the connection returns; a notice shows how many are waiting. AI, file reading and downloads still need a connection. Known gap: an offline change shows up on screen only after it syncs.
- Bell: "Ready" (units whose files Crux has read, from data the app already has), "From the Hub" (announcements), new material, and papers coming up.
- /announce (Discord, admins only via default_member_permissions and a server-side check) writes to crux_announcements; the bell picks it up on its next check.
- Owner actions: run the new SQL at the end of supabase/crux.sql (crux_focus, crux_announcements, files index); register the command with `cd pc && node register-commands.js`.
- Checked in Edge: offline reload shows units and Insights; an offline change synced on reconnect; a unit picked on a laptop context opened on a phone context.
- Next (owner's picks): shared unit library (fixplan D1), study rooms, weekly recap and streak.

## Round 5 (2026-11-01): shared unit library, first slice (fixplan D1)
- server/shared.js. Class topic list per unit (crux_unit_kb): opening a unit's Topics tab with your own list of 3+ topics shares it if the class has none; later lists don't overwrite it; POST /api/class/share lets the owner replace it. A student with no topics sees "Your class already listed EMM 305" and can copy it in one tap (copy on write: ratings and edits stay private). Using it re-tags the unit's past-paper questions.
- Worked checkpoints per question (crux_question_kb, keyed by unit + wording): the first student's AI solve is reused for everyone, free and instant, and works without AI.
- Shared rows only hold material from hub files and papers, never what a student wrote about themselves.
- Checks: 176 tests (3 new); in Edge, a 3-topic list was shared, offered on an empty unit, and copied back.
- Owner action: run the new SQL at the end of supabase/crux.sql.
- Not yet from D1: auto-prepare on first open, shared lecturer hints ("the whole class heard this"), shared sheets, a "Share my list" button for the owner, outline-strict topic extraction.

## Round 6 (2026-11-01): shared unit library finished (fixplan D1)
- Auto-read: opening a unit whose files nobody has read starts reading them in the background (once per unit per session, online only); the text is stored once for the whole unit.
- Class hints (crux_class_hints): "The whole class heard this" when saving a lecturer hint shares it. Papers shows "What the class heard" with a count; "I heard it too" counts you once and copies it into your own hints so it moves your predictions. Topics travel as names; who heard it never reaches the app.
- Shared sheets (crux_kit_kb): ladders and recipes are reused per unit, stage and topic ("from your class"), with "Make a fresh one". Trap sheets are never shared (they carry the student's own mistakes).
- Topic suggestions follow the course outline strictly when there is one; without one, Crux says so, lists the papers' topics first and marks standard ones "Expected".
- Owner: "Make this the class list" on a unit's Topics tab (3+ topics).
- Checks: 178 tests; class hint shared and shown in Edge; axe 0 serious on Papers, Topics, Sheet.
- Owner action: run the new SQL at the end of supabase/crux.sql (crux_unit_kb, crux_question_kb, crux_kit_kb, crux_class_hints).
