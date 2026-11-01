# REFIX: Study Desk and the Engineering Study Hub, redesigned from first principles

> **What this is.** A complete plan to rebuild the front end of **Study Desk** (`discord-sync-bot/study/`) and the
> **Engineering Study Hub website** (`kkkkenya/engstudyhub`) as one coherent product. The plan also covers the
> security, honesty and SEO problems found along the way.
> It was written on 1 Nov 2026 after reviewing `study-dashboard` at `2ba3174` and `engstudyhub` at `fd7af37`.
>
> **The brief.** Design it as if nothing existed: no current component, layout or style is kept just because it
> exists. The *capabilities* are kept, because they are tested and work: the server, the data model, the
> Breakpoint model, predictions, checkpoints and the bot. Everything a student sees is redesigned.
>
> **How to use it.**
> - Paste the relevant part into a coding session with `study/BUILD-PROMPT.md`.
> - Build one numbered step per session.
> - Don't start a step until the previous one meets its **Done when** and its tests are green.
> - Part 0 is not optional. Do it first, today.

---

## Contents

- [Part 0: Fix now (security, honesty, broken things)](#part-0-fix-now)
- [Part 1: What we are building, and for whom](#part-1-what-we-are-building)
- [Part 2: One design system for both products](#part-2-one-design-system)
- [Part 3: Study Desk, redesigned](#part-3-study-desk-redesigned)
- [Part 4: The Engineering Study Hub website, redesigned](#part-4-the-hub-website-redesigned)
- [Part 5: Releases, versions and downloads](#part-5-releases-versions-downloads)
- [Part 6: Execution plan](#part-6-execution-plan)
- [Part 7: Rules for AI coding sessions (anti-slop)](#part-7-rules-for-ai-coding-sessions)
- [Appendix A: Feature map, old to new](#appendix-a-feature-map)
- [Appendix B: Route maps](#appendix-b-route-maps)
- [Appendix C: Copy rules and glossary](#appendix-c-copy-rules)
- [Appendix D: Verification commands](#appendix-d-verification)
- [Appendix E: Decisions the owner must make](#appendix-e-owner-decisions)

---

## Part 0: Fix now

These are problems that cost money, mislead people or leak access. Each one is small. Do them before any
redesign work, in this order.

Severity: **P0** = today · **P1** = this week · **P2** = before the redesign ships.

### 0.1 P0: A live RapidAPI key is committed to the public website repo

- **Where:** `engstudyhub/src/pages/JobBoard.tsx`, line 8 (`const RAPIDAPI_KEY = "…"`). The browser sends it as the
  `x-rapidapi-key` header (line 135). It is in git history and in every deployed JS bundle.
- **Risk:** anyone can copy it and use up your RapidAPI quota, or run up a bill if the plan is paid.
- **Fix:**
  1. In the RapidAPI dashboard, **rotate the key now**. Rotating is what protects you. Removing it from the code
     doesn't, because the old one is already public.
  2. Add a server function `api/jobs.js` (Vercel) that calls JSearch with `process.env.RAPIDAPI_KEY`. It accepts
     only the filters the page uses (`query` ≤ 80 chars, `country` ∈ {KE, ''}, `date_posted` ∈ a fixed list,
     `employment_types` ∈ a fixed list) and caches each response for 6 hours.
  3. `JobBoard` calls `/api/jobs?...` and holds no key. Delete the constant.
  4. Set `RAPIDAPI_KEY` in Vercel → Project → Settings → Environment Variables.
  5. Optional: purge the key from git history with `git filter-repo`. Rotation makes this cosmetic.
- **Done when:** `git grep -i rapidapi` finds only the server function and docs, and the job board still loads.

### 0.2 P0: `claude-proxy` is an open AI relay

- **Where:** `engstudyhub/supabase/functions/claude-proxy/index.ts`. It sends `Access-Control-Allow-Origin: *`,
  takes **any** `system` prompt and **any** `max_tokens` from the caller, and has no rate limit. The only "auth"
  is the Supabase anon key, which is public by design: it ships in the site bundle and in the committed `.env`.
- **Risk:** anyone can use your Lovable/Gemini credits as a free general-purpose chatbot. The `402: AI credits
  exhausted` branch shows this would surface as an outage of the Formula Directory.
- **Fix (pick one):**
  - **A. Members-only (recommended).** The AI formula search becomes a member perk: the visitor signs in with
    Discord (the bot's `/auth` flow already exists in `discord-sync-bot`), and the function checks the member has
    the Basic or Premium role.
  - **B. Public but locked down:**
    1. Fix the system prompt on the server. Never accept it from the client.
    2. Accept only `{ query }` with `query.length ≤ 200`.
    3. Set `max_tokens` = 800 on the server.
    4. Allow only `https://www.engineeringhub.site` (and preview domains) in CORS.
    5. Limit each IP to 20 requests a day, counted in a Supabase table `ai_rate(ip_hash text, day date, n int)`
       with an atomic RPC like `study_count`.
    6. Log the token use per day.
  - **C. Turn it off** until A or B exists, and keep the static formula list.
- **Done when:** a `curl` from another origin with a custom `system` field is refused, and the 21st request from
  one IP in a day returns 429.

### 0.3 P0: Fake scarcity and a waitlist that goes nowhere

- **Where:** `engstudyhub/src/components/FoundryDropWaitlist.tsx`.
  - `DROP_CONFIG.badgeText = "CLASSIFIED ALPHA DROP // 19 SEATS REMAINING IN BATCH 01"`, with
    `totalSeats: 100, initialClaimed: 81` hardcoded.
  - Every visitor who "claims" a seat gets serial `81 + 1 = 82`.
  - The "pass" is saved **only in the visitor's `localStorage`**, so you never receive the signup.
- **Risk:**
  - You lose every lead.
  - "19 seats remaining" is a false claim to the people you want to pay you. Kenya's Consumer Protection Act
    prohibits false or misleading representations, and it costs trust when a classmate compares serial numbers.
- **Fix:**
  1. Remove the counter and the "classified" copy now.
  2. If you want a real waitlist:
     - Use a Vercel function `api/waitlist.js` that inserts into a Supabase table
       `waitlist(id, handle, university, year, contact, created_at)`.
     - Add a honeypot field and a per-IP limit.
     - Show a count **only if it comes from that table**.
     - Add a privacy notice, because you collect contact details (see 4.9).
- **Done when:** a signup shows up in Supabase, and no number on the page is hardcoded.

### 0.4 P0: Testimonials with stock-looking photos

- **Where:** `engstudyhub/src/pages/Index.tsx`, lines 6–8 and 76–78 ("Brian M.", "Aisha K.", "Denis O." with
  `avatar-*.jpg`).
- **Fix:**
  - If these are real members who agreed to be quoted, keep the quotes and use their real photo or initials,
    with their consent.
  - If not, **remove them today**. Replace them later with real quotes collected in Discord (Part 4.4).
- **Done when:** every quote on the site has a real person behind it who said yes.

### 0.5 P1: The pricing maths is wrong

- **Where:** `engstudyhub/public/redesign/index.html`, about line 1251: *"Saving: KES 400 saved by going Premium
  from day one."*
- **Fact:** 8 semesters of Basic = 8 × 50 = **KES 400**. Premium = **KES 800**. Premium costs KES 400 *more*. The
  FAQ on the same page (about line 1340) says so correctly.
- **Fix:** replace the row with something true, e.g. *"What Premium adds: the build sheets, squads, daily support
  and the career pipeline, for the whole degree."* Never put a "saving" row on a plan that costs more.

### 0.6 P1: The 74 MB installer is committed to the website repo

- **Where:** `engstudyhub/public/downloads/StudyDesk.exe` (74,047,488 bytes).
- **Problems:**
  - Every clone and every Vercel build carries 74 MB.
  - There's no checksum, no signature and no version on the file.
  - The download page claims "v1.1.0", "Early Access v1.2.0-beta" and "71 MB", none of which comes from the file.
- **Fix:** Part 5 (GitHub Releases, `latest.json`, SHA-256). Remove the file from the repo once the release link
  works.

### 0.7 P1: SEO, with 115 sitemap URLs that don't serve their pages

- **Where:**
  - `engstudyhub/public/redesign/sitemap.xml` and every unit page's `<link rel="canonical">` point to
    `https://www.engineeringhub.site/units/<slug>/`.
  - The pages live at `/redesign/units/<slug>/`.
  - `vercel.json` rewrites **every** unknown path to `/index.html` (the React app).
- **Checked locally (`vite preview`):**
  - `/units/emm-302-strength-of-materials/` returns the React app's generic page with HTTP **200**.
  - `/sitemap.xml` returns the React HTML, not XML.
  - The root `robots.txt` has **no `Sitemap:` line**.
  - Any made-up URL returns **200** (a soft 404).
- **Verify on the live domain:**
  ```bash
  curl -sI https://www.engineeringhub.site/units/emm-302-strength-of-materials/
  curl -s https://www.engineeringhub.site/sitemap.xml | head -3
  ```
  If the first doesn't return the unit page, Google has been told to index 115 URLs that show the wrong content.
- **Quick fix (P1, before the redesign):**
  - Add `vercel.json` rewrites so `/units/:slug*` → `/redesign/units/:slug*`, `/sitemap.xml` →
    `/redesign/sitemap.xml` and `/units/` → `/redesign/units/`.
  - Put the SPA catch-all **after** them.
  - Add `Sitemap: https://www.engineeringhub.site/sitemap.xml` to `public/robots.txt`.
- **Proper fix:** Part 4.7.

### 0.8 P1: Study Desk, undo the last two commits' damage

- **Where:** `discord-sync-bot`, branch `study-dashboard`, commits `a26f6d3` and `2ba3174`.
- **Fix:**
  1. `git branch backup/2026-10-29 2ba3174` (safety).
  2. `git branch study-friends a26f6d3`. This keeps the gateway, friend mode and installer for later (Part 5 and
     Appendix E).
  3. On `study-dashboard`, revert `2ba3174`, then revert the parts of `a26f6d3` outside the gateway, with **new
     commits** (the branch is pushed, so no history rewrite).
  4. Untrack `discord-messages.md`, `study-hub-milestones.html` and `study/PLAN-PROMPT.md` (`git rm --cached`)
     and add them to `.gitignore`. The files stay on your disk.
- **This step is superseded if you go straight to Part 3.** The redesign replaces the whole front end anyway. Then
  only steps 1, 2 and 4 matter.

### 0.9 P1: A failing test was committed

- **Where:** `study/test/answer.test.js`, "superscript exponents are read". It has failed since `b7a80e7`.
- **Cause:** `study/server/answer.js`, line 59, computes `value = mantissa × 10 ** exp`. In floating point,
  `4.5 * 10 ** -5` is `0.000044999999999999996`.
- **Fix:** build the number from its decimal text, `Number(`${mantissa}e${exp}`)`, which gives `4.5e-5` exactly.
  Keep the comparison tolerance as it is.
- **Done when:** `npm test` shows 136/136 passing.

### 0.10 P2: Housekeeping

- `engstudyhub/.env` is committed. The anon key in it is meant to be public, but commit an `.env.example` instead
  and add `.env` to `.gitignore`, so a future secret doesn't follow the same path.
- `engstudyhub` has both `bun.lock` and `bun.lockb` **and** `package-lock.json`. Pick one package manager (npm,
  which Vercel uses here) and delete the other lockfiles.
- About 45 of the 49 `src/components/ui/*` shadcn files aren't imported by any page. Delete them in Part 4. They
  slow every build and mislead anyone reading the code.

---

## Part 1: What we are building

### 1.1 The people

| Who | Situation | What they need from us |
|---|---|---|
| **The owner** (you) | 3rd-year Mechanical (3.1) at KU. Runs the Discord server, the bot and the website. Exams are uncertain because of the strike. | A tool that tells you what to do next, and checks your working honestly. |
| **A KU engineering student** (50–100 paying, later) | On a phone most of the day, a Windows laptop for study. Mobile data is expensive. Revises from WhatsApp-forwarded PDFs. | Past papers by unit, a clear plan and fast feedback, without setup pain. |
| **A first-time visitor** to the website | Found us through a classmate or a Google search for "EMM 302 past papers". | Proof it's real, what's free, what costs money, and one obvious next step. |

### 1.2 The one sentence for each product

- **Study Desk:** *"Tells you the next question worth your time, then shows you exactly where your working
  broke."*
- **Engineering Study Hub website:** *"Every KU engineering unit's past papers and study crew, one Discord
  away."*

Every screen has to serve its sentence. Anything that doesn't is cut.

### 1.3 The Study Desk loop (the whole product in five steps)

```
  ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
  │ 1. Pick    │ →  │ 2. Attempt │ →  │ 3. Check   │ →  │ 4. Fix     │ →  │ 5. Next    │
  │ what's most│    │ closed book│    │ answer +   │    │ the link   │    │ (the plan  │
  │ likely ×   │    │ on paper,  │    │ checkpoints│    │ that broke │    │  updates)  │
  │ weakest    │    │ timed      │    │ "broke at" │    │ teach/redo │    │            │
  └────────────┘    └────────────┘    └────────────┘    └────────────┘    └────────────┘
```

**Design rule:** from opening the app, step 2 is **one tap** away, and step 3 is **one more**. Today's measure
(audit D) is 3–5 clicks through separate sections.

### 1.4 Success measures (check after 2 weeks of real use)

| Measure | Target | How to read it |
|---|---|---|
| Opening the app to the first attempt | ≤ 1 tap, ≤ 10 s | time between `GET /api/state` and the first `POST /api/attempts/check` |
| Checks a day on study days | ≥ 3 | `attempts` per Nairobi day |
| Breakpoints found and confirmed | ≥ 60% of wrong answers | attempts with `brokeAt` ÷ attempts with verdict `wrong` |
| You agree with the colours | ≥ 4/5 | ask yourself weekly: "are the red topics the ones I'd fail?" |
| Website: Discord joins from the site | tracked | the `?src=site` param on the invite link (Part 4.10) |

### 1.5 Non-goals (don't build these)

- Flashcards, in any form.
- Social features inside Study Desk. Discord is the social layer.
- An account system or cloud sync for Study Desk. It stays local-first, and friend mode uses the gateway.
- Gamification beyond the setup checklist: no XP, levels or streak shaming.
- A mobile app. The website and Discord are the mobile surface. Study Desk is laptop-first, but must still work
  at 375px.

---

## Part 2: One design system

Both products share **one** visual language, so a student moving from the website to Study Desk feels they're in
the same place. Today there are **six** identities across the two repos:
- Study Desk: brutalist, then "Apple iOS".
- Website `/`: brutalist green/yellow.
- `/redesign/`: editorial serif.
- `/download`: SaaS.
- The unit pages: Figtree on cream.

Across them that's five font families: Space Grotesk, Inter, JetBrains Mono, Figtree and Instrument Serif. All of
it is retired.

### 2.1 Direction: "Drafting table"

Calm and precise, like a clean engineering drawing: paper-white or graphite surfaces, ink-dark text, **one** action
colour (blue ink), and the Hub's **yellow EH mark** as the brand accent. Numbers are monospaced because engineers
read them.

What it is **not**:
- No brackets or slashes as decoration (`[ 01 / TODAY ]`, `///`).
- No marquee tickers.
- No ALL-CAPS labels.
- No pill buttons with multi-line text.
- No version strings or `localhost` in the UI.
- No glassmorphism.
- No more than one card nesting level.

### 2.2 Colour tokens

All contrast ratios were computed (WCAG 2.x). Every text and background pair below is ≥ 4.5:1.

| Token | Light | Dark | Use | Contrast (light / dark) |
|---|---|---|---|---|
| `--bg` | `#F7F6F2` | `#111317` | page | n/a |
| `--surface` | `#FFFFFF` | `#191C21` | cards, sheets | n/a |
| `--ink` | `#16181D` | `#ECEAE4` | body text | 16.4 / 15.5 on bg |
| `--ink-2` | `#4A4F59` | `#A7ABB4` | secondary text | 7.6 / 8.1 |
| `--line` | `#DEDBD2` | `#2C3038` | borders, dividers | n/a (non-text) |
| `--primary` | `#1F49C7` | `#7FA2FF` | the one action colour, links, focus | 6.9 / 7.5 on bg |
| `--on-primary` | `#FFFFFF` | `#111317` | text on primary buttons | **7.4 / 7.5** (dark mode uses dark text: white on `#7FA2FF` is only 2.47) |
| `--primary-soft` | `#E8EEFC` | `#1B2442` | selected rows, info notes | primary on it: 6.4 / 6.2 |
| `--brand` | `#F2B705` | `#F2B705` | the EH mark, highlights only (never body text) | ink on brand 9.8 |
| `--red` / `--red-bg` | `#B42318` / `#FDECEA` | `#FF8A80` / `#3A1D1B` | stuck, broken, exam-eve | 5.75 / 6.71 |
| `--amber` / `--amber-bg` | `#8A5300` / `#FFF3D6` | `#F5B84A` / `#352914` | shaky, last-minute, warnings | 5.74 / 8.01 |
| `--green` / `--green-bg` | `#1E7A3C` / `#E6F4EA` | `#6FD08C` / `#16301F` | solid, right, adequate | 4.74 / 7.5 |

**Meanings are fixed.** Red, amber and green mean *understanding* (and the matching stage urgency) and nothing
else. Blue means *you can act here*. Yellow is *us* (the brand). Never use a status colour as decoration.

**Theme:**
- Follow `prefers-color-scheme` by default.
- A manual override in Settings (System / Light / Dark) is stored in `localStorage` and applied by a blocking
  inline script in `<head>`, so the page never flashes the wrong theme.
- The tokens are defined once under `:root`, then under `@media (prefers-color-scheme: dark)` guarded by
  `:root:not([data-theme="light"])`, then under `:root[data-theme="dark"]`.

### 2.3 Type

- **One family: IBM Plex Sans** (UI and body) + **IBM Plex Mono** (numbers, unit codes, equations, timers).
- **Self-hosted** WOFF2 in each repo (`/fonts/`), weights 400, 500 and 600 only. Study Desk is local-first and
  must render offline, and the website shouldn't make a Google round-trip on Kenyan mobile data.
- Subset to Latin + Greek + math operators + super/subscripts (`σ τ π θ ω Δ ∑ √ ≤ ≥ × ⁻ ² ³ ₁ ₂`). **Check the
  subset actually contains those glyphs.** Fall back to `system-ui` / `ui-monospace` for anything missing.
- Total budget: ≤ 140 KB for all font files.
- `font-display: swap`. Preload only Sans 400 and 600.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `--t-display` | 40/44 (28/32 under 640px) | 600 | website hero only |
| `--t-h1` | 28/34 | 600 | screen title (one per screen) |
| `--t-h2` | 20/28 | 600 | section titles |
| `--t-h3` | 16/24 | 600 | card titles |
| `--t-body` | 16/26 | 400 | everything readable |
| `--t-small` | 14/20 | 400 | meta, helper text |
| `--t-micro` | 12/16 | 500 | badges, table heads (sentence case, never caps) |
| `--t-num-xl` | 48/48 Mono | 500 | the one big number on a screen (days to exam) |
| `--t-mono` | 15/22 Mono | 400 | codes, values, units, checkpoints |

Lines are capped at 70 characters (`max-width: 70ch`) for reading text. Numbers use `font-variant-numeric:
tabular-nums`.

### 2.4 Space, shape, depth, motion

- **Spacing scale (4 px base):** 4, 8, 12, 16, 24, 32, 48, 64. Nothing else. Cards have 16 padding on a phone and
  24 on desktop. Gaps between sections are 32 on a phone and 48 on desktop.
- **Radius:** 6 (inputs, badges), 10 (cards, buttons), 16 (sheets and dialogs). Pills (999) only for one-line
  badges.
- **Depth:**
  - Level 0: flat, with a border.
  - Level 1: cards, `0 1px 2px rgb(0 0 0 / .06)`.
  - Level 2: sheets, dialogs and toasts, `0 8px 24px rgb(0 0 0 / .16)`.
  - In dark mode, depth comes from surface colour, with no shadows.
- **Motion:**
  - 120 ms for hover and press, 200 ms for sheets and dialogs, `cubic-bezier(.2,.8,.2,1)`.
  - Nothing moves on its own: no tickers and no scroll-driven animation.
  - `prefers-reduced-motion: reduce` turns every transition into 0 ms.
  - **No animation libraries**: drop `gsap`, `@gsap/react` and `lenis` from Study Desk (tens of KB). CSS
    transitions cover everything here.

### 2.5 Layout grid and breakpoints

| Name | Width | Layout |
|---|---|---|
| `sm` | < 640 | one column, bottom tab bar (Study Desk) / top bar with a menu sheet (website), 16 px gutters |
| `md` | 640–1023 | one column, max 720 content, side rail collapsed |
| `lg` | ≥ 1024 | Study Desk: 240 px left rail + content (max 960) + optional 320 px right panel. Website: max 1120 container. |

Touch targets are ≥ 44×44. There is no horizontal page scroll at any width: wide tables scroll inside their own
container, and that container is labelled for screen readers.

### 2.6 Components (one shared inventory)

Each component has documented **states**: default, hover, focus-visible, active, disabled, loading, error. They
live in `study/web/src/ui/` (Study Desk) and `src/ui/` (website), written once and copied, not shared through a
package. That keeps both repos simple.

| Component | Spec | Notes |
|---|---|---|
| **Button** | Primary (filled `--primary`), Secondary (border `--line`, text `--ink`), Quiet (text only, `--primary`), Danger (text `--red`). Heights: 44 by default, 36 compact. One line only; truncate with `…` and give the full text in a `title`. | One primary per screen region. A loading state shows a spinner and keeps the width. |
| **IconButton** | 44×44, with an icon (lucide, 20 px) and an `aria-label` | Used for close, more and undo. |
| **Field** | label above (always visible, never placeholder-only), input 44 high, helper or error below in `--t-small` | Error text says how to fix it, not just "invalid". |
| **Select / Combobox** | native `<select>` for under 8 options; a searchable combobox for units and topics | Never shrinks under 160 px. |
| **Segmented** | 2–4 equal options in one bordered row | Audit (Solid/Shaky/Stuck/Untested) and the timer length. |
| **Badge** | `--t-micro`, 6 radius, soft background + strong text, from the status colours | Stage, audit and source. One line. |
| **Card** | surface, 10 radius, level 1 | Never put a card inside a card. Use a divider list instead. |
| **List row** | 56 minimum height; leading code or icon, title + meta, trailing value or chevron | The main building block. Most screens are lists. |
| **Sheet** | a bottom sheet on `sm`, a right side panel on `lg`, focus trapped, Esc closes | For details, check-ins and the prompt pack. |
| **Dialog** | only to confirm destructive actions that can't be undone | Everything else uses Undo. |
| **Toast** | bottom-centre (above the tab bar), 8 s, one at a time, optional Undo | `role="status"`. |
| **Progress ring / bar** | for the understanding floor (0–1) and timers | Always with a text value. |
| **Breakpoint chain** | three links, Why → How → Do, each coloured by its floor, with the weakest outlined | Study Desk's signature component (3.6). |
| **Empty state** | one sentence of why it's empty + **one** button that fixes it | Never a blank panel. |
| **Skeleton** | grey blocks the size of the real content, shown from 150 ms | No spinners for page loads. |
| **AI busy** | elapsed seconds ("Reading your working… 12 s"), a Cancel button, and from 20 s on: "Taking long? Use the Prompt pack instead." | Every AI call. |
| **Kbd** | `<kbd>` styled mono, used in hints | |

### 2.7 Icons and imagery

- Use **lucide** in both repos, 1.75 stroke, 20 px in the UI and 16 px inline. Study Desk adds it as one
  dependency (tree-shaken, about 1 KB per icon used). The website already has it.
- **Photos:** real members and real labs only, and only with consent. Serve as WebP/AVIF with `srcset` (480, 960,
  1440), with `width`/`height` set to avoid layout shift. Hero images ≤ 120 KB on mobile.
- **The logo:** the yellow EH mark (`--brand` square with ink "EH"), as SVG, exported once. Delete
  `logo-new.jpeg`, `logo.png` and the other duplicates once the SVG is in place.

### 2.8 Voice

Plain, direct, second person, short sentences, numbers as digits. Say what happened and what to do next.
Appendix C has the rules and glossary.

---

## Part 3: Study Desk redesigned

### 3.1 Information architecture

Four places + Settings. Every current section has exactly one home (full map in Appendix A).

| Place | Holds | Replaces |
|---|---|---|
| **Today** | the next 3 things, the current unit's countdown and stage, a quick "Check an answer" | Hero, Today, Quests, the checklist |
| **Units** | your units → **Unit** page (topics, papers, lecturer hints, predictions, study kit) → **Topic** page (sub-topics, breakpoint chain, questions, teach-back) | Units, Predictions, Weakspots tree, Kit, Learn, Teach (topic-scoped), Notes |
| **Practice** | the question stage: attempt → check → checkpoints → broke-at; timed mock; the queue of "fix first" items | Practice, Mock, Papers log, the Weakspots "fix first" list |
| **Progress** | understanding over time, how you lose marks, time studied, streak (kind), exam readiness per unit | Progress, the error breakdown |
| **Settings** (drawer) | course/year/sem, units, AI provider + keys check, Discord, theme, data (export/backup) | the top-bar selects, setup leftovers |

**Navigation:**
- `lg`: left rail with the four places + Settings at the bottom. The **current unit switcher** sits at the top of
  the rail (combobox: code + title + stage badge).
- `sm`: bottom tab bar with the four places. The unit switcher is in the top bar. Settings is the avatar or gear
  in the top bar.

**One current unit.** It's chosen in the switcher, stored in `settings.currentUnit` and read by every place.
Changing it never loses work in progress: an unsent answer is kept per unit in `sessionStorage`.

**Routing (no new dependency).** A ~40-line hash router in `web/src/router.js`, so the browser back button, links
from the bot and reloads all work:

```
#/today
#/units                       #/units/EMM-302             #/units/EMM-302/topics/<topicId>
#/units/EMM-302/papers        #/units/EMM-302/kit
#/practice                    #/practice/q/<paperqId>     #/practice/mock/<mockId>
#/progress                    #/settings                  #/settings/units
```

The bot can deep-link into these (Part 3.12).

### 3.2 First run (replaces `setup.bat` questions + tour + quests)

The server (`setup.bat`) only gets **keys and the Discord ID** onto disk. Everything else happens in the browser
the first time, as a 4-step full-screen setup. Each step is one question, with Back and Continue, and progress is
shown as "Step 2 of 4":

1. **Your course.** Course (combobox) · Year · Semester. Shows "We found 14 Mechanical year-3 units".
2. **Your units.** A checklist (core, then shared), with "tick all" and search to add retakes. Each unit has a
   **date field + "TBA" toggle** inline. A note at the top: "Exam dates moved with the strike? Leave them TBA.
   You'll be in Adequate Prep until you set one."
3. **Your material.** "Sync all files" runs right here with a per-unit progress list. "Read papers" and "Suggest
   topics" run automatically after sync, and each unit shows "12 past-paper questions · 9 topics suggested". The
   student then **reviews the suggested topics per unit** (tick to keep). This is the step that fixes audit B2
   (0 topics).
4. **Your AI.** Which provider; "Test it" (one tiny call, shows ✓ or the exact error); "Skip, use the Prompt
   pack" is a first-class choice, not a failure.

Done → Today, already filled.

- **Skipping** any step is allowed. Today shows a slim "Finish setup (2 steps left)" row until it's done.
- **Re-runnable** from Settings → "Run setup again".
- **No tour, no quests, no XP.** Instead, every empty state teaches by offering the one action that fills it.

### 3.3 Today

**Purpose:** answer "what do I do now?" in under 5 seconds.

**Layout (`lg`):**

```
┌ rail ┐┌──────────────────────────── content ───────────────────────────┐┌── right panel ──┐
│Today │ EMM 302 Strength of Materials   [Last-Minute]   2 days to CAT   │ This week        │
│Units │                                                                  │ 4 h 10 min       │
│Pract.│ ┌ Next up ──────────────────────────────────────────────────┐   │ 11 checks        │
│Progr.│ │ 1  Mohr's circle · 2021 CAT 1 Q2 (15 marks)                │   │ 3 broke at How   │
│      │ │    Weakest link: How (sign convention)        [Start →]   │   │                  │
│      │ ├────────────────────────────────────────────────────────────┤   │ Exam readiness   │
│      │ │ 2  Teach back: Thick cylinders (Why is red)    [Start →]   │   │ EMM 302  ▓▓▓░ 58%│
│      │ ├────────────────────────────────────────────────────────────┤   │ ECU 300  ▓░░░ 22%│
│      │ │ 3  Formula & trap sheet (last-minute)          [Open →]   │   │                  │
│      │ └────────────────────────────────────────────────────────────┘   │                  │
│      │                                                                  │                  │
│      │ Check an answer:  [ question ▾ ] [ 142.5 MPa      ] [Check]      │                  │
│ ⚙    │ Other units: ECU 300 · 1 task   EMM 305 · 2 tasks   (show)       │                  │
└──────┘└──────────────────────────────────────────────────────────────────┘└──────────────────┘
```

**Content rules:**
- **Header:** current unit + its stage badge + the honest countdown.
  - With a real date: "2 days to CAT".
  - TBA: "Date TBA · Adequate Prep".
  - KU calendar fallback: "KU calendar says 2 Nov (may have moved) · Set date". **There is no big countdown
    number** unless the date is the unit's own.
- **Next up:** 3 items from `todayPlan`, **each a list row with one Start button that goes straight into the
  activity**:
  - a *Practice* item opens `#/practice/q/<id>` with the question on screen and the timer running;
  - a *Teach* item opens the topic's teach-back sheet;
  - a *Prompt* item opens the pack sheet already built.
- **Why this item:** one line under each row, from the plan (e.g. "Weakest link: How (sign convention) · appeared
  in 4 of 5 papers").
- **Check an answer:** an inline mini-form for when you did a question on paper away from the app. It uses the
  same server call as Practice.
- **Other units:** collapsed, one line per unit with its task count.
- **Right panel** (`lg`) / below (`sm`): this week, exam readiness per unit (3.10).

**States:**

| State | What shows |
|---|---|
| No units | Empty state: "Pick your units to get a plan." → [Set up] |
| Units, no topics | "EMM 302 has no topics yet." → [Suggest topics from the outline] (inline, AI) / [Add by hand] |
| No past-paper questions | Next-up items become teach-backs and the "Read papers" action |
| All TBA | Header shows "All dates TBA · Adequate Prep", no countdown |
| Offline (server down) | Banner: "Study Desk's server isn't running. Start it from the desktop shortcut." Retry every 5 s, then auto-reload. |

### 3.4 Units → Unit page

**Units list:** rows of `code · title · stage badge · readiness % · next date or TBA`, plus "Add or remove units"
(opens Settings → Units).

**Unit page** (`#/units/EMM-302`): a header with code, title, stage (editable inline: "Auto (from date)" or a
fixed stage) and date (date + TBA). Under it, **tabs**: *Topics · Papers · Lecturer · Kit*. Tabs are a
segmented control on `sm`, and link-style tabs on `lg` with the URL updated.

- **Topics tab (default):** topics **in outline order**, each a row with:
  - the **breakpoint chain** (3.6) in mini form;
  - the exam weight ("~14 marks/paper, in 4 of 5 papers");
  - a pinned or muted badge from hints;
  - a chevron to the Topic page.

  The tab also has "Suggest topics" (AI, from the outline and papers; review before adding) and "Add topic".
  Reorder by drag on `lg` or with ↑/↓ buttons on every size. Delete has Undo.
- **Papers tab:** the synced files grouped as *Past papers & CATs* and *Notes & slides*.
  - Each paper row shows: year · type · questions parsed · your best score · "scanned, no text".
  - Opening a paper shows its parsed questions, each with its topic (editable select) and **[Practise this →]**.
  - Actions: "Sync files", "Add a file from this computer", "Paste questions" (for scanned papers).
  - Logging a whole-paper score lives here, on the paper itself (replacing the separate Papers section).
- **Lecturer tab:** the hints list (their words, kind, topic tags, date) + the add box. Below: **Predictions**,
  meaning the topics ranked by exam weight with the arithmetic visible ("weight 25 = 10 × 2.5, pinned").
- **Kit tab:** the stage-matched study kit (ladder / recipes / formula & trap sheet): "Make it", edit and print.
  The print stylesheet fits one A4 page.

### 3.5 Topic page (`#/units/EMM-302/topics/<id>`)

The page where understanding is built. **Top to bottom:**

1. **Header:** topic name, the full **breakpoint chain** (3.6), and one sentence: "Weakest link: **How**. You
   set it up wrong in 3 of your last 4 attempts (sign convention)."
2. **Study this topic:** your synced notes and worked examples first (from `GET /api/learn`), shown as a reading
   list with page references. A toggle "I've read this" counts as a study session.
3. **Sub-topics:** the self-audit list. Each row has the name (rename in place), the kind, and the 4-way segmented
   audit (1–4 keys). "Start the 60-second audit" focuses the first row. "Suggest sub-topics" uses AI.
4. **Questions on this topic:** past-paper questions (most recent first) with your last result on each. Each row
   has [Practise →].
5. **Teach it back:** a text area + 🎤 record. The result (score, gaps, follow-up) appears inline. Unmatched gaps
   offer "Add as a shaky sub-topic".
6. **Take it to a stronger AI:** one button that opens the pack sheet for this topic (3.9).

### 3.6 The breakpoint chain (signature component)

It shows the Breakpoint model (`UNDERSTANDING.md`) honestly.

```
  Why ━━━━━━ How ━━━━━━ Do
  0.72      0.31       0.64
  green     RED        amber        ← weakest link outlined; numbers are the layer floors
```

- **Full form:** three nodes joined by links. Each node shows its label, its floor (0–1, as a % or a 0–1 value,
  pick one and keep it), a colour (red < 0.4 ≤ amber < 0.7 ≤ green, or whatever thresholds `understanding.js`
  uses, read from the server rather than duplicated in the client) and its evidence count ("from 7 attempts,
  1 teach-back"). The weakest node is outlined 2 px.
- **Mini form** (list rows): three 8 px dots joined by 1 px lines, the weakest ringed, with a tooltip of the full
  numbers.
- **Accessibility:** the whole chain is one `role="img"` with an `aria-label` like "Understanding: Why 72% solid,
  How 31% weak, Do 64% shaky. Weakest link: How."
- **When there's too little evidence:** grey nodes and "Not enough evidence yet: try 2 questions." Never show a
  colour you can't back.

### 3.7 Practice (the question stage)

**Practice home (`#/practice`):**
- The **Fix-first queue**: the weakspot matrix rows, each a [Practise →] that picks the best question for that
  sub-topic.
- "Random past-paper question on <current unit>".
- "Timed mock".
- History: the last 20 attempts, each with its verdict and broke-at.

**The question screen (`#/practice/q/<id>`), the heart of the product:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ EMM 302 · 2021 CAT 1 · Q2 · 15 marks          ⏱ 18:42 (of 22:30)  [Pause] │
├──────────────────────────────────────────────────────────────────────────┤
│ A thick cylinder of internal diameter 200 mm and external diameter 300 mm│
│ is subjected to an internal pressure of 40 MPa. Find the hoop stress at  │
│ the inner surface…                                       [figure: open ↗] │
├──────────────────────────────────────────────────────────────────────────┤
│ Work on paper, closed book. When you're done:                            │
│  Final answer  [ 104 MPa              ]   (units are understood: MPa, kN…)│
│  How you did it (optional)  [ Lamé, A and B from boundary conditions… ]  │
│  or  [📷 Photo of my working]                                            │
│                                                       [Check my answer]  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Then it moves on in place, with no page change:**
- **Right** (within tolerance after unit parsing): a green "Right: 104 MPa ✓ (key: marking scheme)".
  [Next question] [Show the worked checkpoints anyway].
- **Wrong:** a red "Not quite: expected 104 MPa, you have 10.4 MPa."
  - If it's a units slip: an amber "Off by ×10: check mm → m."
  - Then the **checkpoints** appear: 3–6 numbered steps, each with *what you do · equation · value + unit*, and
    **[Broke here]** on each. Under each step: *"This step looks wrong"*.
- **Broke here:** a small inline picker with the error type (7 options, the most likely pre-selected) and the
  sub-topic (pre-selected). [Save] → a toast "Logged: How · sign convention on Mohr's circle".
  [Next question] [Teach it back].
- **The key's source is always visible**: "Key: marking scheme" / "Key: your tutorial answer" / "**Key: AI-solved,
  verify**" (amber).
- **No key and no AI:** "No answer key for this one." → [Enter the key] [Build a prompt pack to solve it].

**Timer.** It's built in and the time comes from the marks (≈ 1.5 min/mark, as audit A set). Pause is allowed.
Ending the attempt records `minutes` as a study session, so there's no separate focus timer to remember.

**Keyboard:** `Enter` checks · `1`–`6` choose "broke here" on that step · `N` next question · `T` teach it back ·
`Esc` leaves (the answer is kept).

**Timed mock** (`#/practice/mock/<id>`): the same question screen, run as a sequence, with one overall timer.
Results show per question, with "Check step by step" on each. Predicted mocks are labelled "Predicted from past
papers".

### 3.8 Progress

- **Understanding:** per unit, each topic's chain (mini) sorted weakest first. A 4-week sparkline of the unit's
  average floor.
- **How you lose marks:** a horizontal bar per error type over the last 30 days + the takeaway sentence.
- **Time:** minutes per day for the last 14 days (bars), per unit this week.
- **Streak (kind):** "Studied 5 of the last 7 days." A rest day never breaks anything, and there's no red.
- **Exam readiness:** see 3.10.
- **Export:** "Download my data (study.json)" and "Back up now" (Settings → Data has the same).

### 3.9 Prompt pack (a sheet, not a section)

It opens from a Topic, a question, a weakspot, a Today item or an AI-busy timeout. One sheet with:
- goal (pre-picked for the stage)
- target question (pre-filled when opened from one)
- [Copy Master Prompt] [Download .md]
- the upload checklist
- "See the prompt / See the pack" (collapsed)

The quick prompts go into a "More prompts" list inside the sheet.

### 3.10 Exam readiness (new, small, honest)

For each unit:

```
readiness = Σ_topics (exam weight × min(floor_why, floor_how, floor_do)) / Σ_topics exam weight
```

It's shown as a % with "**based on N topics, M of them with evidence**". When fewer than half the predicted
weight has evidence, show "Not enough evidence yet" instead of a number. Pure function in
`server/readiness.js`, with tests.

### 3.11 Settings

| Group | Items |
|---|---|
| **Course & units** | course / year / sem; units (the same list as setup step 2); "Mark calendar dates TBA" |
| **AI** | provider; key status per provider (✓ / missing / failing + last error); "Test"; daily use count |
| **Discord** | DMs on/off; DM times (07:00 plan, 20:30 nudge); "Send me today's plan now" |
| **Appearance** | theme System/Light/Dark; text size (100/112/125%) |
| **Data** | export study.json; back up now (`data/backups/`); restore from a backup (with a diff summary, after backing up the current file); where the data lives (path shown) |
| **About** | version (from package.json), "Check for updates" (Part 5), guide link |

### 3.12 Discord bot alignment

The same verbs as the app, with deep links back into it when it's open on the laptop:

| Command | Reply | Deep link |
|---|---|---|
| `today` | the 3 next-up items, each with one line of "why" | `http://localhost:5190/#/today` |
| `mark EMM 302` | a question to try, with its marks and time | `#/practice/q/<id>` |
| `mark 104 MPa` | right/wrong + the checkpoints as a numbered list; reply `broke 2` | `#/practice/q/<id>` |
| `weakspots EMM 302` | the top 5 with their weakest link | `#/units/EMM-302` |
| `predict`, `hint`, `teach`, `log`, `paper`, `files` | unchanged | as relevant |

The evening nudge names the most urgent unit and one 15-minute action, never "Nothing logged today".

### 3.13 Front-end architecture

```
study/web/src/
  main.jsx              bootstraps theme, router, store
  router.js             hash router: routes table → component, params, navigate()
  store.js              one React context: state from /api/state, refresh(), currentUnit, toast()
  api.js                fetch wrapper (exists): timeouts, offline detection, JSON errors
  ui/                   design-system components (Part 2.6), one file each, no business logic
  places/
    Today.jsx
    Units.jsx  UnitPage.jsx  TopicPage.jsx
    Practice.jsx  QuestionStage.jsx  Mock.jsx
    Progress.jsx
    Settings.jsx  Setup.jsx
  parts/                product components used by several places
    BreakpointChain.jsx  UnitSwitcher.jsx  PackSheet.jsx  TeachBack.jsx  AiBusy.jsx  Checkpoints.jsx
  styles/
    tokens.css          Part 2.2–2.5, the only place colours and sizes are defined
    base.css            reset, type, focus ring, print
    ui.css              component styles (BEM-ish: .btn, .btn--primary)
```

**Rules:**
- No raw colour, font size or spacing value outside `tokens.css` (lint with a 10-line script in `test/`).
- A component file is ≤ 200 lines. Split before that.
- Every place handles its loading, empty and error states explicitly.
- `GET /api/state` stays, but gets lighter (3.14), and places fetch their own detail (`/api/units/:code`,
  `/api/topics/:id`, etc.).

### 3.14 Back-end changes the redesign needs

These are small, and all keep the data compatible (no migration):

1. **Split `index.js` routes** into `server/routes/{units,topics,practice,predict,learn,settings,library}.js`.
   Each exports a route table. `index.js` only assembles them and serves files.
2. **New read endpoints:**
   - `GET /api/units/:code` (unit + topics with chain + predictions + hints + papers summary)
   - `GET /api/topics/:id` (topic + sub-topics + chain + questions + teach history)
   - `GET /api/practice/next?unit=&subtopic=` (best question)
   - `GET /api/progress?days=30`
3. **Lighter `/api/state`:** units, settings, plan, stage mix, readiness, counts. Not every list.
4. **`settings.currentUnit`**, validated as one of your units.
5. **`server/readiness.js`** (3.10), pure + tests.
6. **Fix `answer.js` exponent parsing** (Part 0.9).
7. **Count attempts and reading as study** everywhere (streak, nudge, Progress). Partly done in audit A, so
   verify it.
8. **Back up before restore,** and keep the last 14 automatic daily backups.

### 3.15 Accessibility checklist (every screen, before merging)

- [ ] One `h1` per place; headings in order; landmarks `nav`, `main`, `aside`.
- [ ] Every field has a visible label; errors are announced (`aria-live="polite"`).
- [ ] Keyboard only: Tab order logical, focus visible (2 px `--primary` ring, 2 px offset), Esc closes sheets,
      focus returns to the opener.
- [ ] Colour is never the only signal: badges carry words, and chain nodes carry numbers.
- [ ] 200% zoom works without horizontal scroll; text size setting works.
- [ ] Reduced motion respected.
- [ ] Screen-reader pass with NVDA on Windows (the students' platform) for Today and the question screen.

### 3.16 Performance budget (Study Desk)

- JS ≤ 120 KB gzip (today's bundle includes React + gsap + lenis; dropping both animation libs pays for lucide).
- First render ≤ 300 ms on a mid laptop with a 1 MB `study.json`.
- The question screen is interactive ≤ 100 ms after navigation (no network wait: the question text comes from the
  unit payload already loaded).

---

## Part 4: The Hub website redesigned

### 4.1 Diagnosis (as found)

| # | Finding | Evidence |
|---|---|---|
| 1 | **Two parallel sites.** React SPA at `/` (Index, Timetable, Projects, Jobs, Formulas, Tools, Download) and a static site at `/redesign/` (a 2,980-line `index.html` + 114 unit pages). They disagree on design, nav and copy. | `README.md` "What is served where" |
| 2 | **Six identities** (see Part 2), five font families, including two from Google Fonts on `/redesign/` | `tailwind.config.ts`, `redesign/index.html:23-25` |
| 3 | Home is **13,619 px** tall on desktop and **17,277 px** on a phone | Playwright measurement |
| 4 | `/redesign/` has **7 `<h1>`s**, including a "404" | Playwright measurement |
| 5 | **Soft 404s:** any URL returns 200 | `vercel.json` catch-all rewrite |
| 6 | **Sitemap and canonicals point to URLs that don't serve the pages** | Part 0.7 |
| 7 | Generic `<title>` on `/download`, `/tools`, `/timetable` ("Engineering Study Hub — Nairobi, Kenya") | Playwright measurement |
| 8 | `/timetable` scrolls sideways by **142 px** at 375 | Playwright measurement |
| 9 | **570 KB JS** (160 KB gzip) on every page, including content pages; Vite warns about chunk size | `vite build` |
| 10 | KaTeX loaded from jsDelivr at runtime on Formulas (a third-party request on every visit) | `FormulaDirectory.tsx:60-72` |
| 11 | Secrets and honesty problems | Part 0.1–0.6 |
| 12 | About 45 unused shadcn components; 3 lockfiles | Part 0.10 |
| 13 | Download page facts that don't match reality ("v1.1.0", "v1.2.0-beta", "71 MB", `study/data/store.json`, which is really `study.json`) | `Download.tsx` |

### 4.2 Decision: one static-first site

**Recommendation:** a single site where every content page is **plain HTML generated at build time**, and React
loads **only** on the interactive tool pages.

- **Why:** the site's value is (a) being found on Google for "<unit> past papers KU" and (b) converting to a
  Discord join. Both want fast, crawlable HTML on cheap phones. The 114 unit pages are the biggest SEO asset you
  have.
- **How, with no new framework:**
  - Vite multi-page build (`build.rollupOptions.input` lists every entry).
  - A Node script `scripts/build-pages.js` writes the HTML for units, the sitemap and the members count from data
    *before* `vite build` (the `npm run build` script runs both).
  - React stays for the four tool pages, each its own entry.
- **Alternative (bigger change, nicer authoring):** Astro with React islands. Choose it only if you want to write
  pages in components. It's a new dependency and a new mental model, so ask first (Part 7).

### 4.3 Site map

| URL | Page | Type |
|---|---|---|
| `/` | Home | static |
| `/units/` | All units, filterable by course and year | static + 3 KB vanilla filter script |
| `/units/<slug>/` | One unit (×114+) | static, generated |
| `/membership/` | Free / Basic / Premium, how to pay, FAQ | static |
| `/study-desk/` | Study Desk: what it is, download, requirements, checksum | static, reads `latest.json` |
| `/projects/` | Project library | static, generated from data |
| `/tools/formulas/` | Formula finder | React island |
| `/tools/timetable/` | Exam timetable | React island |
| `/jobs/` | Job board | React island (`/api/jobs`) |
| `/about/` | Who runs it, the rules, contact | static |
| `/privacy/`, `/terms/`, `/refunds/` | Legal (needed for payments and the waitlist) | static |
| `/404.html` | Not found, with **HTTP 404** | static |

**Redirects (301)** in `vercel.json`:
- `/redesign/` → `/`
- `/redesign/units/:slug*` → `/units/:slug*`
- `/download` and `/desk` → `/study-desk/`
- `/formulas` → `/tools/formulas/`
- `/timetable` → `/tools/timetable/`
- `/tools` → `/tools/formulas/`
- `/#/download` stays handled client-side once, then is removed after 3 months

**No catch-all to `index.html`.** Unknown paths get `404.html` with status 404.

### 4.4 Page specs

**Global header:**
- EH mark + "Engineering Study Hub" · Units · Study Desk · Membership · Projects · Tools.
- [Join the Discord] (primary).
- On `sm`, a menu button opens a sheet. There's **no bottom tab bar** on the website: it covers content and
  copies an app pattern on a content site.

**Global footer:** the four columns (Study, Community, Hub, Legal), WhatsApp + Discord + email, "Made in Nairobi
by engineering students", and the year.

**Home (`/`).** Target height ≤ 4 screens on a phone. In order:
1. **Hero:**
   - H1 "Every KU engineering unit's past papers, and the people revising them with you."
   - Sub: "Free to join. Sorted by unit and year. KES 50 a semester for the full library."
   - Buttons: [Join the Discord] [Find your unit] (a search box that jumps to `/units/<slug>/`).
2. **Proof strip:** the live member count (4.10) · units covered (from `units.json`) · files in the library
   (from Supabase at build) · "KU · JKUAT · TUK · UoN" only if true.
3. **How it works:** three steps (Join → pick your unit → get papers and a study crew) with real screenshots of
   Discord.
4. **Find your unit:** course chips → year → a list of units linking to unit pages.
5. **Study Desk:**
   - one screenshot of the question stage (Part 3.7)
   - "Tells you the next question worth your time, then shows you exactly where your working broke."
   - [Download for Windows].
6. **Membership summary:** three plan cards (Part 4.4 Membership) → [Compare plans].
7. **Real quotes** (only real, with consent): 3, with first name, course and year.
8. **FAQ:** 5 questions, linking to the full FAQ.

**Unit page (`/units/<slug>/`), generated.** This is the page Google sends people to:
- **Title:** `EMM 302 Strength of Materials: past papers, CATs and notes (KU) | Engineering Study Hub` (≤ 60
  chars where possible; trim the unit name, not the code).
- **Meta description:** "12 past papers and CATs and 30 sets of notes for EMM 302 Strength of Materials at
  Kenyatta University, sorted by year. Free to join on Discord." Numbers come from Supabase at build.
- **H1:** "EMM 302 Strength of Materials".
- **What's in the library:** counts by kind and the years covered ("2016–2025"). File **names** are allowed;
  files themselves are not (members only).
- **Topics** (from Study Desk outlines when available, else omitted) + "Most-asked topics" from parsed papers.
  This only appears when the data exists.
- [Get these papers on Discord] → the unit's forum thread invite, with `?src=unit-emm-302`.
- **Related units** (same year and course) and the cross-listed codes ("Also listed as EAR 302").
- **JSON-LD:** `BreadcrumbList` + `Course` (`provider`: Kenyatta University; `name`; `courseCode`) +
  `FAQPage` if it has a FAQ.

**Membership (`/membership/`):**

| Plan | Price | What you get |
|---|---|---|
| **Free** | KES 0 | the community, study channels, 7 days of full library access when you join |
| **Basic** | KES 50 / semester | the full past-paper and notes library for your units |
| **Premium** | KES 800 once | Basic for the whole degree + build sheets, squads, daily support, career pipeline, Study Desk friend access (if decided, Appendix E) |

- **How to pay:** M-Pesa steps, then "I've paid" in `#upgrade-to-premium`. The upgrade is "send the difference,
  KES 750".
- **Refunds:** "7 days, full refund, access removed" → `/refunds/`.
- **No "saving" row.** Use the honest comparison sentence from the FAQ (Part 0.5).

**Study Desk (`/study-desk/`):**
- Hero line + one question-stage screenshot + [Download for Windows · v<version> · <size> MB] (all from
  `latest.json`).
- **Requirements:** Windows 10/11 64-bit, about 250 MB disk, internet for sync and AI.
- **"Windows may warn you"** with a screenshot of the SmartScreen "More info → Run anyway", and why (an unsigned
  installer; Appendix E has code signing).
- **Verify your download:** the SHA-256 + a PowerShell one-liner (`Get-FileHash .\StudyDesk.exe`).
- What it does (the 5-step loop), privacy ("your study data never leaves your laptop; AI calls go to the provider
  you choose"), the changelog (last 5 versions from `latest.json`).

**Projects (`/projects/`):** generated from `data/projects.json`: title, discipline, difficulty, parts list, a
"build sheet (Premium)" badge. The filter is a 2 KB script.

**Tools:**
- **Formula finder** keeps its content, rendered with **KaTeX bundled at build time** (pre-rendered to HTML where
  the formula is static), so no runtime CDN. AI search is members-only (Part 0.2 A).
- **Timetable:** fix the 375 overflow by stacking rows into cards under 640 px.
- **Jobs:** goes through `/api/jobs` (Part 0.1), with a "last updated" time and an empty state that links the
  Discord jobs channel.

**404:** "That page isn't here." Search units · Home · Discord. Status 404.

### 4.5 Design on the website

Same tokens, type and components as Part 2. Differences:
- `--t-display` for the hero.
- A max 1120 container.
- Photos are allowed (real ones, 2.7).
- No bottom tab bar.
- Buttons have the same shapes. "Join the Discord" uses Discord blurple **only** as an icon, and the button stays
  `--primary`, so there's one action colour.

### 4.6 Content rules for the website

- **Every number** on the site comes from data at build time (members, units, files) or from `latest.json`. No
  hand-typed "450+". If a number can't be sourced, drop it.
- No fake urgency (no "spots left" unless counted), no "classified", no "alpha drop".
- Prices appear in exactly one data file (`src/data/prices.json`) and are rendered everywhere from it. The bot's
  `lib/config.js` `PRICES` must match: add a test in `discord-sync-bot` that reads both and fails if they differ
  (both repos are public, so the bot can fetch the JSON).

### 4.7 SEO (do it once, generate it forever)

- `scripts/build-pages.js` writes:
  - `/units/<slug>/index.html` for every unit in `lib/units.json` + `threads.json` (`discord-sync-bot` is the
    source: fetch the raw JSON from GitHub at build, or vendor it with a sync script);
  - `/sitemap.xml` (all pages, `lastmod` = the build date or the data's change date);
  - `/robots.txt` with `Sitemap:`.
- **Per page:** unique `<title>` and description, `<link rel="canonical">` to the real URL, Open Graph + Twitter
  tags, and an OG image (1200×630) generated once per page type (home, unit, Study Desk).
- **JSON-LD:**
  - `Organization` (name, logo, sameAs: Discord invite, WhatsApp, GitHub) on Home;
  - `BreadcrumbList` everywhere;
  - `Course` on unit pages;
  - `SoftwareApplication` on `/study-desk/` (operatingSystem Windows, offers price 0);
  - `FAQPage` where there's a FAQ.
- **Google Search Console:** keep the `google720c12391896f277.html` verification file at the root after the move.
  Submit the new sitemap and watch "Page indexing" for 2 weeks.

### 4.8 Performance budget (website, on a mid Android over 3G-ish)

| Page type | HTML+CSS | JS | LCP |
|---|---|---|---|
| Content (home, units, unit, membership, study-desk) | ≤ 60 KB gzip | ≤ 5 KB (filters only) | ≤ 2.0 s |
| Tool pages | ≤ 60 KB | ≤ 120 KB gzip (React + the tool) | ≤ 3.0 s |

- Images: AVIF/WebP, `srcset`, lazy below the fold, explicit sizes.
- Fonts: self-hosted Plex subset (2.3).
- Cache headers in `vercel.json`:
  - `/assets/*`, `/fonts/*`: `public, max-age=31536000, immutable`;
  - HTML: `public, max-age=0, must-revalidate`.

### 4.9 Security and privacy

- **No secrets in client code.** All third-party calls (JSearch, AI) go through `api/*` functions with env vars.
- **CSP header** in `vercel.json`:
  - `default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'`
  - plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and
    `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **Privacy notice** (`/privacy/`), because the waitlist and M-Pesa flows collect personal data. Kenya's Data
  Protection Act 2019 requires telling people:
  - what you collect (Discord ID, phone number for payments, waitlist contact);
  - why, and where it's stored (Supabase, region);
  - how long it's kept;
  - how to ask for deletion (a DM to an admin or an email).
- **Analytics, if any:** cookie-less (e.g. Vercel Web Analytics), mentioned in the privacy notice.

### 4.10 Live numbers and attribution

- **Member count:** at build, `GET https://discord.com/api/v10/invites/<code>?with_counts=true` (no auth) →
  `approximate_member_count`, rounded down to the nearest 10 ("460+ members"). Rebuild daily with a Vercel cron
  or a GitHub Action.
- **Library counts:** at build, from Supabase `files`, grouped by `unit_code` and kind. Use the service key in
  the build environment only, never in the output.
- **Attribution:** every Discord link carries `?src=<page>`. A Discord invite can't carry params, so use a
  separate invite code per placement (home hero, unit pages, membership), created once by the bot. The bot's
  `/stats` reads per-invite uses.

### 4.11 The bot's own web pages (`discord-sync-bot/public/`)

- **`/board/`** (Milestones board): adopt the tokens and type, keep its data flow, add an OG image, and keep the
  output escaping as is (it uses `esc()` correctly).
- **`/dashboard/`** (staff): sign-in is sound (Discord OAuth with `state`, a signed cookie, a permission check).
  It's for staff only, so restyle it last. Add `Cache-Control: no-store` to its HTML too, and `noindex`.
- **Domain:** the board lives at `discord-sync-bot.vercel.app/board/`. Consider `board.engineeringhub.site` (a
  CNAME to the bot's Vercel project) so the brand is one domain.

---

## Part 5: Releases, versions, downloads

One version number, one place to download, one way to check it.

1. **Version source:** `study/package.json` `"version"` (start at `0.9.0`; `1.0.0` when Part 3 ships). The
   installer, the About screen and the website all read it. No hand-typed versions anywhere.
2. **Build:** `npm run installer` (exists: `tools/make-installer.js`, on the `study-friends` branch, which checks
   for leaked secrets and data). It also writes `StudyDesk-<version>.exe.sha256`.
3. **Publish:** a **GitHub Release** on `kkkkenya/discord-sync-bot`, tagged `study-v<version>`, with the `.exe`,
   its `.sha256` and release notes from `RELEASE-NOTES.md`. Download link:
   `https://github.com/kkkkenya/discord-sync-bot/releases/latest/download/StudyDesk.exe` (always the newest).
4. **`latest.json`**, attached to the release and mirrored to the website at `/study-desk/latest.json` by the
   build:
   ```json
   { "version": "1.0.0", "date": "2026-11-20", "size": 74047488,
     "sha256": "…", "url": "https://github.com/…/StudyDesk.exe",
     "notes": ["One-tap practice from Today", "…"] }
   ```
5. **Update check in Study Desk:** Settings → About → "Check for updates" (and once a day on start). If newer:
   a slim banner "Version 1.1.0 is out: what's new · Download". No auto-update.
6. **Remove `public/downloads/StudyDesk.exe`** from `engstudyhub` once (3) works. Optionally purge it from
   history to shrink clones.
7. **Code signing (later, Appendix E):** an OV certificate removes most SmartScreen friction. Until then, the
   Study Desk page explains the warning honestly (4.4).

---

## Part 6: Execution plan

Each step is one session. Sizes: **S** ≤ 2 h · **M** half a day · **L** a day+. Steps in a track run in order. The
two tracks (Study Desk, Website) can interleave once R0 is done.

### R0: Fix now (both repos), S each

| Step | What | Done when |
|---|---|---|
| R0.1 | Rotate the RapidAPI key; add `/api/jobs`; delete the constant (0.1) | `git grep` clean; jobs load |
| R0.2 | Lock down or disable `claude-proxy` (0.2) | the foreign-origin curl is refused; the 21st call returns 429 |
| R0.3 | Remove the fake waitlist counter and copy, plus unverified testimonials (0.3, 0.4) | no hardcoded counts; every quote is consented |
| R0.4 | Fix the "saving" row (0.5) | pricing copy is consistent everywhere |
| R0.5 | Study Desk: backup and friends branches, untrack personal files, fix the failing test (0.8, 0.9) | 136/136 green; untracked files ignored |
| R0.6 | Website quick SEO fix: rewrites for `/units/*` and `/sitemap.xml`, `Sitemap:` in robots (0.7) | the live curl checks in 0.7 return the right pages |

### Track S: Study Desk

| Step | What | Size | Done when |
|---|---|---|---|
| S1 | **Tokens + base + ui kit:** `styles/tokens.css`, `base.css`, Plex self-hosted, `ui/` components with every state; a hidden `#/__kit` page that renders all of them in light and dark | M | the kit page passes the 3.15 checks at 375 and 1280; gsap and lenis removed |
| S2 | **Shell:** router, store, rail + tab bar, unit switcher, Settings drawer skeleton, offline banner | M | every route renders a placeholder; back/forward works; `currentUnit` persists |
| S3 | **Back end for the redesign** (3.14 items 1–5) + tests | M | new endpoints tested against fixtures; `/api/state` ≤ 30 KB on the legacy fixture |
| S4 | **Question stage** (3.7) end to end, mock included | L | attempt → check → checkpoints → broke → next works with a key, without a key, and with AI-solved; keyboard map works |
| S5 | **Today** (3.3) with direct starts | M | from opening the app, the first question is one tap away; all states in the table render |
| S6 | **Unit page** (3.4): Topics, Papers, Lecturer, Kit tabs | L | everything from old Units, Predictions, Papers and Kit is reachable here; nothing is duplicated |
| S7 | **Topic page + breakpoint chain** (3.5, 3.6), teach-back inline | L | the chain matches `understanding.js` numbers in tests; the a11y label reads correctly |
| S8 | **First run** (3.2), replacing tour and quests | M | a fresh store reaches a filled Today in 4 steps; every step is skippable |
| S9 | **Progress + readiness** (3.8, 3.10) | M | readiness is tested; "Not enough evidence" shows when it should |
| S10 | **Prompt pack sheet + AI busy** everywhere (3.9, 2.6) | S | every AI call shows elapsed time + Cancel; the pack opens from 5 places |
| S11 | **Bot deep links** (3.12) | S | each command's link opens the right route |
| S12 | **Delete the old front end:** every old `web/src/*.jsx` not used by the new routes, plus `styles.css` | S | `grep` finds no imports of old files; bundle ≤ 120 KB gzip |
| S13 | **Docs:** GUIDE.md rewritten for the new places, BUILD-PROMPT status table, RELEASE-NOTES 1.0.0 | S | a new student can follow GUIDE.md alone |

### Track W: Website

| Step | What | Size | Done when |
|---|---|---|---|
| W1 | **Clean up:** one lockfile, `.env` → `.env.example`, delete unused shadcn components, remove the `.exe` once Part 5 links work | S | build passes; repo clone < 40 MB |
| W2 | **Tokens + type + ui** (shared with S1; copy the files), header/footer, 404 with real status | M | 404 returns status 404; header/footer pass a11y at 375 and 1280 |
| W3 | **Build script + unit pages + sitemap + robots + JSON-LD** (4.7) | L | every unit page validates in Google's Rich Results test; the sitemap lists real URLs |
| W4 | **Home** (4.4) with live numbers (4.10) | M | ≤ 4 phone screens; every number sourced |
| W5 | **Membership + legal pages** (4.4, 4.9) | M | prices render from `prices.json`; the bot test matches |
| W6 | **Study Desk page** from `latest.json` (Part 5) | S | version, size and checksum are all live |
| W7 | **Tools as islands:** formulas (bundled KaTeX, members-only AI), timetable (375 fix), jobs (`/api/jobs`) | L | no third-party runtime requests except Supabase and the API; no overflow at 375 |
| W8 | **Projects** generated from data | M | filters work without React |
| W9 | **Redirects + headers + cache** (4.3, 4.8, 4.9) | S | old URLs 301 to new ones; the CSP is reported clean in the console |
| W10 | **Launch checks:** Lighthouse mobile ≥ 90 for Performance, Accessibility, Best Practices and SEO on home, a unit page and study-desk; Search Console resubmitted | S | scores recorded in `docs/launch.md` |

### Track P: Releases (after S13 and W6)

P1 version + checksum in the installer · P2 GitHub Release workflow (manual is fine) · P3 update check in Study
Desk.

### Branches and merging

- **Study Desk:** work on `study-dashboard`, one commit per step, as `study(refix S4): question stage`.
- **Website:** work on a `refix` branch with one Vercel preview per push, and merge to `main` after W10.
- **Never** mix tracks in one commit. **Never** commit to `main` of either repo without a green build.

---

## Part 7: Rules for AI coding sessions

These rules exist because of what happened in `a26f6d3` and `2ba3174`. Paste them at the top of every session.

1. **One step, one commit.** The commit message names the step (`study(refix S6): unit page`). Anything outside
   the step goes in a note at the end of the session, not into the code.
2. **Tests are a gate.** `npm test` and `npx vite build` pass **before** every commit. A red test is never
   committed: fix it, or stop and ask.
3. **Design from the tokens.** No new colour, font, size, radius or shadow outside `tokens.css`. "Make it look
   like Apple / Notion / Linear / brutalist" is not an instruction. Point to the Part 2 spec instead.
4. **Banned in the UI:** `[ ]` and `///` decoration, ALL-CAPS labels, marquee tickers, version strings or
   `localhost` in visible text, pill buttons with wrapped text, cards inside cards, more than one primary button
   per region, hand-typed statistics.
5. **Stay in scope.** Study Desk sessions touch only `study/`. Website sessions touch only `engstudyhub`.
   Anything else (`api/`, `lib/`, `pc/`, `vercel.json`, Supabase schema) needs the owner's yes first.
6. **No new dependency without a reason.** Name it, its size and what it replaces, then wait. Allowed already:
   `lucide-react` (Study Desk), Plex fonts (self-hosted files).
7. **Never commit:** `.env`, `data/`, `dist/`, binaries over 1 MB, personal drafts (`discord-messages.md`,
   `*.html` mock-ups at the repo root).
8. **Show, don't claim.** Every UI step ends with screenshots at 375 and 1280, light and dark, saved under the
   session scratchpad and described in the final message, plus the a11y checklist (3.15) ticked or explained.
9. **Honest copy.** No number, quote or claim that can't be traced to data or a real person.
10. **Small files.** A component of ≤ 200 lines, a route file of ≤ 250 lines. Split, don't scroll.

**Definition of done for any step:**
- [ ] Its **Done when** is met, shown with evidence (test output, screenshot, curl).
- [ ] `npm test` passes; the build passes; no console errors.
- [ ] 375/1280 × light/dark screenshots, no horizontal scroll.
- [ ] Docs touched if behaviour changed (GUIDE.md or the website README).
- [ ] One commit, a clear message, pushed.

---

## Appendix A: Feature map

Every current Study Desk feature, and where it lives after the refix. **Nothing is lost.**

| Today (file) | Becomes | Place |
|---|---|---|
| `Hero.jsx` countdown, tiles | Today header (honest countdown) + right panel | Today |
| `Today.jsx` plan | Next up (direct start) | Today |
| `Quests.jsx` tutorial quests (XP) | First run (3.2) + empty states; XP removed | Setup |
| `Onboarding.jsx` (removed earlier) | n/a | n/a |
| `Units.jsx` picker | Settings → Course & units; setup step 2 | Settings |
| `Units.jsx` unit cards, topics, server files | Unit page → Topics and Papers tabs | Units |
| `Predictions.jsx` hints, parse, ranking | Unit page → Lecturer tab (+ weights on Topics) | Units |
| `Analysis.jsx` sub-topic tree, audit | Topic page → Sub-topics | Units |
| `Analysis.jsx` matrix (fix first) | Practice home → Fix-first queue | Practice |
| `Analysis.jsx` error breakdown | Progress → How you lose marks | Progress |
| `Learn.jsx` "Study this topic" | Topic page → Study this topic | Units |
| `Teach.jsx` (+ voice) | Topic page → Teach it back (inline); Today items | Units |
| `Practice.jsx` check answer, photo, checkpoints | Question stage (3.7) | Practice |
| `Mock.jsx` | Practice → Timed mock (same stage) | Practice |
| `Papers.jsx` score log | Unit page → Papers → paper row | Units |
| `Notes.jsx` notes → questions | Unit page → Papers → "Make questions from these notes" | Units |
| `Kit.jsx` study kit | Unit page → Kit tab | Units |
| `Prompt.jsx` pack + quick prompts | Pack sheet (3.9) | everywhere |
| `LimitNote.jsx` | AI busy component (2.6) | everywhere |
| `Progress.jsx` | Progress (3.8) | Progress |
| `Timer.jsx` + `CheckIn.jsx` (removed) | Built into the question stage; minutes logged automatically | Practice |
| `Nav.jsx` band menus, band filter | Rail / tab bar (3.1) | Shell |
| AI provider select, stage select (top bar) | Settings → AI; unit header stage control | Settings / Units |
| `Busy.jsx` | AI busy + skeletons | ui |

## Appendix B: Route maps

**Study Desk (hash routes):** see 3.1.

**Website:**

```
/                      /units/              /units/<slug>/
/membership/           /study-desk/         /study-desk/latest.json
/projects/             /tools/formulas/     /tools/timetable/      /jobs/
/about/                /privacy/            /terms/                /refunds/
/sitemap.xml           /robots.txt          /404.html (status 404)
/api/jobs              /api/formula (members)        /api/waitlist (if kept)
```

## Appendix C: Copy rules

- Sentence case everywhere ("Check my answer", not "CHECK MY ANSWER" or "Check My Answer").
- Lead with the verb on buttons: Check, Start, Save, Download, Join.
- Errors say what happened + what to do: "No answer key for this one. Enter the key, or build a prompt pack to
  solve it."
- Numbers: digits, units with a space (`104 MPa`, `25 min`), "KES 50", Nairobi dates as "2 Nov" or "2 Nov 2026".
- Never shame: "Studied 5 of the last 7 days", not "Streak lost".
- AI honesty: say when something is AI-made ("AI-solved, verify"), and never present an AI guess as fact.

**Glossary (use these words, only these):**

| Word | Means | Not |
|---|---|---|
| Unit | a course unit like EMM 302 | course, subject, module |
| Topic | a chapter-level item from the outline | lesson, area |
| Sub-topic | a concept, derivation, method or assumption inside a topic | sub-area, skill |
| Stage | Adequate Prep / 1-Week / Last-Minute / Exam-Eve | mode (except in "1-Week Mode") |
| Check | comparing your final answer with the key | grade, mark (marking is for mocks) |
| Checkpoint | one numbered step of a worked solution | step card |
| Broke at | the checkpoint where your working diverged | failed at |
| Weakest link | the lowest of Why / How / Do | weakness score |
| Prompt pack | Master Prompt + context file for another AI | export, bundle |
| Lecturer hint | what the lecturer said, in their words | tip, note |

## Appendix D: Verification

```bash
# Study Desk
cd study && npm test && npx vite build
node -e "fetch('http://127.0.0.1:5190/api/state').then(r=>r.text()).then(t=>console.log(t.length,'bytes'))"

# Website
npm run build && npx vite preview --port 4173 &
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4173/no-such-page       # expect 404
curl -s http://127.0.0.1:4173/sitemap.xml | head -2                               # expect <?xml
curl -s http://127.0.0.1:4173/units/emm-302-strength-of-materials/ | grep -o "<title>[^<]*"

# Secrets (both repos)
git grep -nE "(sk-|AIza|ghp_)[A-Za-z0-9_-]{15,}|rapidapi-key\s*[:=]\s*['\"][a-z0-9]{20,}" || echo clean

# Live proxy lockdown (after R0.2)
curl -s -X POST "$SUPABASE_URL/functions/v1/claude-proxy" -H "Origin: https://evil.example" \
  -H "Content-Type: application/json" -d '{"system":"you are a pirate","prompt":"hi"}' -i | head -1
```

Playwright screenshot set (both products): 375 × 900 and 1280 × 900, light and dark, every route in Appendix B,
saved as `<product>-<width>-<theme>-<route>.png`. Fail the run on any console error or
`scrollWidth > innerWidth`.

## Appendix E: Owner decisions

Answer these before the step that needs them. A default is given so work isn't blocked.

| # | Decision | Needed by | Default if unanswered |
|---|---|---|---|
| E1 | Formula AI: members-only, public with limits, or off? (0.2) | R0.2 | off until members-only exists |
| E2 | Keep a waitlist for "Foundry Lab"? If yes, what is it actually? (0.3) | R0.3 | remove the section |
| E3 | Are the three testimonials real and consented? (0.4) | R0.3 | remove |
| E4 | Friend mode (gateway, installer, the owner's AI for friends): ship with Premium, invites only, or later? AI cost at 40 calls/day/friend × 100 = 4,000 calls/day. | after S13 | later; `study-friends` stays unmerged |
| E5 | Code-signing certificate (about USD 200–400/yr) to remove the SmartScreen warning | Part 5.7 | not yet; explain the warning |
| E6 | Website stack: Vite multi-page (recommended) or Astro | W2 | Vite multi-page |
| E7 | Universities to list: only those with real members? | W4 | KU only until counted |
| E8 | One domain for the board (`board.engineeringhub.site`)? | W9 | keep the vercel.app URL |
| E9 | Which readiness thresholds feel right after a week of use? | S9 | 40% / 70% |
