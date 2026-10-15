// Engineering Study Hub community bot, the conversation half (runs on the PC; starts with Windows).
// The daily posts are sent by GitHub Actions (scheduler.js), so they go out even when this isn't running.
//   npm start      chat          npm run try     also send any of today's posts not sent yet, right now
import { config } from 'dotenv';
import { appendFileSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { CHANNEL } from './config.js';
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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], // MessageContent: on in the Developer Portal
});

client.once(Events.ClientReady, async () => {
  const channel = await client.channels.fetch(CHANNEL);
  console.log(`Signed in as ${client.user.tag}: chatting in #${channel.name}, its threads, and wherever it's mentioned.`);
  if (process.argv.includes('--post-now')) {
    execFile(process.execPath, ['scheduler.js', '--now'], { cwd: new URL('..', import.meta.url) }, (e, out, err) => console.log(`posts now: ${out}${err}`.trim()));
  }
});

client.on(Events.MessageCreate, (msg) => onMessage(msg, client).catch((e) => console.error('message:', e.message)));
client.on(Events.Error, (e) => console.error('Discord error:', e.message));
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
client.login(process.env.COMMUNITY_DISCORD_TOKEN);
