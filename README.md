# discord-sync-bot (Vercel)

Serverless side of the Engineering Study Hub Discord bot.

- `api/interactions.js`: the **I've paid** button, the M-Pesa payment form, and staff **Approve / Reject** buttons in `#payments`.
- `api/daily.js`: runs every day at 09:00 Nairobi time (Vercel Cron). It ends 7-day free trials, sends reminders, and ends Basic access 120 days after approval (with a reminder a week before).
- `lib/config.js`: IDs, prices, M-Pesa number, trial and semester lengths.

## Environment variables (Vercel → Settings → Environment Variables)
- `DISCORD_TOKEN`: the bot token
- `CRON_SECRET`: any long random string (Vercel sends it to `/api/daily`)

## Discord setup
Developer Portal → your app → General Information → **Interactions Endpoint URL** =
`https://<your-vercel-domain>/api/interactions`
