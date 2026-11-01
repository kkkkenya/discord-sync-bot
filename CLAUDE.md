# discord-sync-bot
Engineering Study Hub. Discord bot: Vercel half in api/ + lib/, PC half in pc/ (drive dumper) and community/ (hub buddy).
ops/ runs both PC bots (supervisor + Task Scheduler). study/ is Crux, the web app (crux.engineeringhub.site).
Plan and status: fixplan.md (local only, not in git). Read §0–6 and the phase you're doing.

## Commands
- Crux: cd study && npm test | npm run dev | npm run build
- Drive dumper: cd pc && npm run dry-run | npm start      Community: cd community && npm start | npm run try
- Community posts (GitHub Actions): node community/scheduler.js
- Supervisor: node ops/supervise.js | node --test ops/test/      Task: powershell -File ops/install-task.ps1
- Community tests: cd community && npm test
- Logs: pc/data/logs/, community/data/logs/ (restarts.log for restarts)

## Rules
- Public repo: never commit .env*, data/, logs, keys, fixplan.md. Check git diff --cached before committing.
- Secrets: setup scripts with hidden input (global CLAUDE.md). Never print a key.
- Africa/Nairobi for all dates. ES modules, 2 spaces, single quotes, plain CSS tokens.
- Supabase: service key server-side only; RLS on, no policies.
- Motion: CSS only (owner override of the global motion-stack rule).
- Windows: python (not python3); Bash tool is Git Bash; PowerShell 5.1.
- Commits: `area(phase): what`, e.g. pc(b2): …, crux(c4): …. Work on main.
