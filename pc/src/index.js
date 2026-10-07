// Engineering Study Hub, the always-on half (runs on this PC). Same Discord app and token as the Vercel half:
// Vercel answers buttons and slash commands; this process holds the gateway connection for everything that
// needs to see the server live or run on a timer.
//   npm start            run the bot
//   npm run dry-run      show where every file in WATCH_DIRS would go, without uploading or changing anything
//   npm run preview      the same, offline, no token needed (src/preview.js)
import './env.js';
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
});

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
    botLog.send({ content: text.slice(0, 1900), allowedMentions: { parse: [] } }).catch(() => {});
  };
  const ctx = { client, guild, index, setup, log, dry: false };

  wireMembers(client, setup, log);
  await seedActivity(guild);

  // index what's already on the server first, so nothing gets uploaded twice and /find covers it all
  const before = Date.now();
  const scan = await scanExisting(ctx);
  if (scan.added) log(`📚 Indexed ${scan.added} file${scan.added === 1 ? '' : 's'} already on the server (${Math.round((Date.now() - before) / 1000)}s). /find can search them, and the uploader skips them.`);
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
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
client.login(process.env.DISCORD_TOKEN);
