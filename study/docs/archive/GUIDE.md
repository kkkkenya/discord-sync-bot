# Study Desk: user guide

A study tool for KU engineering units. It runs on your own laptop at `http://localhost:5190`, and the Study Hub bot DMs only you. Nothing is hosted or shared.

The idea behind it: practise on real past-paper questions, closed book, then find the exact step where your working broke. That step, and the kind of mistake it was, is what you study next.

---

## 1. Quick start

1. **Node.js**: install the LTS version from nodejs.org if you don't have it.
2. **`setup.bat`** (once): asks for your Discord user ID (Developer Mode on, then right-click your name → Copy User ID), the dashboard port, and your AI provider. Only the chosen provider's key is asked for, hidden as you type, and each key is checked once. A Gemini key already in `community/.env` is used as it is. Press Enter to keep a saved value.
3. **`start.bat`**: builds and starts the dashboard and opens your browser. After an update, close its window and run it again so the new version is what you see.
4. **Shortcut** (optional): run `powershell -File make-shortcut.ps1` once for a "Study Desk" shortcut you can pin to the taskbar.

---

## 2. First open (about 5 minutes)

1. **Plan → Units → Edit units**: pick your course, year and semester, then tick the units you're sitting.
2. **Dates**: give each unit its CAT or exam date. If the strike has made dates uncertain, tick **TBA** (or use **Mark them TBA** in the note at the top of the page). A unit with no date counts down to the KU calendar.
3. **Sync all files** (in Units): pulls every unit's notes and past papers from the Study Hub, then reads the past papers into questions for Predict.
4. **Suggest topics** on each unit: the AI reads the synced course outline and the past-paper questions and suggests the unit's topics, each marked with where it came from. Add the ones your course covers, or type your own.

After that, Today plans itself.

**Tutorial quests.** The first time you open it, a small panel at the bottom left gives you one quest at a time, like a game tutorial: "Hover over a group in the top bar", "Press Sync all files", "Check an answer". A ring shows what to press, **Show me** takes you there, and each quest completes by itself once you have done it (with XP and a rank, Trainee to Chartered Engineer). Anything you have already done counts straight away. Skip any quest, or hide the panel with ×; Settings brings it back.

---

## 3. Getting around

The page has four bands, in the order a study day runs: **Today**, **Plan**, **Practise** and **Review**.

- **Top bar**: hover a group (or tap **Menu** on a phone) to see its sections and what's inside each one. The bar turns to frosted glass once you scroll.
- **Current unit** (top right): every section follows it. Change it there or in any section's unit picker; opening a task or a weakspot sets it too.
- **Settings** (the sliders icon): study stage for all units, AI provider, and the tutorial quests.
- **Focus timer** (bottom right): 25 or 50 minutes on the current unit. A session of a minute or more is logged when it ends or you stop it.

---

## 4. The sections

| Band | Section | What it does |
|---|---|---|
| Today | **Overview** | Days to the next CAT, the study stage of each unit, streak, hours this week. |
| Today | **Today's plan** | Up to 3 tasks, weakest and soonest unit first, shaped by each unit's stage. A task opens the section it needs, often Check answer on a real past-paper question. |
| Plan | **Units** | Dates or TBA, stage, topics and their colours, the unit's server files, sync. Click a topic chip to see why it has its colour and what's missing. |
| Plan | **Predict** | Topics ranked by exam weight (how often they come up × their marks × what the lecturer said), the lecturer's hints, and the past-paper questions under each topic. **Map topics with AI** places questions the wording alone couldn't. |
| Plan | **Weakspots** | Each topic broken into sub-topics you rate solid, shaky or stuck. **Fix first** ranks sub-topics by exam weight × weakness; **How you lose marks** counts your mistake types. |
| Practise | **Study kit** | Practice made for the unit's stage. Adequate Prep: a ladder (a worked example, the same method with steps to fill in, then one on your own) plus teach-back prompts. 1-Week Mode: solving recipes for the likely topics (how to spot the question type, the steps, a shortcut, the trap). Last-Minute and Exam-Eve: a formula and shortcut sheet (symbols and SI units, when each formula does NOT apply) with your own recurring mistakes as the first warnings, printable on one A4 page. Everything made is saved and can be edited in place. |
| Practise | **Check answer** | Type a final answer with its unit. A right answer is accepted in any unit (0.1425 GPa = 142.5 MPa). A wrong one shows numbered checkpoints: tap **Broke here** on the step where your working went wrong. Or press **Check a photo of my working**: the AI reads your final answer and steps off the photo, checks it the same way, and opens Broke here on the step where your working seems to go wrong, for you to confirm. |
| Practise | **Teach it back** | Explain a topic as if to a classmate, typed or out loud (**Say it out loud instead**, up to 4 minutes). The AI scores it out of 5 and names the gaps; a gap can become a shaky sub-topic in one click. You see what it heard. |
| Practise | **Mock exam** | Timed and closed book, at 1.5 minutes a mark. A predicted mock is built from the most likely past-paper questions. **Add questions from your own notes** (inside Mock) turns pasted notes into CAT questions for the bank. |
| Practise | **Past papers** | Log a paper's score; average per unit. |
| Review | **Prompt Builder** | A Master Prompt and a `.md` context pack (your weakspots, hints, past questions, synced notes) to use in Claude, ChatGPT or DeepSeek. No AI key needed. |
| Review | **Progress** | Study time for 7 days, answers checked, paper scores, syllabus coverage. |

---

## 5. Study stages

Each unit's stage comes from its date, and Today shapes its tasks to it:

