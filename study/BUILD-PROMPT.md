# Build Prompt: Study Desk — Personal Weakspot Analysis, Exam Predictions & Deep Context Engine (No Flashcards)

Paste everything below into DeepSeek, Claude, or Gemini at the start of a coding session. Paste it again at the start of each new session so the model knows the codebase, the product vision, and the rules.

## 1. Product Vision & Who This Is For

I run **Engineering Study Hub** at Kenyatta University (KU), and I am building **Study Desk** (`study/` inside `C:\Users\grego\Downloads\discord-sync-bot`, branch `study-dashboard`).
CAT and exam dates are uncertain because of the lecturers' strike: every date-driven feature must work with a date set, changed, or `TBA`.

I want to **test this on my own 3.1 Mechanical Engineering units first**, and then roll it out to **50–100 paying KU engineering students**—without premature cloud-scaling work yet.

**Strict Product Rules (What Makes Study Desk a Necessity):**
1. **NO FLASHCARDS EVER.** Remove and never build flashcard decks, spaced-repetition card flipping (`Recall`), or SM-2 card scheduling. Engineering is learned by diagnosing conceptual/mathematical weakspots and solving problems step by step.
2. **Course / Year / Sem Cohort Auto-Sorting (with Edit Override):** Students pick their Course (`EMM`, `EAR`, `EBE`, `ECV`, `EEE`, `EBM`, `EPL`), Year (`1–5`), and Semester (`1` or `2`) to auto-load their units, with an easy Edit button for retakes or dropped units.
3. **4 Explicit Study Stages:** Asked explicitly during setup and planning (`Adequate Prep`, `1-Week Mode`, `Last-Minute Mode`, `Exam-Eve Triage`) to control whether the student sees first-principles derivations, high-yield shortcuts, or emergency formula sheets.
4. **Personal Sub-Topic & Concept Weakspot Analysis:** Students can break any unit topic into sub-topics and core concepts, run a personal diagnostic/self-audit, and see their exact weakspots cross-referenced against past-paper mark weightings and recurring operation errors (`sign convention`, `unit conversion`, `concept gap`, `algebra/calculus slip`).
5. **Past-Paper Prediction Generator + Lecturer Hints:** Ranks topics and sub-topics by past-paper mark frequency plus classroom hints (e.g., *"the exam will mainly focus on beta functions"*).
6. **Deep Context Prompt Builder for External AI:** Built-in API calls have context and effort limits. Whenever a task needs heavy problem solving, full derivations, or deep weakspot tutoring, warn the student upfront and generate a **detailed, context-rich Prompt + `<UNIT>-context.md` file** (packing synced notes, past papers, lecturer hints, and the student's personal weakspot profile) for them to upload to their own AI (Claude, DeepSeek R1, ChatGPT).
7. **Step-by-Step Checkpoint Feedback (Photo or Final Answer + Operations):** Students submit a photo of handwritten working or just their final answer + operations. If wrong, dissect the solution into numbered intermediate checkpoints with step solutions so they countercheck their own paper, pinpoint the exact broken step, and feed that data into their Personal Weakspot Analysis.

## 2. Before Writing Code in a Session, Ask These Setup & Plan Questions

At the start of a new build or study-setup session, ask these questions in one message, wait for my answers, and propose a short plan before writing code:

1. **Course, Year & Semester:** Which cohort (`EMM` Mechanical, `EAR` Aerospace, `EBE` Biosystems, `ECV` Civil, `EEE` Electrical, `EBM` Biomedical, `EPL` Energy/Petroleum; Year `1–5`; Sem `1–2`) are we testing with, and do any auto-sorted units need editing?
2. **Current Study Stage (Pick 1 of the 4 Modes):**
   - **Adequate Prep (`adequate` — 2+ weeks out):** Fundamentals, first principles, derivations, and full sub-topic conceptual mastery.
   - **1-Week Mode (`one-week` — 3–7 days out):** Main high-yield predicted topics, standard solving recipes, and shortcuts.
   - **Last-Minute Mode (`last-minute` — 24–72 hours out):** Formula sheets, unit/symbol checks, shortcuts, and high-risk weakspots.
   - **Exam-Eve Triage (`exam-eve` — <24 hours):** Step-by-step walkthroughs of the top 1–2 predicted questions + 1-page survival sheet.
3. **Lecturer Hints & Known Weakspots:** Did the lecturer emphasize or exclude specific topics in class (e.g., *"focus on beta functions"*), and which sub-topics feel shaky right now?
4. **Target Feature Slice:** Which feature slice from Section 4 are we building and testing in this session?

## 3. What Exists Today vs What Is Still To Build (Read Before Changing)

Everything lives in `study/` inside `C:\Users\grego\Downloads\discord-sync-bot` on branch `study-dashboard`. Read the files before modifying them. The build order and "Done when" checks are in `PHASES.md`; the `Status` column below is kept current at the end of every phase.

| File | What it does today | Status |
|---|---|---|
| `study/server/index.js` | Node `http` server on `127.0.0.1:5190`: JSON API under `/api/*`, serves the built frontend from `study/dist/`. Generic list routes: `POST /api/<list>`, `PATCH /api/<list>/<id>`, `DELETE /api/<list>/<id>` for the lists in `store.js` `LISTS`. | exists |
| `study/server/store.js` | Local JSON store at `study/data/study.json` (git-ignored; `STUDY_DATA_DIR` overrides it for tests). Lists: `units, topics, sessions, papers, teach, questions, mocks` plus empty `subtopics, attempts, hints` (Phase 4+), and `settings`. Legacy `cards`/`reviews` stay in old files, untouched. Backs the file up to `data/backups/` on the first start of a build with a newer `VERSION`. | exists |
| `study/server/defs.js` | Shared definitions: study stages, self-audit values, sub-topic kinds, error types, weakness and hint weights, `TBA`. | exists (Phase 0) |
| `study/server/plan.js` | Daily plan (top 3 units, one task each) and study stats. | exists |
| `study/server/mastery.js` | Evidence-based topic colour (red/amber/green). | exists |
| `study/server/library.js` | Unit catalogue (`cohort.js` `catalogue()`), the KU `CALENDAR` from `lib/config.js`, and each unit's files from the Supabase `files` table. | exists |
| `study/server/ingest.js`, `extract.js` | Context library: downloads a unit's Discord files, extracts text (PDF/DOCX/PPTX) into `study/data/library.json`; `contextFor(unit, topic)` returns grounding text. | exists |
| `study/server/bot.js` | DM-only Discord bot (`OWNER_ID` only). Commands: `today, files, teach, log, paper, help, stop`. 07:00 plan and 20:30 nudge (Nairobi). | exists |
| `study/server/coach.js` | Marks Feynman teach-backs (score 1-5, gaps, follow-up question). | exists |
| `study/server/brain.js` | AI: notes to CAT questions, mock question fill, mock marking. | exists |
| `study/server/prompt.js` | Prompt builder for external AI, grounded in the synced library (short context cap). | exists; deep `.md` pack is Phase 7 |
| `study/server/ai.js` | Shared AI provider wrapper (`Gemini` default / `DeepSeek` / `Claude`): `structured(schema, system, content)`, `aiReady()`. | exists |
| `study/server/insights.js` | Pure activity/performance functions (WIP, not wired into the UI; its "deeper dive" still reads retired flashcard reviews). | superseded by Phase 6 |
| `study/web/src/*.jsx` | React frontend: `Hero, Today, Units, Notes, Teach, Mock, Papers, Prompt, Progress, Timer, CheckIn, Onboarding`. Plain CSS in `styles.css`. | exists |
| `study/server/cohort.js` | Course + year to units from the catalogue (`lib/units.json` plus thread-only units from `lib/threads.json`). The Hub has no semester data, so a cohort lists the whole year and the student unticks. | exists (Phase 2) |
| `study/server/stages.js` | Per-unit study stage from the unit's own date, with overrides. | Phase 3 |
| `study/server/analysis.js`, `web/src/Analysis.jsx` | Sub-topics, self-audit, weakspot matrix. | Phases 4 and 6 |
| `study/server/predict.js`, `web/src/Predictions.jsx` | Past-paper question map, lecturer hints, predictions. | Phase 5 |
| `study/server/context-pack.js` | `<UNIT>-<TOPIC>-context.md` pack + limit guard. | Phase 7 |
| `web/src/Practice.jsx` | Checkpoint dissection (answer + operations, then photo). | Phases 8 and 9 |
| Bot commands `predict, hint, weakspots, mark` | | Phases 5-9, aligned in Phase 11 |

**Do not modify files outside `study/`** (`api/`, `lib/`, `pc/`) unless explicitly requested. Reading `lib/` is fine.

## 4. Prioritized Feature Roadmap (No Flashcards — Personal Analysis & Context First)

Build these one at a time in this exact order.

### 4.1 Remove Flashcards + Cohort Auto-Sorting & 4-Stage Prep Engine (Priority #1)

- **Retire Flashcards Completely:** Remove `Recall.jsx`, SM-2 scheduling, and all card generation from UI, server, and bot.
- **Cohort Auto-Sorting (`Course → Year → Sem`):** Auto-populate units for the chosen department, year, and semester using `lib/units.json`, `lib/threads.json`, and `files` folder metadata, with an **"Edit Units"** drawer for retakes/electives.
- **4-Stage Prep Mode (`adequate` | `one-week` | `last-minute` | `exam-eve`):** Explicitly asked during setup and planning; dynamically changes the daily plan, sub-topic recommendations, and prompt templates.

**Done when:** There are zero flashcards in the app, picking `EMM · Year 3 · Sem 1` loads your 3.1 units with edit controls, and switching Study Stages reshapes `Today`.

### 4.2 Personal Sub-Topic & Concept Weakspot Analysis (`server/analysis.js` + `Analysis.jsx`) (Priority #2)

Let students run a personal analysis so they know exactly which sub-topics, concepts, and operations are holding them back:
- **Sub-Topic Decomposition:** Break each unit Topic into granular **Sub-Topics & Concepts** (e.g., governing principle, derivation assumptions, sign conventions, standard calculation method, boundary conditions).
- **Personal Diagnostic / Self-Audit:** Let the student rate sub-topics (`Solid` / `Shaky` / `Stuck` / `Untested`) or take a quick 2-question diagnostic check per topic.
- **Automatic Weakspot Tracking from Mistakes & Teach-Backs:** Every failed step checkpoint (Section 4.5) and every gap in a Feynman teach-back tags the specific **Sub-Topic** and **Failure Mode** (`concept gap`, `wrong governing equation`, `sign convention`, `unit conversion`, `algebra/calculus slip`, `boundary condition`).
- **Weakspot Dashboard:** Shows:
  1. **Critical Sub-Topic Weakspots:** Ranked by `Predicted Exam Weight × Personal Weakness`.
  2. **Operation Error Breakdown:** Visualizes *why* the student loses marks across a unit (e.g., unit conversions vs. conceptual gaps vs. sign conventions).

**Done when:** For any unit, you can view a sub-topic tree, run a personal self-audit, and see a ranked list of your weakest sub-topics and most common operation errors.

### 4.3 Past-Paper Prediction Generator + Lecturer Hints (`server/predict.js`) (Priority #3)

- **Past-Paper Topic & Sub-Topic Map:** Parse synced past papers and CATs in `library.json` into individual questions with marks, year, and paper type (`CAT 1`, `CAT 2`, `Exam`), mapping each to a Topic and Sub-Topic. Flag scanned image-only PDFs clearly.
- **Lecturer Hints (`lecturerNotes`):** Let the student add classroom hints per unit (e.g., *"the exam will mainly focus on beta functions"*, *"skip thick cylinders"*).
- **Dynamic Re-Weighting:** Boost lecturer-focused topics (`2.5x` weight, **"Pinned by Lecturer"** badge), mute excluded topics in `one-week` / `last-minute` / `exam-eve` modes, and feed the prediction weights directly into the Personal Weakspot ranking and **Predicted Mock Generator**.

**Done when:** Adding *"the exam will mainly focus on beta functions"* pins `Beta functions` to #1 in Predictions, elevates its sub-topics in Personal Weakspot Analysis, and weights it first in `Today` and generated mocks.

### 4.4 Deep Context & Effort-Limit Prompt Builder (`Prompt.jsx` + `server/context-pack.js`) (Priority #4)

Because the built-in AI has context window and reasoning-effort limits on complex engineering problems:
- **Upfront Context & Effort Disclaimer:** Before running heavy derivations, complex problem solutions, or deep weakspot tutoring, warn the student when the built-in AI may truncate steps or slip on math, and offer a 1-click handoff to the **Prompt Builder**.
- **Comprehensive Prompt Generator (1-Click Copy):** Generates a deeply structured prompt tailored to external reasoning models (Claude, DeepSeek R1, ChatGPT) that embeds:
  - Unit code, title, and active **Study Stage** (`adequate` = first principles & full derivations; `one-week` = high-yield patterns & shortcuts; `last-minute` = formulas, units & traps; `exam-eve` = step-by-step survival walkthrough).
  - All **Lecturer Hints** for the unit.
  - The student's **Personal Weakspot Profile** for the selected topic (listing the exact sub-topics marked `Stuck`/`Shaky` and their top mistake categories so the external AI targets their exact blind spots).
  - Strict formatting instructions requiring numbered intermediate checkpoints with SI units at every step.
- **Full Context `.md` Pack (`<UNIT_CODE>-<TOPIC>-context.md` Download):** Exports a single Markdown file containing all relevant extracted past-paper questions, CATs, synced lecture notes from `library.json`, and the student's recent failed checkpoints—plus a clear checklist of which original PDFs/diagrams to attach alongside the `.md` file.

**Done when:** From any weak sub-topic or past-paper question, one click downloads `<UNIT_CODE>-<TOPIC>-context.md` and copies a complete, stage- and weakspot-aware prompt ready to upload to an external AI.

### 4.5 Step-by-Step Checkpoint Feedback: Photo OR Final Answer + Operations (Priority #5)

- **Two Fast Submission Modes:**
  1. **Final Answer + Operations:** Student enters just their final answer + units (e.g., `142.5 MPa`) and optionally a 1-line summary of the operations they performed.
  2. **Photo Upload (Dashboard & Discord DM):** Student uploads or DMs a photo of their handwritten working. If vision/effort limits apply, fall back cleanly to Checkpoint Dissection or the Prompt Builder.
- **Step-by-Step Dissection & Countercheck:**
  - When an answer is wrong, dissect the solution into **3 to 6 numbered Operation Checkpoints**, displaying the intermediate equation and solved value at each step.
  - The student counterchecks their own paper step by step, clicks **"Broke here ❌"** on the diverging step, and tags the **Sub-Topic** + **Operation Error Type**—which immediately updates their **Personal Weakspot Analysis** (Section 4.2).

**Done when:** Submitting a wrong final answer displays numbered intermediate step solutions, lets you click the exact step where your paper diverged, and logs that sub-topic and error type into your Personal Weakspot Analysis.

### 4.6 Stage-Adaptive Study Artifacts: Worked Ladders, Shortcuts & Printable Formula Sheets (Priority #6)

- **Adequate Prep (`adequate`):** 3-step problem ladders (1. Fully worked example with physical reasons → 2. Faded steps to fill in → 3. Solo problem) + Feynman concept teach-backs.
- **1-Week Mode (`one-week`):** High-yield method recipes and calculation shortcuts for the top predicted sub-topics.
- **Last-Minute & Exam-Eve (`last-minute` / `exam-eve`):** Auto-generated printable **Unit Formula & Shortcut Sheet** with symbol definitions, SI units, sign conventions, **when the formula does NOT apply**, and the student's personal recurring traps.

## 5. Rules for Changing Code

- **Read before writing:** Open every file you touch and its callers. Match existing style: ES modules, 2-space indents, single quotes, small functions, plain CSS tokens in `styles.css`. No TypeScript, Tailwind, UI frameworks, or external databases.
- **Never build flashcards:** All learning, testing, and mastery tracking must flow through **Sub-Topic Analysis**, **Step-by-Step Checkpoints**, **Teach-Backs**, and **Past-Paper/Mock Problems**.
- **Preserve student data:** Old `study.json` files must load cleanly with safe defaults. Always test against a copy of `study/data/study.json` and restore it afterwards.
- **All AI calls go through `study/server/ai.js`:** Validate structured JSON responses and degrade gracefully to the **Deep Context Prompt Builder** whenever no key is set or when context/effort limits would hurt answer quality.
- **Secrets:** Never hardcode or commit API keys. Keep `.env`, `data/`, and `dist/` git-ignored.

## 6. Session Workflow

1. Restate the single feature slice we are building and its **"Done when"** check.
2. Ask the Section 2 setup questions if not yet answered.
3. List the exact files you will create or modify (3–6 lines).
4. Implement the change cleanly.
5. **Test before reporting completion:**
   - Run `cd study && npx vite build` (must succeed with zero errors) and `npm test` (all `node --test` suites pass).
   - Start `node server/index.js` and test new endpoints (including legacy `study.json` compatibility and no-AI-key fallbacks).
   - Verify sub-topic weakspot scoring, prediction weighting, prompt/context `.md` generation, and checkpoint dissection with a small Node test script.
6. Report what was tested, commit on `study-dashboard`, and suggest the single highest-impact next step.
