# Crux: architecture essentials

The rules a build session must hold. Full detail: `ARCHITECTURE.md`. Product: `PRD.md`.

## Shape
- Web app in `web/src` (React, plain CSS tokens, CSS-only motion). Server in `server/`, one Vercel entry `api/router.js`. Supabase Postgres (the bot's project). No long-running server.
- Long work runs on the owner's laptop through `tools/*.js`, never in a request.
- Node ES modules, 2 spaces, single quotes. No new dependency unless the phase names it.

## Data
- One private JSON document per student (`server/store.js`, lists in `LISTS`). Change its shape only with a `VERSION` bump and a `normalize` step.
- Shared library tables hold material from Hub files and papers only: `crux_unit_kb`, `crux_question_kb`, `crux_kit_kb`, `crux_class_hints`, `crux_file_text`. Never share what a student typed about themselves. Topic ids are private; shared rows use topic names.
- Row level security on, no policies. The service key is server-side only.
- New SQL goes at the end of `supabase/crux.sql` and is an owner action (the Supabase MCP cannot reach this project).
- Dates and "today" are Africa/Nairobi (`nairobiDay`).

## Logic
- Pure modules take plain lists and are tested with `node --test` first. Store-aware glue is separate (`practice.js`, `weakspots.js`, `learn-store.js`).
- Shared numbers and lists live in `server/defs.js`. Never inline them.
- Understanding comes from `server/understanding.js` (Breakpoint model). It already forgets. Do not add another mastery score or scheduler.
- Answers are compared in code (`server/answer.js`). A model never decides that a student understands something.

## AI
- Every model call goes through `structured()` in `server/ai.js`.
- A POST route that calls a model must be in `USES_AI` (`server/routes.js`) so it counts against the daily limit. A route that reads notes must be in `READS_NOTES`.
- Per-student calls use the cheap models (Gemini, DeepSeek, GLM). Opus and Fable run only on the laptop (`CRUX_AI=claude-code`, `CRUX_CLAUDE_MODEL`), for shared material.
- Shared solutions have a level: `key` > `agreed` > `single`. A lower level never replaces a higher one (`server/gold.js`).
- Student-selected text goes in the content, capped at 2,000 characters. The learner file block is built in code, at most 600 characters.

## UI
- Check every changed screen at 375 px and 1280 px, light and dark (`tools/shots.js`), and run `tools/a11y.js`: 0 serious findings.
- Copy is plain. Plan names shown to students are Imai, Gacrux, Mimosa, Acrux (`lib/plan-names.js`); the tier ids stay `trial, basic, premium, vvip`.
- Write routes that need no AI go in the offline outbox pattern (`QUEUE` in `web/src/api.js`).

## Repo
- Public repo. Never commit `.env*`, `data/`, logs, keys, `fixplan.md`, `fixplan-e.md`. Run `git diff --cached` before every commit.
- Secrets are asked for by `setup-web.js` with hidden input. Never print or paste a key.
- Commits: `crux(e1): what`. Work on `main`. One concern per commit.
