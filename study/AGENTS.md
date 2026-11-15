# Crux (study/): agent instructions

Crux is the Study Hub's web app (crux.engineeringhub.site). The repo-level `CLAUDE.md` one folder up also applies.

## Read first
- `docs/ARCHITECTURE-ESSENTIALS.md`: the rules. Read it in every session.
- `docs/PRD.md`: what the product must do. `docs/ARCHITECTURE.md`: the full design; read only the sections your phase names.
- `../fixplan-e.md` (local, not in git): the current build plan, one phase per session. `../fixplan.md` sections 4–6: how we build.
- `docs/UNDERSTANDING.md`: the Breakpoint model. `docs/REDESIGN.md`: the look.

## Commands (from `study/`)
- `npm test` (all tests, about 15 s) · `npm run dev` (local server, signed in as the owner) · `npm run build`
- `node tools/shots.js` (screenshots, system Edge) · `node tools/a11y.js` (axe)
- `node tools/prepare-unit.js "EMM 302"` (read a unit's files on this laptop)
- `node tools/gold.js "EMM 302" --dry` (Track E1: strong-model solutions; ask the owner before a real run)
- `setup-web.bat` (keys with hidden input, copies them to Vercel)

## Rules
- Pure logic first, with a `node --test` file, then the glue, then the screen.
- Every model call goes through `structured()` in `server/ai.js`. A POST route that calls a model goes in `USES_AI`.
- Shared tables hold material from Hub files only. Nothing a student typed about themselves is shared.
- Do not add a second mastery score or scheduler. Use `server/understanding.js`.
- Numbers and lists shared across files live in `server/defs.js`.
- New SQL goes at the end of `../supabase/crux.sql`. The owner runs it.
- UI work is done when there are screenshots at 375 px and 1280 px, light and dark, and axe shows 0 serious findings.
- Student-facing text is plain. Run `python ~/.claude/skills/slopmonster/tools/deslop.py <file>` on it.
- Each release gets a note in `docs/versions/<YYYY.MM.DD>.md` (Done, To do, Scrapped, Needs the owner).
- Commits: `crux(<phase>): what`. Public repo: check `git diff --cached`; never commit `.env*`, `data/`, `fixplan*.md`.
- After two failed tries at one problem, stop and give the owner two options.
