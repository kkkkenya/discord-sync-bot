# Study Desk — User Guide

A personal study tool for understanding engineering (built for KU Mechanical Engineering, but the ideas work anywhere).
It lives on your own laptop at `http://localhost:5190`, and a Discord bot DMs only you. Nothing is shared or hosted.

---

## 1. Quick start

1. **Node.js** — install the LTS version from nodejs.org if you don't have it.
2. **`setup.bat`** (once) — asks for your Discord user ID (Developer Mode on → right-click your name → Copy User ID) so the bot can DM you, and confirms the AI provider (Gemini by default — your key is found automatically). This is optional: skip it and you just won't get DMs.
3. **`start.bat`** — builds and starts the dashboard, then opens your browser. If it stops it restarts itself; close the black window to fully quit.
4. **Shortcut** (optional) — run `powershell -File make-shortcut.ps1` once to get a "Study Desk" shortcut on your desktop/Start menu, then right-click → Pin to taskbar.

The keys it needs (Discord, Supabase, Gemini) are already saved in the repo — you don't type any.

---

## 2. First open (2 minutes)

1. **Units** → *Edit units* → tick the units you're taking, and set each unit's CAT date if you know it.
2. For each unit, type its **topic list** (comma-separated), e.g. *"stress & strain, Mohr's circle, bending, torsion, columns"*. Topics start **red**.
3. On each unit, click **Sync files** to pull that unit's notes and past papers in from the server, so the AI can be grounded in *your* material.

That's it — the plan now generates itself.

---

## 3. The daily loop

The whole app runs on one idea: **you don't know a thing until you can pull it from memory and explain it.**

1. **Today** shows your 3 weakest, soonest units, each with one concrete action. Click the action and it deep-links you to the right section.
2. **Study with the focus timer** (bottom-right, 25 or 50 min). It logs your time automatically.
3. **Recall** — answer due cards from memory, then grade honestly: *Forgot / Hard / Good / Easy*.
4. **Teach it back** — explain a topic out loud as if teaching a classmate; the AI marks it and turns your gaps into new cards.
5. **Mock** — a timed, closed-book paper. Marked automatically, or self-marked against model answers.
6. **Papers** — log past-paper scores to see your average per unit.

Do it in the **morning** (your 5am block) and a shorter pass in the evening.

---

## 4. The sections

| Section | What it does |
|---|---|
| **Today** | Countdown to the next CAT/exam + the 3 highest-priority tasks, weakest × soonest first. |
| **Units** | Your units, CAT dates, a 1–5 readiness rating, and the topic list. Each unit shows a **coverage bar** and "next to turn green". |
| **Notes** | Paste lecture notes / textbook / slides → the AI turns them into recall cards + CAT questions, grounded in your synced files. |
| **Recall** | Spaced-repetition flashcards. You type the answer *before* seeing it, then grade 1–4. Nothing is ever scheduled after a unit's CAT. |
| **Teach** | The Feynman technique. Explain a topic; the AI scores it 1–5, lists the gaps, and offers follow-up cards. |
| **Mock** | A timed, closed-book exam built from your question bank (and your material). Auto-marked with an AI key, else self-marked. |
| **Papers** | Log past-paper/CAT scores; per-unit average and "study this week". |
| **Prompt** | Build a copy-paste prompt to run in ChatGPT/Gemini/DeepSeek, grounded in your synced material. |
| **Progress** | Study time (7 days), paper-score trend, mock average, and per-unit topic coverage. |
| **Timer** | The floating 25/50-min focus timer, bottom-right. |
| **AI: Gemini ▾** (top bar) | Switch the AI provider for all AI features (Gemini / DeepSeek / Claude). |

---

## 5. How "mastery" works (the colours)

A topic's colour is **computed from evidence**, not your gut:

- **Green** — all three are true:
  1. a teach-back scored **4/5 or better**,
  2. **≥ 85%** of its recall reviews in the last 14 days were "good/easy" (min 6 reviews),
  3. **≥ 2** exam questions solved with **≥ 70%** marks.
- **Amber** — at least one is true.
- **Red** — none.

Hover any topic chip to see the exact breakdown and what's missing. You can force a colour by clicking (it shows **"· you"**), but that's marked as your override, not evidence.

---

## 6. Discord DMs

Once `setup.bat` has your user ID, the bot DMs you a plan at **07:00** and a nudge at **20:30** (Nairobi time) if you've done nothing. DM it any of:

- `today` — your plan and the CAT countdown
- `quiz` or `quiz EMM 302` — drill due cards
- `teach EMM 302 Mohr's circle` — get a teach-back marked
- `log 45 EMM 302` — log 45 minutes
- `paper EMM 302 34/60 2023 CAT 1` — log a paper score
- `card EMM 302 | question | answer` — add a card
- `files EMM 302` — list a unit's past papers/CATs
- `help` — all commands

---

## 7. Your data and backups

- Everything lives in **`study\data\`**:
  - `study.json` — units, topics, cards, reviews, papers, mocks, sessions, settings.
  - `library.json` — the extracted text of files you synced from Discord.
- It saves on every action, and survives restarts and reboots.
- **Back up**: copy the `study\data\` folder. **Don't delete it.**
- It's all local — no account, no cloud.

---

## 8. FAQ

- **"No AI key" / AI features off?** Pick another provider in the top bar, or run `setup.bat`. Gemini works out of the box.
- **A file synced with "no text (scanned)"?** It's an image-only PDF; there's no text to read. Paste the questions yourself in **Notes** for now.
- **Discord DMs not arriving?** Run `setup.bat` and make sure your user ID is right, and that you allow DMs from the server.
- **"Solid and structural mechanics" not in the list?** That's **EMM 302 Strength of Materials** — same subject, official name.
- **Can I study from my phone?** The dashboard is laptop-only, but the DMs (`quiz`, `teach`, `today`) work from your phone.
