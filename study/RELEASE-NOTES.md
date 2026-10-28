# Study Desk release notes

## 28 Oct 2026: audit fixes, redesign, Phases 10 and 11, tutorial quests

Restart `start.bat` once so the new version is what you see.

**What changed**
- New look: the Engineering Study Hub's blueprint blue and IBM Plex, the full screen width, four bands (Today, Plan, Practise, Review), and a top bar that turns to glass as you scroll. Hover a group to see what each section holds.
- One current unit (top right) that every section follows.
- Today and Weakspots now open Check answer on real past-paper questions.
- Suggest topics reads your synced course outline and past papers.
- Units still on the KU calendar get a "Mark them TBA" note at the top of the page.
- Study kit: a ladder, solving recipes or a one-page formula sheet, made for each unit's stage, saved and editable.
- Discord: `mark EMM 302` gives you a question, `mark 142.5 MPa` checks your answer, `mark broke 2` logs where it broke. The 20:30 nudge follows the most urgent unit's stage.
- Tutorial quests replace the old tour.
- `setup.bat` asks only for the key of the AI provider you use, and checks it.

**What to re-check tonight**
1. Units: tick TBA on any unit whose date the strike moved (or use the note at the top).
2. Sync all files, then Suggest topics on the units you're studying.
3. Study kit: press Make it for one unit and print the formula sheet if it's close.
4. On Discord: `mark EMM 318`, solve it, reply with your answer.

**Removed**: the post-session check-in, the old tour and checklist, `insights.js`, `CountUp.jsx` and the `motion` package. Your data is untouched; `data/backups/` keeps a copy from before the first change.
