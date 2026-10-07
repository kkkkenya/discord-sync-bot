# discord-sync-bot

The Engineering Study Hub Discord bot. One Discord app, one token, two halves:

| Half | Runs on | Does |
|---|---|---|
| **Vercel** (`api/`, `lib/`) | Vercel, always online | Payments (**I've paid**, Approve/Reject), trial and semester expiry (daily cron), the `#to-sort` Sort buttons, the staff dashboard, and every slash command and button: `/find`, `/group`, `/classmates`, `/daily`, `/nudges`, `/streak`, `/leaderboard`, daily-problem answers |
| **PC bot** (`pc/`) | Your PC (needs to be on) | The **file uploader** (watches a PC folder and your Google Drive folder), the welcome guide DM, the daily practice problem, the Sunday digest, 14-day check-ins and exam revision packs |

If the PC is off, payments and commands still work; uploads and scheduled posts wait until it's back
(the daily problem catches up when the bot starts after 08:00).

Data for streaks, points, groups and the file index lives in Supabase (`supabase/schema.sql`). No member records.

## How the uploader sorts a file

1. Looks for a unit code (like `EMM 305`) in the **file name**, then in **each folder above it, nearest first**,
   so `Mechanical/Year 2/Sem 1/Notes/EMM 200/lecture 3.pdf` is placed under EMM 200.
2. If that isn't enough, it opens the file and reads the **title and first page** (PDF, Word, PowerPoint, text).
3. The folder path also gives hints: course (`Mechanical`), year (`2nd year`, `Year 2`), semester, and kind
   (`past papers`, `CATs`, `notes`, `slides`, `books`).
4. **Big files** (15 MB+, or PDFs with 150+ pages) are treated as **books** and go to the best topic shelf.
5. Destination: the unit's post (created in the right forum if it doesn't exist yet; forwarded to the
   other-year post when a unit is taught in two years), a book shelf, or `#to-sort` with the Sort buttons.
6. Every file is uploaded once (its sha256 is stored). Files stay where they are on your PC and in Drive.

Files bigger than Discord allows (10 MB, or 50/100 MB on a boosted server) are listed in `#bot-log`.

## First-time setup

1. **Supabase**: open your project → SQL Editor → paste `supabase/schema.sql` → Run.
2. **Discord Developer Portal** → your app → **Bot**: turn on **Server Members Intent**, then **Reset Token**.
   The bot needs Manage Channels, Manage Roles, Manage Threads, Send Messages, Attach Files on the server.
3. **Vercel** → Settings → Environment Variables: set `DISCORD_TOKEN` (the new token), plus
   `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. Redeploy.
4. **Install Node.js 22 or newer** (nodejs.org, LTS).
5. **Google Drive for Desktop**: install it, and set the hub's folder to *Available offline* so the bot can read it.
6. In `pc/`: copy `.env.example` to `.env` and fill it in (token, Supabase, Anthropic API key, `WATCH_DIRS`).
7. In a terminal in `pc/`:
   ```
   npm install
   npm run register     # adds the slash commands to the server
   npm run dry-run      # shows where every file would go, posts nothing
   npm start            # runs the bot (or double-click start-bot.bat)
   ```
8. To start it with Windows: Win+R → `shell:startup` → put a shortcut to `pc/start-bot.bat` there.

On first start the bot creates `#daily-problems`, `#new-this-week`, `#study-groups`, `#bot-log` (staff only),
and the roles **Daily Problems**, **🔥 7-day streak**, **🔥 30-day streak**. Move or re-permission them freely.

## Schedule (Nairobi time)

| When | What |
|---|---|
| Daily 07:00 | End lapsed streaks, take back streak roles |
| Daily 08:00 | Reveal yesterday's answer, post today's problem (pings the opt-in **Daily Problems** role) |
| Daily 09:00 | (Vercel) trials and semester renewals |
| Daily 10:00 | Revision-pack DMs, from 14 days before exams (`CALENDAR` in `lib/config.js`) |
| Daily 17:30 | Check-in DMs to members quiet for 14+ days (at most 40 a day, `/nudges off` to opt out) |
| Mondays 08:05 | Last week's leaderboard |
| Sundays 18:00 | `#new-this-week` digest |

## Files

- `lib/config.js`: IDs, prices, M-Pesa, trial and semester lengths, channel/role names, the KU calendar.
- `lib/commands.js`: slash commands and buttons (Vercel). `lib/db.js`: Supabase client.
- `pc/src/uploader/`: `classify.js` (what is this file?), `extract.js` (title, first page), `posts.js` (forums and unit posts).
- `pc/src/jobs/`: `daily-problem.js` (uses Claude to write the problem from a past paper), `community.js` (digest, nudges, revision packs, streaks, leaderboard).
- `pc/register-commands.js`: registers the slash commands.

## Discord setup

Developer Portal → your app → General Information → **Interactions Endpoint URL** =
`https://<your-vercel-domain>/api/interactions`
