# Study Desk — phased build plan (no flashcards)

> Paste this together with `BUILD-PROMPT.md` at the start of each build session. Build **one phase per session** (or more if they are small). Finish each phase completely, test it, and commit it before starting the next. Stop only for the "Ask first" cases.

## Context

Study Desk is an exam-focused engineering study tool for Kenyatta University (KU) students. It lives in `study/` inside `C:\Users\grego\Downloads\discord-sync-bot`, on branch `study-dashboard`. It runs at `http://localhost:5190` via `start.bat` and keeps its data in a local JSON store in `study/data/`. We test it on the owner's own 3.1 Mechanical Engineering units first, then roll it out to 50–100 KU students.

**Exam dates are uncertain** because of the lecturers' strike. No date is fixed. Every date-driven feature must work with a date set, changed, or marked **TBA**. Do not plan around a deadline. Build it properly.

**Design rules**
1. **No flashcards, ever.** Learning flows through sub-topic analysis, step checkpoints, teach-backs, and past-paper/mock problems.
2. **Find exact weakspots.** Show which sub-topic, which concept, and which operation the student gets wrong, cross-referenced with past-paper marks.
3. **Predictions** come from past-paper frequency × marks, plus lecturer hints.
4. **The built-in AI is honest about its limits.** For heavy reasoning, it hands off to a Deep Context Prompt + `.md` pack the student takes to an external AI.
5. **Checkpoint feedback.** The student enters a final answer (or uploads a photo). If it's wrong, the app shows numbered checkpoints. The student marks the step where their working broke, and that feeds the weakspot data.

## Shared definitions (use these exact values everywhere: UI, server, bot, prompt pack)

- **Study stages:** `adequate` (more than 14 days out) · `one-week` (3–7 days) · `last-minute` (24–72 h) · `exam-eve` (less than 24 h). The days 8–14 fall under `adequate`.
- **Self-audit:** `solid` · `shaky` · `stuck` · `untested`.
- **Sub-topic kind:** `concept` · `derivation` · `method` · `assumption`.
- **Error types:** `concept-gap` · `wrong-equation` · `sign-convention` · `units` · `algebra-calculus` · `boundary-condition` · `misread-question`.
- **Weakness score (0–1):** solid 0.1 · shaky 0.6 · stuck 1.0 · untested 0.7. Add 0.1 for each checkpoint failure in the last 14 days, and subtract 0.1 for each clean solve in the last 14 days. Clamp the result to 0–1.
- **Hint multiplier:** a `focus` hint is 2.5×. An `exclude` hint is 0.5× in `adequate` and 0× in the other stages.
- **Exam weight** = past-paper frequency × average marks × hint multiplier. Predictions rank by exam weight only.
- **Priority (weakspots)** = exam weight × weakness.
- **Time zone:** all date and time logic uses `Africa/Nairobi`.

## Ground rules

- Read every file you touch, and its callers, before changing it. Use ES modules, 2-space indentation, single quotes, small functions, and plain CSS tokens in `styles.css`. No TypeScript, Tailwind, UI frameworks, or external databases.
- **No new dependency** unless it saves a lot of code. Name it and give the reason first, then wait for an OK.
- **Never delete student data.** All new fields are optional. Old `study.json` files must load with safe defaults. Before any phase changes the data shape, copy the store to `data/backups/pre-<phase>-<date>.json`.
- **All AI calls go through `server/ai.js`.** Validate structured JSON. Every feature must still do something useful with no API key; usually that means falling back to the Prompt Builder.
- **Pure logic is tested.** Scoring, prediction, stage calculation, answer comparison, and pack building are pure functions, tested with `node --test` against fixtures in `study/test/fixtures/`.
- **UI** works at 375px, in light and dark mode, and with reduced motion. Every input has a label and everything is keyboard-reachable.
- Don't change anything outside `study/` (`api/`, `lib/`, `pc/`). Reading `lib/` is fine.
- Commit at the end of each phase on `study-dashboard`, as `study(phase N): <what>`. Never commit `.env`, `data/` or `dist/`.

## Test checklist for every phase

