# Study Desk audit, 28 Oct 2026

What was checked: every view, every API route and every bot command after Phase 8 (commit `11c3480`), judged for **you, now**: your eight 3.1 EMM units, with exam dates uncertain because of the strike. The audit read the code and looked at the running app in a browser at 375px and 1280px, light and dark. No test suites were run. Your real `data/study.json` was not touched (1,640 bytes, last changed 26 Oct, before and after).

Screenshots are in `C:\Users\grego\AppData\Local\Temp\claude\C--Users-grego-Downloads-rgfsgvdfgd\9d793ebd-f366-4841-aa7b-8ec50bd83f56\scratchpad\audit\`, named `<width>-<theme>-<nn>-<section>.png`. That folder is temporary.

## The short version

The parts work, but the whole is hard to use day to day:

1. **Almost everything is empty until you type topics in by hand.** Your real store has 8 units and 0 topics. Predictions, Weakspots, mastery colours and most of Today stay blank until you do. The course outlines are already synced, but nothing reads them for you.
2. **The app believes the KU calendar, not the strike.** The hero says "5 days to 2nd CATs" and puts 7 of 8 units in 1-Week Mode, so Today hands out 1-Week tasks.
3. **The parts aren't joined up.** There are 10 separate unit pickers, each starting on EAR 307. Today and Weakspots never send you to Check my answer. The new checkpoint data doesn't count towards your streak, the 20:30 nudge or Progress.
4. **One long page.** It is 8,914px tall on a laptop, and the top nav cuts off at "Pap…", so Papers, Prompt and Progress can't be seen without scrolling.

The good news: none of this needs a rewrite. Most fixes are small (S).

## Verdict per section

| Section | Verdict | One line |
|---|---|---|
| Top bar | Fix | Nav doesn't fit at 1280px; at 375px the brand disappears and the two selects shrink to "Stag" and "A". |
| Hero | Fix | Counts down to a KU calendar date the strike has likely moved. The Exams tile does too, even when every unit is TBA. |
| Today | Fix | Good idea, clear layout. Its tasks send you to Mock (AI-made questions) or Papers (a score form), never to a real past-paper question. |
| Units | Fix | Setup, dates, topics and file library all work. Each card is heavy, and clicking a topic chip silently changes its colour. |
| Predict | Keep, small fixes | The most useful section. You have to read papers and map topics by hand, for each unit. |
| Weakspots | Keep | Works, but stays empty until sub-topics exist. "Fix first" actions go to Mock instead of Check my answer. |
| Practice (Check my answer) | Keep, small fixes | Works end to end. AI waits run to about 75 seconds with only "Checking…" shown, and an AI-solved key can be wrong. |
| Notes → questions | Merge into Mock | Makes you paste notes you have already synced. Its topic field collapses to nothing at 375px. |
| Teach | Keep, fix layout | Core to mastery colours. Its topic field collapses to nothing at 375px. |
| Mock | Fix | The timer gives 2 minutes per question. The name field collapses even at 1280px. Predicted mocks are AI-marked against a placeholder answer. |
| Papers | Merge | A third "past papers" place, after Units → server files and Predict. Its score form belongs next to the paper. |
| Prompt Builder | Keep | The most finished flow: 4 clicks from a weakspot to a copied prompt and a downloaded pack. |
| Progress | Fix | Ignores sub-topics, checkpoints and the 70 past-paper questions. Its legend says to rate topics in Units, but rating is now in Weakspots. |
| Focus timer + check-in | Simplify | The check-in asks focus, kind and energy every session, and nothing reads the answers. |
| Tour + checklist | Small fix | Step 1 says "everything is planned back from this" date, which is wrong under TBA. |
| DM bot | Keep, small fix | All commands answer sensibly. The 20:30 "Nothing logged today" ignores checks and audits. |

## Findings, most serious first

Sizes: **S** under an hour · **M** a few hours · **L** a day or more.

### Blocker

| # | Where | What's wrong | Why it matters to you | Fix | Size |
|---|---|---|---|---|---|
| B1 | your running app (port 5190) | The server you open daily runs code from before Phase 2. `/api/state` has no cohort and no stage mix. | Nothing from Phases 2–8 is visible to you yet. | Close the `start.bat` window and run it again. It rebuilds and restarts. | S (you) |
| B2 | `web/src/Units.jsx:232`, `server/plan.js:66,73` | Topics can only be typed in, unit by unit. Your store has 0 topics across 8 units. | Predict can't rank, Weakspots has nothing to break down, mastery is blank, and Today just says "List the topics…" | Add a "Suggest topics" button per unit. The AI reads the synced outline and past-paper questions, you tick the ones to keep, and nothing is saved until you do. It follows the existing "Suggest sub-topics" pattern (`server/brain.js` `suggestSubtopics`). | M |

### High

| # | Where | What's wrong | Why it matters | Fix | Size |
|---|---|---|---|---|---|
| H1 | `web/src/Hero.jsx:11,20`, `server/plan.js:16-18` | Units with no date fall back to the KU calendar, so the hero shows "5 days to 2nd CATs" and the Exams tile shows "33d". All 7 undated units are in 1-Week Mode. | The plan is shaped around dates you know are uncertain. The only fix is a small orange "Mark 7 calendar dates TBA" link inside Units. | Show a one-line banner in the hero while any unit is on the calendar ("CAT dates are uncertain? Mark them TBA"). Hide the Exams tile when every unit is TBA. Fix the tour copy (`Onboarding.jsx:7`). | S |
| H2 | `web/src/App.jsx:24`, `styles.css:57-59` | 11 nav links in one row. At 1280px the row cuts off at "Pap…". At 375px only 4 links show, the brand is gone, and the selects read "Stag" and "A". | Papers, Prompt and Progress are effectively hidden on your laptop. | Let the nav wrap to a second row, or move the stage and AI selects into a small settings menu. Section grouping (see F2) also shortens the list. | S |
| H3 | `web/src/Notes.jsx:42`, `Teach.jsx:62`, `Mock.jsx:98`, `styles.css:71,86` | `.row` without `wrap` plus `input.grow` lets the topic field shrink to about 20px. Seen at 375px in Notes and Teach. The Mock "Name" field shows as "Na" even at 1280px. | In a narrow window you can't see or type the topic, and Teach won't submit without one. | Add `wrap` to those rows and give `input.grow` a minimum width. | S |
| H4 | 10 unit pickers (`Predictions.jsx:52`, `Analysis.jsx:152`, `Practice.jsx:9`, `Prompt.jsx`, `Notes.jsx:8`, `Teach.jsx`, `Mock.jsx:11`, `Papers.jsx`, quick prompts, timer) | Each section keeps its own unit, and each starts on the first unit (EAR 307). Moving from Today to a section carries the unit to that one section only. | Studying EMM 318 means choosing EMM 318 again in every section you open. | One "current unit" in `App.jsx`, passed down. Any picker changes it, and Today sets it when you start a task. | M |
| H5 | `web/src/Today.jsx:1`, `server/plan.js:54-69`, `Analysis.jsx:111` | Tasks like "Solve 3 timed exam questions on Shafts" and the Weakspots "practice" action open **Mock**, which builds AI-written questions. "Do the most recent past paper" opens the **Papers** score form, not the paper. | The real past-paper questions and checkpoint feedback (Phase 8) are never part of the daily loop. | Route these to Practice, with a past-paper question on that topic picked (most recent year first). Add `practice` to Today's section map. | S–M |
| H6 | `web/src/Mock.jsx:44` | Time allowed is 2 minutes per question, whatever its marks. A predicted mock of 5 past-paper questions worth 10–20 marks each gets 10 minutes. | The timed mock doesn't feel like a CAT, so its score means little. | Base the time on marks: about 1.5 minutes per mark (a 30-mark CAT in about 45 minutes), shown before you start. | S |
| H7 | `server/plan.js:110`, `server/bot.js:218-223`, `Progress.jsx` | Streak, "active today" and Progress count sessions, teach-backs, mocks and logged papers. Checkpoint attempts and sub-topic audits don't count. | After an evening of checking answers, the 20:30 DM still says "Nothing logged today", and Progress shows no sign of it. | Add `attempts` and audit times to the active-day set. Add a "Checks this week / broken steps" tile in Progress. | S |

### Medium

| # | Where | What's wrong | Fix | Size |
|---|---|---|---|---|
| M1 | `server/context-pack.js:66`, `server/index.js:162` | The pack's "Where my working broke" section reads `f.question` and `f.checkpoint`. Attempts don't have those fields (the question text lives on the past-paper row, the step lives in `checkpoints[brokeAt-1]`). It prints "a question — broke at checkpoint 2". | Fill both fields when building the pack. | S |
| M2 | `server/index.js:261,303` | With an AI key, a predicted mock is marked against the placeholder answer "No model answer in your library…". | Use the question's saved key from Check my answer (`paperq.key`) when there is one. Otherwise go to self-marking. | S |
| M3 | `Units.jsx:95-110`, `Predictions.jsx:65-66` | Sync, Read papers and Map topics are three separate clicks in two sections, repeated per unit. Mapping took 2 minutes for one unit. | Read the papers automatically after a sync. Keep "Map topics with AI" as a button. | S |
| M4 | `Units.jsx:226` | Clicking a topic chip cycles a manual colour override (auto → green → amber → red). The "why" text is a hover tooltip only, which doesn't work by keyboard or touch. | Clicking opens a small panel with the why and next step, plus an explicit "Override colour" select. | S |
| M5 | `Mock.jsx:166`, `Papers.jsx:59` | Deleting a past mock or a logged paper is instant with no undo. Topics, hints and sub-topics all get an undo toast. | Use the same undo toast (`notify(text, undo)` in `App.jsx`). | S |
| M6 | `CheckIn.jsx:11`, `server/insights.js` | Every focus session asks focus 1–5, activity and energy. `insights.js` (which would read them) isn't imported anywhere. | Cut the check-in to a single "Save", or show its patterns in Progress. Recommended: cut it. | S |
| M7 | `server/ai.js:21,86`, `Practice.jsx`, `Predictions.jsx` | AI waits run long: check about 75s, map about 2 min, suggest about 19s. A call can retry 3 times with 30s timeouts. The UI shows only "Checking…" or "Mapping…". | Show elapsed seconds and "this can take a minute". Lower the retry to one before failing over. | S |
| M8 | 22 of 87 form fields | No label or `aria-label`, only placeholder text: the topic boxes in Units, Notes (3), Teach (3), the Mock name, the Papers form (4) and Quick prompts (2). | Add `aria-label`s, matching the sections that already have them. | S |
| M9 | `GUIDE.md:35,50-52,68,82,86` | The guide still describes Recall flashcards, `quiz` and `card` DMs, and mastery by recall reviews. | Rewrite it to match what shipped. This is already planned as Phase 11. | M |
| M10 | `server/predict.js` `byMarks` | In an unnumbered paper, each "(5 marks)" part counts as its own question, and a paper printed twice (groups A and B) counts twice. ECU 300 shows 24 "questions" from 2 CATs. | Group lettered parts a)–f) under one question, and drop identical question text within one file. | S |
| M11 | Units, Predict, Papers, Notes, Mock | There are three past-paper places: Units → server files, Predict → Past papers, and the Papers section. There are also two question generators (Notes and Mock) beside the real past-paper questions. | See batch F: put the score log next to each paper, fold Notes into Mock as "from my synced notes". | M |

### Low

| # | Where | What | Fix |
|---|---|---|---|
| L1 | `components/CountUp.jsx` (449 lines), `package.json` | The `motion` library is loaded for one animated number in the hero. GSAP is already there. | Replace it with a 10-line GSAP count, and drop `motion`. |
| L2 | `server/insights.js` + `insights.test.js` (224 lines) | Superseded by Phase 6 and never imported. | Delete after you OK it. |
| L3 | `package.json:5`, `Mock.jsx:8`, `index.js:2,291` | Stale text: "recall cards", "With an Anthropic key". | Update the wording. |
| L4 | Practice nav vs heading, Prompt Builder spelling | The nav says "Practice", the heading says "Check my answer", and Weakspots says "(Practice)". It's spelled "Prompt builder" in some places and "Prompt Builder" in others. | Pick one name for each. |
| L5 | `Hero.jsx:54`, `Units.jsx:245`, `Mock.jsx:110`, `Notes.jsx:37-38` | Long dashes inside interface sentences, unlike the rest of the copy. | Replace with a colon or a full stop. |
| L6 | `Progress.jsx:69,86` | "Questions banked" counts only AI-made questions. The legend says "rate topics in Units". | Count past-paper questions too, and point the legend at Weakspots. |
| L7 | Weakspots topic header (screenshot `1280-dark-05-analysis.png`) | "Open in Prompt Builder" floats in the middle of the row. | Align it with the chip. |
| L8 | `setup.js` | Asks only for a Discord ID and an Anthropic key. You use Gemini and DeepSeek. | Ask for whichever provider's key is in use, and check it once. |

## Four everyday tasks, click by click

**1. Morning: open the app, then Today, then task 1.** Today's first task for EMM 318 is "Do the most recent past paper or CAT, timed →". The button scrolls to Papers, which only logs a score. To open the paper itself you need Units → EMM 318 → show server files, then the link, which opens Discord. That's about 5 clicks across two sections, and it ends in the browser, not the app. *Dead end:* the task doesn't open what it names (H5).

**2. "The lecturer said focus on couplings."** Predict → change the unit from EAR 307 to EMM 318 → type → Save hint: 3 clicks. The topic is tagged from the wording, and it pins to #1 straight away (`1280-light-04-predictions.png`). *Dead end:* in Weakspots and Today the hint changes nothing until the topic has sub-topics, because priority is exam weight × sub-topic weakness.

**3. "I did a past-paper question."** Predict → pick the unit → show questions → Check my answer → type the answer → Check (wait up to about 75s) → Broke here → Save: about 8 clicks plus the wait. Then Weakspots opens on EAR 307 again, so you pick EMM 318 to see the result (H4). *Dead end:* with no sub-topics, the mistake reaches only the error breakdown, not the "fix first" list.

**4. "I need heavy help."** Weakspots → a critical row → Open in Prompt Builder (it builds straight away) → Copy → Download: 4 clicks, and it works with no AI key. The most finished flow in the app.

## Fix batches (pick any)

| Batch | Contents | Size | Order |
|---|---|---|---|
| **A. Quick wins** | H2 nav, H3 squashed fields, H6 mock timer, H7 streak and nudge, M5 undo, M8 labels, L3–L5 copy | about half a day | 1 |
| **B. Dates under the strike** | H1 TBA banner, Exams tile, tour copy | S | 2 |
| **C. Topics from your outline** | B2 suggest topics, M3 read papers after sync, M10 paper parts | M | 3 |
| **D. Join up Phase 8** | H5 Today and Weakspots → Check my answer, M1 pack fields, M2 predicted-mock marking, M7 wait feedback | M | 4 |
| **E. One current unit** | H4 | M | 5 |
| **F. Simplify** | M4 chip panel, M6 cut check-in, M11 merge Papers and Notes, L1 CountUp, L2 insights.js, L6–L7 | M | 6 |
| **G. Docs** | M9 GUIDE.md, L8 setup.js (could join Phase 11) | M | 7 |

B1 (restart `start.bat`) needs no code. Do it first.

Each batch would be its own commit on `study-dashboard`, run through `npm.cmd test` and `npx.cmd vite build`.

## Coverage

**Views (15):** Top bar, Hero, Checklist, Today, Units (picker, sync, library, unit card), Predict, Weakspots, Practice, Notes, Teach, Mock, Papers, Prompt (pack and quick prompts), Progress, Timer with check-in, Tour. All read in full and screenshotted, except the tour and check-in (code only).

**API routes (25 + generic lists):** `GET state, catalog, library, weakspots, predict` · `POST library/ingest, teach, subtopics, subtopics/audit, subtopics/suggest, pack, attempts/check, attempts/checkpoints, attempts/broke, attempts/flag, predict/parse, predict/paste, predict/map, hints, settings, notes, mocks, prompt, dm-today` · `PUT units` · `PATCH units` · `POST mocks/<id>/submit` · generic `POST/PATCH/DELETE` for topics, sessions, papers, teach, questions, mocks, subtopics, hints, paperq. Findings: H5, H6, H7, M1, M2, M3, M5, M7, M10.

**Bot commands:** `today, files, teach, log, paper, predict, hint, weakspots, help, stop`, plus the 07:00 plan and the 20:30 nudge. Finding: H7.
