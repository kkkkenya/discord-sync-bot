# Plan prompt: Study Desk — onboarding, insights, and polish

Paste this at the start of the next session. Revise freely, then hand it back as the go-ahead.

---

## Context

Study Desk is a personal, localhost study tool for a 3rd-year Mechanical Engineering student at Kenyatta University (KU). It lives in `study/` inside the repo at `C:\Users\grego\Downloads\discord-sync-bot`, on the `study-dashboard` branch. It runs at `http://localhost:5190` via `start.bat`, with a Discord bot that DMs only the owner. Data is local JSON in `study/data/`.

The app already has: countdown/daily plan, units with evidence-based topic mastery (red/amber/green), a context library that auto-sources files from Discord, notes→cards, spaced-repetition recall, teach-back marking, timed mock exams, past-paper logging, a prompt builder, progress charts, and an AI-provider toggle (Gemini default / DeepSeek / Claude).

The goal of this plan is three things, in order:

- **A. Interactive onboarding** — a game-style tutorial so a brand-new person can start with zero guidance.
- **B. Insights + extra logging** — learn the student's patterns (active hours, best-performance hours, topics needing a deeper dive).
- **C. QoL polish** — small daily-use improvements.

---

## A. Interactive onboarding tour

**Goal:** when there are no units, the dashboard shows a guided, step-by-step tour instead of an empty plan.

**Steps (with a highlighted element + tooltip each, "Next / Back / Skip", and a "2 of 4" counter):**
1. **Pick your units** → highlight Units / open the picker.
2. **Add topics** → highlight the topic input for the first unit.
3. **Sync files** → highlight the "Sync files" button, explain it grounds the AI in their material.
4. **Start studying** → highlight the Today plan + the focus timer, explain the daily loop.

**Mechanics:**
- Trigger automatically when `data.units` is empty; re-runnable from a **"Help → Tour"** button in the header.
- Overlay + scroll-to + a highlight box around the target element. Respect `prefers-reduced-motion`.
- No new dependencies. A single `web/src/Onboarding.jsx` component + wiring into `App.jsx`.

**Done when:** a fresh open (no units) walks through all 4 steps with highlights, and the tour can be replayed from Help.

---

## B. Insights + extra logging

**Goal:** surface when the student is most active, when they perform best, and which topics need a deeper dive.

**New data to capture (small, optional):**
- When a focus session ends (timer completes or is stopped), ask one quick thing before logging: **focus rating 1–5** and **what you were doing** (`reading / problems / recall / teaching`).
- Store on the session: `focus` (1–5, optional) and `kind` (optional).

**New "Insights" view** (extend Progress, or a new section) computed from existing + new data:
- **Active hours** — a 24-hour bar of activity (sessions + reviews + teach + mocks), Nairobi time.
- **Best-performance hours** — recall accuracy and mock/paper % bucketed by time of day.
- **Focus vs performance** — focus rating trended against recall accuracy.
- **Needs a deeper dive** — topics ranked by lapse rate + low recall % + stale/low teach-back score, with a concrete next step per topic.

**Backend:** a new `server/insights.js` that computes these from the store; expose via state or a small endpoint.

**Done when:** after a week of use, Insights shows the active hours, the best hours, and a ranked "needs a deeper dive" list that matches intuition.

---

## C. QoL polish

Build in this order (all small, no AI):

1. **"Start" on Today's plan** — a one-tap Start that deep-links to the task *and* starts the focus timer for that unit.
2. **Backup/export** — a button that downloads `study.json` + `library.json` (or copies them to a chosen folder).
3. **Undo / confirm on delete** — confirm before deleting cards/topics/papers/mocks, or an undo toast.
4. **Timer-end notification** — browser notification + sound (replace the `alert()`).
5. **Retro-log study time** — a "I studied 45 min earlier" quick entry.
6. **Manual dark/light toggle** — a small override in the header.
7. **Keyboard shortcuts** — Space to reveal the answer, 1–4 to grade, Esc to close.

*(The in-app onboarding QoL item is absorbed by stream A.)*

---

## Order

**A → B → C.** Build each fully, test, and commit before moving on.

## Rules (abbreviated from BUILD-PROMPT.md)

- Read files before changing them; match existing style (ES modules, 2-space, single quotes, plain CSS tokens).
- No new dependency unless it saves a lot of code — say what and why first.
- Every AI call goes through `server/ai.js`; features must degrade gracefully without a key.
- Keep data in the JSON store; old data must still load; never delete the student's data.
- Works at 375px, light + dark, respects reduced motion; every input has a screen-reader label.
- Test yourself (build + exercise routes + check logic by hand), then commit on `study-dashboard`. Never commit `.env`, `data/` or `dist/`.

## Open questions (answer when you revise)

1. Focus rating 1–5 + "what you were doing" — is that the right extra data, or add energy/mood too?
2. Anything to add to the tour steps, or to the "needs a deeper dive" ranking?
