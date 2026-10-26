# Build prompt: Study Desk, from "I remember it" to "I understand it and can teach it"

Paste everything below the line into DeepSeek (or any coding model) at the start of a session.
Paste it again at the start of each new session. It is long on purpose: it tells the model who you are,
what is already built, what "understanding" means for you, and the rules for changing your code.

---

## 1. Who I am and what I need

I'm a 3rd-year Mechanical Engineering student at Kenyatta University (KU), Year 3 Semester 1 (3.1).
My 2nd CATs are 2–6 November 2026 and my end-of-semester exams start 30 November 2026.

My goal is to **understand** what I'm learning, well enough to:
1. solve a CAT question I have never seen before
2. explain *why* each step works: where an equation comes from, what each term means, and when it stops applying
3. teach the topic to a classmate who missed the lecture, and answer their follow-up questions.

You are helping me build my personal study tool, called **Study Desk**. It's a small web dashboard on my
own laptop, plus a Discord bot that DMs only me. Your job is to make it the best possible tool for
*understanding* engineering. Tracking hours is the easy part. Every feature should check or deepen what I understand.

**Studying comes before building.** My CATs are days away. Each feature must be small enough to finish,
test and commit in one short session. If a request would take longer, split it and tell me the smallest
useful first piece. Never leave the app broken at the end of a session.

## 2. Before you write any code, ask me these questions

Ask them all in one message, wait for my answers, then write a short plan. Don't code before I agree.

