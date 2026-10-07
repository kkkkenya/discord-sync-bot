// Engineering Study Hub, the always-on half (runs on this PC). Same Discord app and token as the Vercel half:
// Vercel answers buttons and slash commands; this process holds the gateway connection for everything that
// needs to see the server live or run on a timer.
//   npm start            run the bot
//   npm run dry-run      show where every file in WATCH_DIRS would go, without uploading or changing anything
//   npm run preview      the same, offline, no token needed (src/preview.js)
import './env.js';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import cron from 'node-cron';
import { FEATURES, GUILD_ID } from '../../lib/config.js';
import { db } from '../../lib/db.js';
import { isoDay } from '../../lib/discord.js';
import { countdownLine, runDailyProblem } from './jobs/daily-problem.js';
import { runDigest, runExamPush, runLeaderboard, runNudges, runStreakUpkeep } from './jobs/community.js';
import { seedActivity, wireMembers } from './members.js';
import { ensureSetup } from './setup.js';
import { recordLive, scanExisting } from './uploader/existing.js';
import { startUploader } from './uploader/index.js';
import { PostIndex } from './uploader/posts.js';

const DRY = process.argv.includes('--dry-run');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: turn on "Server Members Intent" in the Developer Portal
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
  // Big books on a slow line take minutes: the 15-second default gave up mid-upload, then discord.js re-sent the
  // whole file up to 3 times (that's how files got posted 2-4 times). Long timeout, and no blind retries: the
  // uploader retries itself, after checking whether the file already landed.
  rest: { timeout: 10 * 60 * 1000, retries: 0 },
});

// One copy at a time: two would race through the same files and post them twice.
if (!DRY) {
  const LOCK = new URL('../data/bot.lock', import.meta.url);
  const other = (() => { try { return Number(readFileSync(LOCK, 'utf8')); } catch { return 0; } })();
  if (other && other !== process.pid) {
    let running = true;
    try { process.kill(other, 0); } catch (e) { running = e.code === 'EPERM'; }
    if (running) { console.error(`The bot is already running (process ${other}). Close its window first, or wait for it.`); process.exit(1); }
  }
  writeFileSync(LOCK, String(process.pid));
  process.on('exit', () => { try { if (readFileSync(LOCK, 'utf8') === String(process.pid)) unlinkSync(LOCK); } catch { /* gone already */ } });
}

client.once(Events.ClientReady, async () => {
  console.log(`Signed in as ${client.user.tag}${DRY ? ' (dry run: nothing will be posted)' : ''}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  const index = await new PostIndex(guild).load();
  console.log(`Found ${index.byCode.size} unit codes across ${index.forums.size} forums.`);

  if (DRY) {
    console.log('Reading the files already on the server (nothing is changed)...');
    const { found, places, files } = await scanExisting({ client, guild }, { write: false });
    console.log(`Found ${files} files already in ${places} posts and channels.`);
    await startUploader({ client, guild, index, existing: found, dry: true, log: console.log, onDryRunDone: () => process.exit(0) });
    return;
  }

  const setup = await ensureSetup(guild);
  const botLog = setup.channels.botLog;
  const log = (text) => {
    console.log(text);
    botLog.send({ content: text.slice(0, 1900), allowedMentions: { parse: [] } }).catch((e) => console.error(`couldn't post to #bot-log: ${e.message}`));
  };
  const ctx = { client, guild, index, setup, log, dry: false };

  wireMembers(client, setup, log);
  await seedActivity(guild);

  // index what's already on the server first, so nothing gets uploaded twice and /find covers it all
  const before = Date.now();
  const scan = await scanExisting(ctx);
  if (scan.added) log(`📚 Indexed ${scan.added} file${scan.added === 1 ? '' : 's'} already on the server (${Math.round((Date.now() - before) / 1000)}s). /find can search them, and the uploader skips them.`);
  if (scan.failed.length) log(`⚠️ Couldn't read ${scan.failed.length} post${scan.failed.length === 1 ? '' : 's'} or channel${scan.failed.length === 1 ? '' : 's'} (${scan.failed.slice(0, 10).join(', ')}): files already there may be uploaded again. They're retried on the next start.`);
  client.on(Events.MessageCreate, (msg) => recordLive(ctx, msg).catch((e) => console.error('index:', e.message)));
  await startUploader(ctx);

  // every job catches its own errors, so one failure never stops the bot
  const job = (name, fn) => async () => {
    try { await fn(ctx); } catch (e) { log(`❌ ${name} failed: ${e.message}`); console.error(e); }
  };
  const at = (expr, name, fn) => cron.schedule(expr, job(name, fn), { timezone: 'Africa/Nairobi' });
  at('0 10 * * *', 'Revision packs', runExamPush);
  at('30 17 * * *', 'Check-ins', runNudges);
  at('0 18 * * 0', 'Digest', runDigest);

  if (FEATURES.dailyProblems) {
    at('0 7 * * *', 'Streak upkeep', runStreakUpkeep);
    at('0 8 * * *', 'Daily problem', runDailyProblem);
    at('5 8 * * 1', 'Leaderboard', runLeaderboard);
    // the PC may have been off at 8:00: catch up on today's problem once the morning has started
    const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' }));
    if (hour >= 8) {
      const posted = await db.select('problems', `day=eq.${isoDay(new Date())}&select=id`).catch(() => [{}]);
      if (!posted.length) await job('Daily problem', runDailyProblem)();
    }
  }
  const countdown = countdownLine();
  log(`✅ Bot online. Watching for uploads; digest Sundays 18:00${FEATURES.dailyProblems ? ', daily problem 08:00' : ''}.${countdown ? `\n${countdown}` : ''}`);
});

client.on(Events.Error, (e) => console.error('Discord error:', e.message));
let watchErrors = 0; // Google Drive disconnecting makes every watched folder error at once; the uploader's sweep covers it
process.on('unhandledRejection', (e) => {
  if (e?.syscall === 'watch') { if (watchErrors++ === 0) console.error('folder watching interrupted (Google Drive disconnected?); the 30-minute sweep catches anything missed'); return; }
  console.error('Unhandled:', e);
});
client.login(process.env.DISCORD_TOKEN);
