# discord-sync-bot

The Engineering Study Hub Discord bot. One Discord app, one token, two halves:

| Half | Runs on | Does |
|---|---|---|
| **Vercel** (`api/`, `lib/`) | Vercel, always online | Payments (**I've paid**, Approve/Reject), trial and semester expiry (daily cron), the `#to-sort` Sort buttons, the staff dashboard, and the slash commands: `/find`, `/group`, `/classmates`, `/nudges` (plus `/daily`, `/streak`, `/leaderboard` when daily problems are on) |
| **PC bot** (`pc/`) | Your PC (needs to be on) | The **file uploader** (watches your Drive folders, follows Drive shortcuts), the welcome guide DM, the Sunday digest, 14-day check-ins and exam revision packs (and the daily problem, when on) |

If the PC is off, payments and commands still work; uploads and scheduled posts wait until it's back.
Data for the file index, groups and streaks lives in Supabase (`supabase/schema.sql`). No member records.

**Daily problems are off** for now (`FEATURES.dailyProblems` in `lib/config.js`). Turning them on adds
`#daily-problems`, its roles and commands, and needs an Anthropic API key (setup asks for it).

## Quick start (Windows)

1. Double-click **`pc/setup.bat`**. It installs what's needed and asks for your keys, hidden as you type:
   Discord bot token, Supabase URL and secret key. It checks each one, can create the Supabase tables for you,
   and can copy the keys to Vercel and redeploy (do that after resetting the token so payments keep working).
2. `npm run register` in `pc/` adds the slash commands to the server.
3. `npm run dry-run` shows where every file would go against the live server, posting nothing.
   (`npm run preview` does the same offline, no token needed.) The full list goes to `pc/data/dry-run.txt`.
4. Double-click **`pc/start-bot.bat`** to run the bot. To start it with Windows: Win+R → `shell:startup` →
   put a shortcut to `start-bot.bat` there.

In the Discord Developer Portal → your app → **Bot**, turn on **Server Members Intent**. The bot needs
Manage Channels, Manage Roles, Manage Threads, Read Message History, Send Messages and Attach Files.

On first start the bot creates `#new-this-week`, `#study-groups` and `#bot-log` (staff only), gives rep roles
access to `#to-sort`, and indexes every file already on the server.

## How the uploader works

**Which folders.** `WATCH_DIRS` in `pc/.env` (separated by `;`). Drive shortcuts (`.lnk`) inside those folders are
followed, so one folder of shortcuts to shared course folders is enough; add a shortcut later and it's picked up.

**Sorting a file**, working backwards from the file:
1. A unit code (like `EMM 305`) in the **file name**, then in **each folder above it, nearest first**, so
   `Mechanical/2nd Year/1st Sem/Notes/EMM 200 Thermodynamics/lecture 3.pdf` goes to EMM 200.
2. A file or folder **named by the unit's title**: `Notes/2.2/Fluid Mechanics 2/` → EMM 205 Fluid Mechanics II,
   `DEs` → ECU 202, `SSM 3` → EMM 403. Titles come from `lib/units.json` (the website's unit pages plus the
   server's post titles; rebuild with `npm run units` after adding unit pages) and from live post names. It's
   strict: the year must match the folder's year (`2.2`, `Y3 S2`, `3rd year`), part numbers must agree, and
   there must be one clear winner, otherwise the file goes to `#to-sort`.
3. If that isn't enough, the **title and first page** (PDF, Word, PowerPoint, text).
4. The path also gives course, year, semester and kind (`past papers`, `CATs`, `notes`, `slides`, `books`).
5. **Books** (15 MB+, or PDFs with 150+ pages) go to the best topic shelf.
6. Destination: the unit's post (created in the right forum if missing; forwarded to the other-year post when a
   unit is taught in two years), a shelf, or **`#to-sort`**, where reps and admins get a ping and sort it with the
   buttons. Reps are roles with "rep" in the name (`SORTER_ROLE_MATCH` in `lib/config.js`).

**No duplicates.** On first start the bot reads every file already in the unit posts, shelves, `#pdf-library` and
`#to-sort` (from the old uploader or posted by hand) into the index; later starts read only what's new, and files
members post are added as they arrive. A local file is skipped when the server already has one of the same exact
size and type, or when the same content was already found in another of your folders (sha256).

**Too big for Discord** (10 MB, or 50/100 MB on a boosted server): PDFs are compressed with Ghostscript if it's
installed (ghostscript.com), otherwise or if still too big they're split by pages into parts ("part 1 of 3,
pages 1-180"), each posted in order. Other files are zipped, then cut into 7-Zip pieces if needed. Sorting a
split book from `#to-sort` moves every part. To shrink one file by hand: `npm run shrink -- "C:\path\book.pdf"`.

## Schedule (Nairobi time)

| When | What |
|---|---|
| Daily 09:00 | (Vercel) trials and semester renewals |
| Daily 10:00 | Revision-pack DMs, from 14 days before exams (`CALENDAR` in `lib/config.js`) |
| Daily 17:30 | Check-in DMs to members quiet for 14+ days (at most 40 a day, `/nudges off` to opt out) |
| Sundays 18:00 | `#new-this-week` digest |
| When daily problems are on | 07:00 streak upkeep, 08:00 daily problem, Mondays 08:05 leaderboard |

## Files

- `lib/config.js`: IDs, prices, M-Pesa, trial and semester lengths, channel/role names, the KU calendar, switches.
- `lib/commands.js`: slash commands and buttons (Vercel). `lib/db.js`: Supabase client. `lib/sorting.js`: Sort helpers.
- `pc/setup-keys.js` (`setup.bat`): asks for keys and saves `pc/.env`. `pc/register-commands.js`: slash commands.
- `pc/src/uploader/`: `index.js` (watching and posting), `classify.js` (what is this file?), `extract.js` (title,
  first page), `titles.js` (folder titles → unit codes), `posts.js` (forums and unit posts), `existing.js` (files
  already on the server), `shrink.js`. `pc/make-units.js` rebuilds `lib/units.json`.
- `pc/src/jobs/`: `community.js` (digest, nudges, revision packs, streaks, leaderboard), `daily-problem.js`.

## Discord setup

Developer Portal → your app → General Information → **Interactions Endpoint URL** =
`https://<your-vercel-domain>/api/interactions`