1. `cd study && npx vite build`: no errors.
2. `node --test`: all tests pass.
3. Start `node server/index.js` and exercise the new routes with curl against (a) an empty store, (b) the seeded fixture store, (c) a legacy `study.json` with `cards`/`reviews`, and (d) a run with **no AI key**.
4. Check the UI at 375px, in light and dark mode, and using only the keyboard.
5. Restore the real `study.json` if you touched it.

---

## Phase 0: Recon and foundations (no features)

**Goal:** know what really exists, and lay the shared groundwork.

- Read `BUILD-PROMPT.md`, `server/index.js`, `store.js`, `plan.js`, `library.js`, `bot.js`, `coach.js`, `ai.js`, `brain.js`, `web/src/App.jsx`, and `lib/units.json` / `lib/threads.json`.
- Post a **map** in the chat with:
  - a table of **exists today** vs **to build** (BUILD-PROMPT Section 3 describes the target, not necessarily the current code);
  - the store's lists and fields;
  - the real course codes found in `lib/units.json`;
  - whether `library.json` holds extracted text for each file, and which files are scanned with no text.
- Add `study/server/defs.js` with the shared definitions above.
- Add store migration helpers: default empty lists for `subtopics`, `attempts`, `hints`; default `settings.cohort`; and per-unit `examDate: null | ISO | 'TBA'`.
- Set up a `node --test` harness and a seeded fixture store: 1 cohort, 4 units, about 6 topics, past papers with marks.
- Correct `BUILD-PROMPT.md` Section 3 to match reality.

**Done when:** the map has been posted, the fixtures and tests run, old and empty stores load, and nothing is visibly different in the UI.

## Phase 1: Retire flashcards

**Goal:** no flashcards anywhere, and no data lost.

- Remove `Recall.jsx`, SM-2 scheduling, and card generation from `Notes.jsx`, `coach.js`, `plan.js`, the routes, the bot, and the Progress charts.
- Leave the `cards` and `reviews` arrays in `study.json` untouched and unread.
- Mastery colours no longer use recall. Temporarily they use teach-back and paper evidence only; Phase 6 finalises them. Show a one-time notice: "Recall cards were retired. Some topics may change colour."
- Add a test: a legacy store with 500 cards loads, and the plan has no card tasks.

**Done when:** `grep -ri "card\|recall\|sm2" web/src server` returns only migration and compatibility code, the legacy store loads, and the bot `help` command lists no card commands.

## Phase 2: Cohort auto-sorting and Edit Units

**Goal:** choosing Course → Year → Sem loads the right units.

- A course picker (codes taken from `lib/units.json`, not hardcoded), Year 1–5, and Sem 1–2, saved to `settings.cohort`.
- `library.js` resolves the cohort's units, including shared `ECU`/`UCU`/`SMA` units, from `lib/units.json`, `lib/threads.json`, and Supabase `files` metadata.
- An **Edit units** drawer to add a retake or elective, remove a unit, and set each unit's CAT/exam date as a date or **TBA**.
- **Sync files** pulls materials for every unit in one go and shows progress.
- When the cohort changes, add the new units without deleting the old ones (their topics and logs are kept). Ask before hiding the old units.

**Done when:** choosing `EMM · 3 · 1` loads the 3.1 units, editing works, dates accept TBA, and sync reports per-unit file counts.

## Phase 3: Study stages (per unit, calculated automatically)

**Goal:** the plan changes with how close each unit's exam is.

- `stageFor(unit, now)`: calculated from the unit's own date. A TBA date gives `adequate`. The student can override it per unit, and a top-bar override can set every unit at once.
- The top bar shows the mix, for example "1 Exam-Eve · 3 Adequate". The stage picker appears in setup and when building a plan.
- `plan.js` uses each unit's stage to choose task types. For example, `adequate` gets derivations and teach-backs; `last-minute` gets formula checks and the top weakspots.
- Unit-test the stage boundaries and TBA handling.

**Done when:** changing a unit's date, or overriding its stage, reshapes Today straight away, and TBA units sit in Adequate.

## Phase 4: Sub-topics and self-audit

**Goal:** every topic can be broken down into rated sub-topics.