| Stage | When | Focus |
|---|---|---|
| Adequate Prep | over a week away, or date TBA | fundamentals, derivations, assumptions, full sub-topic mastery |
| 1-Week Mode | 3-7 days | high-yield predicted topics, standard methods, shortcuts |
| Last-Minute Mode | 24-72 hours | formula and shortcut sheets, unit and symbol checks, your highest-risk weakspots |
| Exam-Eve Triage | under 24 hours | the top 1-2 predicted questions, lecturer-pinned topics, a 1-page survival sheet |

You can set a unit's stage yourself in Units, or every unit's stage in Settings.

---

## 6. How checking an answer works

1. Pick a past-paper question (or paste one) and type your final answer, for example `142.5 MPa`.
2. The answer key comes from, in order: a key you type, a key saved earlier, the marking scheme in your synced files, or an AI solve. An AI-solved key is labelled **AI-solved: verify**.
3. If your answer doesn't match, you get up to 6 numbered checkpoints. Find the first one your paper disagrees with and tap **Broke here**, then pick the sub-topic and the kind of mistake (sign convention, units, algebra, wrong equation, concept gap and so on).
4. That mark is the only thing held against you. If a checkpoint looks wrong, tap **This checkpoint looks wrong**: nothing counts, and an AI key is thrown away so the next try solves again.

Slow AI calls show a seconds counter. Checking can take a minute when the AI has to solve the question first.

---

## 7. How the topic colours work

A topic's colour comes from the **Breakpoint model** (the full method is in `UNDERSTANDING.md`). It treats understanding as a chain with three links: **why it works**, **setting it up** and **carrying it through**. Every teach-back, checked answer, mock answer and self-rating counts as evidence on those links:

- **Where your working broke matters.** If you mark a break at step 3, steps 1 and 2 count for you, step 3 counts against the one link your mistake belongs to (a units slip is "carrying it through"; a wrong governing equation is "why it works"), and the steps you never reached count neither way.
- **New questions count more than repeats.** Solving the same question again proves less than solving a new one. Breaking on it again is never discounted.
- **Hard questions count more when you get them right; easy ones count more when you get them wrong.**
- **It fades.** Evidence you don't refresh fades, and more slowly the more spaced practice you've done.
- **Your own ratings count as far as they've proved accurate.**

The colour is the weakest link, judged on the level the model is 90% sure you're above:

- **Green**: that floor is 60 or more. A teach-back and about 4 different past-paper questions solved over two weeks gets there; one lucky answer doesn't.
- **Red**: nothing tried yet, or understanding under 40.
- **Amber**: in between.

Click a chip to see the three links as bars, the weakest one in red, how long it lasts without practice, and the next step. You can override the colour there; it then shows **"· you"**.

---

## 8. Discord DMs

With your user ID set, the bot DMs you the day's plan at **07:00** and, if nothing was logged that day, a nudge at **20:30** (Nairobi time) shaped by your most urgent unit: the night before a paper it points you at your formula sheet and one question. Checked answers, sub-topic ratings, teach-backs, mocks, papers and timer sessions all count as studying. DM it any of:

- `today`: your plan, the countdown, and how many units are TBA
- `predict EMM 302`: the topics most likely to come
- `hint EMM 302 exam will mainly focus on beta functions`: save what the lecturer said
- `weakspots EMM 302`: your highest-risk sub-topics and the mistakes you keep making
- `mark EMM 302`: a past-paper question to try, picked from your weakspots. Solve it on paper, then:
  - `mark 142.5 MPa`: checks your final answer (any unit). A wrong one lists the checkpoints.
  - `mark broke 2` (or `mark broke 2 units`): the checkpoint where your working broke, and the kind of mistake.
  - `mark dispute`: a checkpoint looks wrong to you; nothing is held against you.
  - Or send a **photo of your working** with `mark` (after `mark EMM 302`), or with the question named: `mark EMM 302 2023 Exam Q3`. It is read, checked, and the bot suggests where it broke for you to confirm.
- `teach EMM 302 Mohr's circle`: explain a topic and get it marked (`stop` ends it). Send your explanation as text or as a **voice message**.
- `files EMM 302`: past papers and CATs for a unit (`files EMM 302 notes` for notes and slides)
- `log 45 EMM 302`: log 45 minutes
- `paper EMM 302 34/60 2023 CAT 1`: log a paper score
- `help`: all commands

---

## 9. Your data

- Everything lives in **`study\data\`**: `study.json` (units, topics, sub-topics, past-paper questions, checked answers, hints, mocks, papers, sessions, settings) and `library.json` (the text of files you synced).
- It saves on every action. Before a new version changes the file, a copy goes to `data\backups\`.
- **Back up** by copying the `study\data\` folder. Don't delete it.

---

## 10. FAQ

- **AI features off?** Open Settings in the top bar and pick a provider that has a key, or run `setup.bat`.
- **Photos and speaking?** Gemini reads photos and listens to recordings; Claude reads photos only; DeepSeek does neither. The buttons say so when the chosen AI can't. Photos and recordings are kept in `data/uploads/` and sent only to the AI you chose.
- **A file synced as "no text (scanned)"?** It's an image-only PDF. Paste its questions in Predict → *Paste a paper's questions*, or attach the file in the Prompt Builder.
- **The countdown uses a date I don't trust?** Tick TBA on the unit, or use **Mark them TBA** at the top of the page.
- **DMs not arriving?** Run `setup.bat`, check your user ID, and allow DMs from the Study Hub server.
- **On a phone?** The dashboard runs on your laptop only. The DMs work from your phone.
