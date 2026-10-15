// Engineering Study Hub community bot (a separate Discord app from the uploader).
//   npm start          run it          npm run try     post today's trivia, video and article now, then keep running
import { config } from 'dotenv';
import { appendFileSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import cron from 'node-cron';
import { CHANNEL, SCHEDULE } from './config.js';
import { postArticle, postTrivia, postVideo, recordVote, revealTrivia } from './posts.js';
import { onMessage } from './talk.js';

config({ path: new URL('../.env', import.meta.url), quiet: true });
for (const key of ['COMMUNITY_DISCORD_TOKEN', 'GEMINI_API_KEY']) {
  if (!process.env[key]) { console.error(`Missing ${key} in community/.env. Double-click setup.bat to add it.`); process.exit(1); }
}

// everything printed also goes to community/data/bot.log
const LOG = new URL('../data/bot.log', import.meta.url);
for (const level of ['log', 'error']) {
  const print = console[level].bind(console);
  console[level] = (...a) => { print(...a); try { appendFileSync(LOG, `${new Date().toISOString()} ${level === 'error' ? 'ERROR ' : ''}${a.map((x) => (x instanceof Error ? x.stack : String(x))).join(' ')}\n`); } catch { /* busy */ } };
}

// one copy at a time
const LOCK = new URL('../data/bot.lock', import.meta.url);
const other = (() => { try { return Number(readFileSync(LOCK, 'utf8')); } catch { return 0; } })();
if (other) { try { process.kill(other, 0); console.error(`Already running (process ${other}).`); process.exit(1); } catch (e) { if (e.code === 'EPERM') process.exit(1); } }
writeFileSync(LOCK, String(process.pid));
process.on('exit', () => { try { unlinkSync(LOCK); } catch { /* gone */ } });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], // MessageContent: turn on in the Developer Portal
});

client.once(Events.ClientReady, async () => {
  console.log(`Signed in as ${client.user.tag}`);
  const channel = await client.channels.fetch(CHANNEL);
  const job = (name, fn) => async () => { try { await fn(channel); console.log(`${name}: posted`); } catch (e) { console.error(`${name} failed:`, e.message); } };
  const at = (expr, name, fn) => cron.schedule(expr, job(name, fn), { timezone: 'Africa/Nairobi' });
  at(SCHEDULE.trivia, 'trivia', postTrivia);
  at(SCHEDULE.triviaReveal, 'trivia answer', revealTrivia);
  at(SCHEDULE.video, 'video', postVideo);
  at(SCHEDULE.article, 'article', postArticle);
  if (process.argv.includes('--post-now')) for (const [n, f] of [['trivia', postTrivia], ['video', postVideo], ['article', postArticle]]) await job(n, f)();
  console.log(`Ready: posting in #${channel.name}, chatting when mentioned and in its threads.`);
});

client.on(Events.MessageCreate, (msg) => onMessage(msg, client).catch((e) => console.error('message:', e.message)));
client.on(Events.InteractionCreate, (i) => {
  if (i.isButton() && i.customId.startsWith('trivia:')) recordVote(i).catch((e) => console.error('vote:', e.message));
});
client.on(Events.Error, (e) => console.error('Discord error:', e.message));
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
client.login(process.env.COMMUNITY_DISCORD_TOKEN);