- Add a `subtopics` list with `{ id, unitId, topicId, name, kind, audit, auditAt, mistakeCount, lastTested }`.
- `Analysis.jsx`: a sub-topic tree for each unit, with add, edit, reorder, and delete (delete has an undo toast).
- **60-second self-audit:** rate all of a topic's sub-topics on one screen, using the 1–4 keys.
- **Optional AI extraction:** "Suggest sub-topics from my notes" goes through `ai.js`. The student reviews the suggestions before they're added. With no AI key, the button explains this and links to the Prompt Builder (Phase 7; until then, just say it's coming).
- `coach.js` (teach-back): any missing concepts it reports are matched to sub-topics and set them to `shaky`, recording the source as `teach`.

**Done when:** you can build and audit the sub-topics for one real 3.1 topic in under 2 minutes, and a teach-back gap flags the matching sub-topic.

## Phase 5: Past-paper map, lecturer hints and predictions

**Goal:** know what is likely to be tested.

- `server/predict.js` splits synced papers and CATs into `questions` with `{ unitId, source, year, type: 'CAT1'|'CAT2'|'Exam', number, marks, text, topicId, subtopicIds, scanned }`.
  - Parse without AI first (question numbers and `(x marks)` patterns).
  - Use AI only to map questions to topics, and let the student correct the mapping.
  - Scanned PDFs are flagged, with a "paste the question text / attach a screenshot" option.
- Lecturer hints are added per unit as `{ id, unitId, text, kind: 'focus'|'exclude'|'note', topicIds, at }`. Keep the student's exact wording, and let them tag which topics a hint affects.
- `Predictions.jsx` ranks topics by **exam weight only**. It shows a "Pinned by lecturer" badge and the evidence for each topic, e.g. "appeared 5 of 6 years, average 14 marks".
- **Predicted mock:** chooses questions to cover about 65% of the predicted marks.

**Done when:** adding the hint "exam will mainly focus on beta functions" (focus → Beta functions) moves it to #1 with a badge, an `exclude` hint mutes a topic in the late stages, and the ranking is explained by visible numbers.

## Phase 6: Weakspot matrix and error breakdown

**Goal:** fix the weakspots that cost the most marks first.

- `server/analysis.js` calculates the priority for each sub-topic (exam weight × weakness) and returns:
  - **Critical Weakspots (Fix First):** the top 10, each with the reason and one concrete next step.
  - **Recurring Error Patterns:** error-type counts per unit over the last 30 days, with a one-line takeaway, e.g. "4 of your last 6 errors were sign conventions and mm→m conversions".
- Final mastery colours follow the guide's rules (green, amber, red).
- `Today` takes its top 3 actions from the stage, the critical weakspots, and the date.

**Done when:** on the fixture store, the ranking matches a hand calculation in the tests, and Today points at the right sub-topics.

## Phase 7: Deep Context Prompt Builder and `.md` pack

**Goal:** a one-click handoff to an external AI when the built-in one isn't enough.

- **Limit guard:** before any heavy AI task (multi-step solutions, derivations, deep tutoring, or a context too big for the provider), show the disclaimer with **Open in Prompt Builder**. Also add an "Open in Prompt Builder" button to every topic, weakspot, and question.
- `Prompt.jsx` has a unit / topic / sub-topic picker (defaulting to the top critical weakspots) and offers the 5 goal templates:
  1. breakdown
  2. past-paper solution
  3. method shortcuts
  4. formula/trap sheet
  5. diagnose my mistakes
- **Master Prompt** (copy to clipboard): includes the cohort, the unit's stage, the lecturer hints word for word, the weakspot profile (stuck/shaky sub-topics and top error types), and instructions to show numbered checkpoints with SI units, state assumptions, and test the student on their weak sub-topics.
- **`server/context-pack.js`** builds `<UNIT>-<TOPIC>-context.md`. It contains:
  - matching questions with their marks;
  - CAT and lecture-note text from `library.json`;
  - lecturer hints;
  - recent failed checkpoints.

  The pack has a **token budget** (default about 120k tokens, estimated as characters ÷ 4). When it's over budget, priority goes weakspots and questions first, then hints, then notes. A footer lists anything that was cut.
- **Upload checklist:**
  - which `.md` file to attach;
  - which original PDFs or diagrams to attach (scanned, or containing figures);
  - which reasoning mode to turn on.
- Works fully with no API key.

**Done when:** from a weakspot and from a past-paper question, one click copies the prompt and downloads the pack. The pack respects the budget and lists the scanned files to attach.