1. Which units am I taking in 3.1, and what is the CAT date for each one if I know it?
2. For each unit, what does the lecturer usually ask in CATs: derivations, numericals, definitions, sketches? How many marks and how long?
3. Which 3 topics feel weakest right now, and why? (Lost in the maths? Don't get the physics? Mix up formulas?)
4. How much time can I study on a normal day, and when (morning, evening, between classes)?
5. Do I study more on my laptop or my phone? (The dashboard runs on my laptop. Discord works on both.)
6. Do I have an AI API key, and which one: Anthropic (Claude), DeepSeek, or neither?

## 3. What already exists (read the code before changing it)

Everything is in `study/` inside my bot repo `C:\Users\grego\Downloads\discord-sync-bot`, on the git branch
`study-dashboard`. Read these files first. Don't guess how they work.

| File | What it does |
|---|---|
| `study/server/index.js` | Node `http` server on `127.0.0.1:5190`: JSON API under `/api/*`, serves the built dashboard from `study/dist/`. Generic list routes: `POST /api/<list>`, `PATCH /api/<list>/<id>`, `DELETE /api/<list>/<id>`. |
| `study/server/store.js` | All my data in one JSON file, `study/data/study.json` (git-ignored). Lists: `units, topics, cards, reviews, sessions, papers, teach, questions, mocks`. The shape of each is in the comment at the top. |
| `study/server/plan.js` | Recall scheduling (SM-2 style: grades 1 forgot, 2 hard, 3 good, 4 easy. No review is ever scheduled after the unit's CAT), the daily plan (3 units, weakest and soonest first) and stats (minutes, streak). |
| `study/server/library.js` | Unit list from `lib/units.json`, the KU calendar from `lib/config.js` (`CALENDAR`), and the unit's files from the bot's Supabase `files` table (past papers, CATs and notes the uploader posted to Discord). |
| `study/server/bot.js` | DM-only Discord connection, answers only `OWNER_ID`. Commands: `today, files, quiz, teach, log, paper, card, stop, help`. 07:00 plan DM, 20:30 nudge. Plain typed replies only: **buttons and slash commands go to Vercel, not here.** |
| `study/server/coach.js` | Marks a teach-back (score 1–5, gaps, follow-up question, cards for the gaps). |
| `study/server/ai.js`, `brain.js` | Shared AI helper (`structured(schema, system, content)`) plus notes → cards and questions, generating mock questions, marking a mock. |
| `study/web/src/*.jsx` | React dashboard: Hero (countdown), Today, Units, Notes, Recall, Teach, Mock, Papers, Progress, Timer. GSAP and Lenis for motion, plain CSS in `styles.css` with light and dark colour tokens. |
| `study/setup.js` / `setup.bat` | Asks for my Discord user ID and an optional AI key (hidden input), checks them, writes `study/.env`. |
| `study/start.bat`, `make-shortcut.ps1` | The **Study Desk** shortcut: builds the dashboard and runs the server minimised. If it's already running, it just opens the browser. |

The rest of the repo is my **community** Discord bot (Engineering Study Hub): `api/` and `lib/` run on
Vercel, `pc/` runs on my PC. **Don't change anything outside `study/`** unless I ask. The Study Desk only
*reads* `lib/units.json`, `lib/config.js` and the Supabase `files` table. It never writes to Supabase
or posts in the server.

## 4. What "understanding" means here: build around these, in this order

Each idea below is a feature request. Each has a **"done when"** check. Build them one at a time, in this order unless I say otherwise.

### 4.1 Mastery is earned, not ticked (highest priority)
Right now I set a topic to red, amber or green by hand, which means I can fool myself. Make the status follow evidence:
- **Green** only when all three are true:
  - a teach-back on that topic scored 4/5 or better,
  - at least 85% of that topic's recall reviews in the last 14 days were "good" or "easy" (minimum 6 reviews),
  - at least 2 exam-style questions on that topic were solved in a mock or past paper with 70% or more of the marks.
- **Amber** when at least one of those is true.
- **Red** otherwise.
- Cards and questions need a `topic` field so this can be counted. Existing cards without a topic count only for the unit.
- Show *why* a topic has its colour: "Teach-back 3/5 (needs 4) · recall 91% · 1 of 2 questions".
- Keep a manual override, but show it as "marked green by you" so I can tell the difference.

**Done when:** a topic I've never been tested on can't show green, and the dashboard tells me the exact next step to make it green.

### 4.2 Confidence before the answer (calibration)
Before revealing a recall card or a mock answer, ask "How sure are you?" (guessing / fairly sure / certain).
Record it with the grade. On Progress, show my **calibration**: how often I was right when I said "certain".
If I'm certain and wrong more than 20% of the time on a topic, flag it as a "false confidence" topic. These go in the daily plan before topics I know are weak.

**Done when:** after 20 reviews, Progress shows calibration per unit, and false-confidence topics come first in Today.

### 4.3 "Why" cards alongside "what" cards
Engineering understanding is mostly *why* and *when*. When cards are generated (Notes, teach-back gaps), make
at least half of them one of these types, and store the type on the card:
- **why**: "Why does the bending stress formula assume plane sections remain plane?"
- **when-not**: "When does Bernoulli's equation NOT apply? Give two conditions."
- **derive**: "Derive the torsion equation T/J = τ/r starting from shear strain." (graded against the key steps, not the final line)
- **units**: "Check the units of σ = My/I." (dimensional analysis)
- **trap**: a common mistake: "A student uses diameter instead of radius in τ = Tr/J. What happens to the answer?"
- **what**: plain fact or formula (allowed, but no more than half).

In Recall, let me filter by type, so on a given day I can drill only "derive" or "when-not" cards.

**Done when:** generated sets have a mix of types, and I can filter Recall by type.

### 4.4 My mistake log (error notebook)
Every time I lose marks (a mock, a past paper, a card I forgot), let me log *why* in one tap:
**concept** (didn't understand the idea), **method** (knew the idea, wrong approach), **maths/algebra slip**,
**units/conversion**, **misread the question**, **ran out of time**, **forgot a formula**.
- Mock marking should suggest the category for each lost mark. I confirm or change it.
- Progress shows the counts per unit, plus the trend over the last 3 weeks.
- The daily plan uses it:
  - lots of "concept" mistakes → a teach-back
  - "maths slip" → timed drill questions
  - "forgot formula" → formula cards
  - "ran out of time" → a timed mock
- Each mistake can be turned into a card with one click ("trap" type).

**Done when:** after a marked mock I can categorise each lost mark in under a minute, and Today changes because of it.

### 4.5 Past papers become a topic map (what actually gets asked)
The server already has past papers and CATs for my units (`library.js` → Supabase `files`. Open them via the
Discord link). Add: "Analyse this paper" for a PDF, which:
- downloads the attachment through the Discord message link, using the bot token from `pc/.env` (for reference, the PC bot reads PDF text with `pdfjs-dist` in `pc/src/uploader/extract.js`). Scanned papers may have no text: say so clearly and let me paste the questions instead
- splits it into questions with their marks and maps each to one of my topics (or suggests a new topic)
- saves them to the `questions` bank, tagged with the paper and year.

Then show, for each unit, a **topic frequency table**: how often each topic appeared, and its average marks.
The daily plan's priority becomes roughly *(how often it's asked × marks) × (how weak I am on it) × (how close the CAT is)*.

**Done when:** for EMM 302 I can see which 3 topics carry the most marks across past papers, and Today reflects it.

### 4.6 Worked example → faded → on my own
For a numerical topic, generate a 3-step ladder:
1. a **fully worked example**: every step written out, with the reason for each step
2. the **same type of problem with different numbers**, with some steps blanked out for me to fill in
3. a **fresh problem** I solve alone, marked step by step (method marks as well as the final answer).

I move up a level only after passing the one before. Steps I get wrong become "trap" cards.

**Done when:** I can run the ladder for one topic (e.g. Mohr's circle) from start to finish on the dashboard.

### 4.7 Photo of my handwritten working
Most of my working is on paper. Let me upload a photo (on the dashboard, or as an image attachment in my
Discord DM with the bot) of a solved question. The AI reads it, marks it against the model answer step by
step, names the first wrong step, and logs any lost marks in the mistake log. The model must support image
input. If the one in use doesn't, say so plainly instead of guessing.

**Done when:** I DM a photo of a solution with `mark EMM 302 Q3` and get step-by-step marks back.

### 4.8 Teach mode for real people
I want to be able to teach classmates. From a teach-back that scored 4/5 or better, generate:
- a **one-page explainer** in my own words (cleaned up, not rewritten): definition, key equation and every term,
  when it applies, one worked example, 3 common mistakes
- **3 check questions** to ask the people I'm teaching, with answers
- a **5-minute lesson outline** (what to say first, what to draw, which question to ask).

Show it so I can copy it or download it as Markdown. **Never post anything to the Discord server
automatically.** If I want to share it, I'll paste it myself.

**Done when:** I can produce a teachable one-pager for any topic I've mastered.

### 4.9 Blank-page brain dump
For a topic, give me a timer (5 minutes) and an empty box: "Write everything you know about X." Then compare it
with the topic's cards, questions and teach-back, and list what I left out, ranked by how often it shows up
in past papers. The missed items become cards.

**Done when:** a 5-minute dump on a topic gives me a ranked list of what I forgot.

### 4.10 Interleaved practice
In Recall and Mock, add a "mixed" mode that rotates between my units and topics instead of drilling one at a time
(practising them mixed is harder, and it's what the exam does). Default the morning DM `quiz` to mixed.

### 4.11 Weekly review DM (Sunday 18:00 Nairobi)
One message: minutes per unit, topics that turned green this week, false-confidence topics, top 3 mistake
categories, mock or paper scores vs last week, and the 3 things to fix next week. Under 1,500 characters.
End with: "Reply with how you'd rate your week (1–5) and one thing you'll change." Save my reply.

### 4.12 Formula sheet per unit
Build it automatically from "what" and "derive" cards plus the questions bank: every formula with what each
symbol means, its units, and when it doesn't apply. Printable (a clean print stylesheet). If a formula has no
"when-not" card yet, flag it.

## 5. Rules for changing my code

**Read before writing.** Open every file you'll touch, and the files that call into it. Match the existing
style: ES modules, 2-space indents, single quotes, small functions, short comments that say *why*, plain CSS
using the colour tokens in `:root`. Don't add TypeScript, Tailwind, a database, a UI kit or a router.

**Keep it small.** No new dependency unless it saves a lot of code. Tell me what it is and why first.
Prefer extending the existing JSON store and the generic list routes over new systems. When you change the
shape of data in `study.json`, old data must still load: give missing fields sensible defaults, and never delete my data.

**AI calls.**
- Every AI call goes through `study/server/ai.js`. The code currently uses Claude through the Anthropic SDK.
  If I'm using DeepSeek instead, add a provider switch in `ai.js` (env `AI_PROVIDER=anthropic|deepseek`), using DeepSeek's
  OpenAI-compatible API (`https://api.deepseek.com`, model name from env `AI_MODEL`). Keep the same
  `structured(schema, system, content)` signature, so nothing else changes. DeepSeek's JSON mode doesn't
  enforce a schema: validate the result yourself and retry once with the validation error if it's wrong.
- Check what the provider actually supports (image input, JSON output) before building a feature on it.
  If it's missing, the feature says so in the UI instead of failing silently.
- Every AI feature must still work in a reduced way without a key (self-marking, model answers shown, cards typed by hand).
- Prompts must ask for KU-CAT-level technical precision: exact equations, sign conventions, assumptions, units.
- Generated cards and questions are **suggestions**: show them for me to keep, edit or drop before they go into Recall.
  Cards I write or edit myself help me learn more than ones I just accept.

**Secrets.**
- Never ask me to paste a key into the chat, never hardcode one, never commit one.
- New keys go in `study/setup.js`: hidden input, "Enter keeps the current value", a live check of the key
  (one cheap API call) with a clear message if it fails. Add the variable name, with no value, to `study/.env.example`.
- `pc/.env` and `study/.env` are git-ignored. Keep them that way.

**Discord.**
- The study bot answers only `OWNER_ID`, in DMs only. It must never post in server channels.
- No buttons, select menus or slash commands for the study bot: those interactions are delivered to the Vercel half, which
  doesn't know about Study Desk. Use typed commands. Add every new command to `HELP`.
- Messages over 2,000 characters must be split with `chunks()` in `bot.js` (it splits on line breaks so links stay whole).
- Times are Nairobi time (`Africa/Nairobi`).

**Dashboard.**
- Every save that can fail shows the error (the app already shows a banner for unhandled rejections. Use it, don't hide errors).
- Works at phone width (375 px) with no sideways scrolling, and in light and dark mode.
- Animate only `transform` and `opacity`, using `useGSAP` with a scope. Respect `prefers-reduced-motion` (`calm` in `App.jsx`).
- Buttons and inputs need labels a screen reader can read. Keep the visible focus outline.

**Plain language.** All text I read (UI, DMs, errors) is short, direct and specific. Name the next action
("Do one timed EMM 302 paper"), not a vague one ("keep going!"). No emoji walls, no hype words.

## 6. How to work in each session

1. Restate the one feature we're doing and its "done when" check. If anything is unclear, ask first.
2. List the files you'll change and why, in a few lines.
3. Make the change.
4. **Test it yourself before telling me it's done:**
   - `cd study` then `npx vite build`: must succeed with no errors.
   - Start the server (`node server/index.js`) and exercise the new API routes with `curl` or a small script,
     including the error cases (missing fields, no AI key, server data from before the change).
   - For bot commands: call the exported `reply()` from `server/bot.js` in a small Node script (that's how it was tested before), using `node --env-file=../pc/.env`.
   - For learning logic (mastery rules, calibration, scheduling): write a small script with made-up data and check the numbers by hand.
   - Use a **copy** of `study/data/study.json` for tests, or restore it afterwards. Never wipe my real data.
5. Tell me exactly what you tested, what passed, and what you couldn't test (e.g. "couldn't check a real DM").
6. Commit on the `study-dashboard` branch with a short message saying what changed and why. Never commit `.env`, `data/` or `dist/`.
7. End with **one** suggestion for the next feature, and what it would help me with for my CATs.

## 7. What not to build

- No public website, accounts, logins or hosting. This is for me, on localhost.
- No leaderboards or social features in the Study Desk (the community bot already has those).
- No "AI does my homework" mode: the AI asks, marks, explains gaps and generates practice. It doesn't write my answers for me to copy.
- No features that only track time. Every feature should test or deepen understanding.

## 8. Start

Ask me the questions in section 2. After I answer, propose the plan for **4.1 (mastery is earned)** and wait for my go-ahead.