## Phase 8: Checkpoints — final answer + operations

**Goal:** check an answer without typing equations, without logging false weakspots.

- `attempts` records `{ id, questionId, answer, unit, operations, verdict, keySource, checkpoints, brokeAt, errorType, subtopicId, at }`.
- **Where the answer key comes from, in order:**
  1. a marking scheme in the library;
  2. a key the student enters;
  3. an AI-solved answer, labelled **"AI-solved — verify"**.

  With no key and no AI, offer to enter a key or use the Prompt Builder.
- **Unit-aware comparison:** a pure function parses the value and unit (`142.5 MPa` = `0.1425 GPa`, `mm`↔`m`, `kN`↔`N`) and accepts answers within ±1% by default. A sign error is detected separately. Tested.
- **When the answer is wrong, or the student taps "Show checkpoints":** show 3–6 numbered checkpoints, each with the expected equation and value. The student taps **Broke here ❌** on one checkpoint and tags the sub-topic and error type, both pre-filled with a best guess. That updates the weakspots.
- **"This checkpoint looks wrong" button:** logs nothing against the student, saves the flag, and offers the Prompt Builder.

**Done when:**
- a correct answer in different units is accepted;
- a wrong answer shows checkpoints;
- Broke here updates the matrix;
- a disputed checkpoint changes nothing about the student's record.

## Phase 9: Checkpoints — photo of working (dashboard + Discord)

**Goal:** a photo goes in and checkpoints come out.

- Dashboard upload (resized on the client) and a Discord DM in the form `mark EMM 302 2023-Exam Q3` with a photo attached.
- `ai.js` reports which providers can read images. If the active provider can't, or the image is too large, say so plainly and fall back to Phase 8 (enter the final answer) or the Prompt Builder (attach the photo there).
- Photos are saved under `data/uploads/` and are never sent anywhere except the chosen AI provider.

**Done when:** a photo on a vision provider produces checkpoints, and a non-vision provider falls back cleanly on both the dashboard and Discord.

## Phase 10: Study materials matched to the stage

**Goal:** the right kind of practice for each stage.

- `adequate`: 3-step ladders (a fully worked example → a version with steps to fill in → a solo problem) plus teach-back prompts.
- `one-week`: method recipes and shortcuts for the top predicted sub-topics.
- `last-minute` / `exam-eve`: a printable **Formula and Shortcut Sheet** (print CSS that fits one A4 page). It covers symbols, SI units, sign conventions, **when the formula does NOT apply**, and the student's own recurring traps from the error data.
- Content generated by AI is saved, so it isn't regenerated every time, and can be edited. With no key, offer the matching Prompt Builder template.

**Done when:** each stage produces its own material for one 3.1 unit, and the formula sheet prints cleanly on one page.

## Phase 11: Bot and guide alignment

- Bot commands: `today, predict, hint, weakspots, mark, teach, log, paper, files, stop, help`. All plain text, using the shared definitions, with dates that handle TBA. Daily DMs at 07:00 and 20:30 Nairobi time, adapted to each unit's stage.
- Update `guide.md` and `BUILD-PROMPT.md` to describe what actually shipped.
- Write a short release note for the owner: what changed and what to re-check.

**Done when:** every guide example works as written, both in the bot and in the UI.

## Phase 12: Before the paid rollout (decide first, build later)

These are decisions, not build steps. Before any student installs the app:

- **Secrets:** right now each install would need the owner's Discord bot token, AI key, and Supabase key. Choose between "each student brings their own AI key" and a small hosted proxy that keeps the keys server-side.
- **Bot model:** one shared bot token running on 100 laptops is fragile and leaks the token. Decide between one hosted bot and per-student bots.
- **Distribution and updates:** how students install and update, and how they back up `data/`.
- **Past-paper and notes sharing terms** for paying users.

**Done when:** there is a written decision for each point. No code is needed.

---

## Ask first

- Adding any dependency.
- Changing or removing an existing data field. Adding new optional fields is fine.
- Touching files outside `study/`.
- A conflict between this plan and `BUILD-PROMPT.md`. Flag it and wait.

## End-of-phase report (in the chat)

What shipped (with the commit hash), what was tested and how, anything skipped and why, and the single highest-impact next step.
