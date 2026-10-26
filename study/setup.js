// Sets up study/.env: your Discord user ID (who the bot DMs), the dashboard port, and optionally an Anthropic
// key for teach-back marking (hidden as you type). The bot token and Supabase keys stay in pc/.env.
// Press Enter to keep what's saved. Run: double-click setup.bat, or `npm run setup`.
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV = new URL('./.env', import.meta.url);
const pc = config({ path: fileURLToPath(new URL('../pc/.env', import.meta.url)), quiet: true, processEnv: {} }).parsed || {};
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const saved = existsSync(ENV)
  ? Object.fromEntries(readFileSync(ENV, 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
  : {};

function ask(question, { secret = false, current = '' } = {}) {
  const keep = current ? dim(` (Enter keeps ${secret ? `…${current.slice(-4)}` : current})`) : '';
  process.stdout.write(`\n${question}${keep}\n> `);
  return new Promise((done) => {
    const stdin = process.stdin;
    let value = '';
    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', onData); stdin.setRawMode?.(false); stdin.pause(); process.stdout.write('\n');
          return done(value.trim() || current);
        }
        if (ch === '\u0003') { process.stdout.write('\nCancelled, nothing saved.\n'); process.exit(1); }
        if (ch === '\u0008' || ch === '\u007f') { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        if (ch < ' ') continue;
        value += ch;
        process.stdout.write(secret ? '*' : ch);
      }
    };
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function checkOwner(id) {
  if (!pc.DISCORD_TOKEN) return red('No DISCORD_TOKEN in pc/.env, so DMs stay off. Run pc\\setup.bat first.');
  const h = { Authorization: `Bot ${pc.DISCORD_TOKEN}`, 'Content-Type': 'application/json' };
  const ch = await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: h, body: JSON.stringify({ recipient_id: id }) });
  if (ch.status === 401) return red('The bot token in pc/.env was rejected. Run pc\\setup.bat to update it.');
  if (!ch.ok) return red(`Discord doesn't know user ${id}. Copy your ID again (Settings → Advanced → Developer Mode on, then right-click your name → Copy User ID).`);
  const { id: channel } = await ch.json();
  const msg = await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
    method: 'POST', headers: h, body: JSON.stringify({ content: 'Study DMs are set up. Type `help` here once the study dashboard is running.' }),
  });
  if (msg.status === 403) return red('The bot can\'t DM you. In the Study Hub server: right-click the server icon → Privacy Settings → allow Direct Messages, then run this again.');
  if (!msg.ok) return red(`Couldn't send you a test DM (${msg.status}).`);
  return green('✓ Sent you a test DM.');
}

async function checkAnthropic(key) {
  const r = await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
  if (r.ok) return green('✓ Anthropic key works.');
  return red(r.status === 401 ? 'Anthropic rejected that key. Check you copied all of it (it starts with sk-ant-).' : `Anthropic answered ${r.status}. The key is saved; try again later.`);
}

async function checkDeepSeek(key) {
  const r = await fetch('https://api.deepseek.com/models', { headers: { Authorization: `Bearer ${key}` } });
  if (r.ok) return green('✓ DeepSeek key works.');
  return red(r.status === 401 ? 'DeepSeek rejected that key. Check you copied all of it.' : `DeepSeek answered ${r.status}. The key is saved; try again later.`);
}

console.log('Study dashboard setup. Your bot token and Supabase keys are read from pc/.env.');

const OWNER_ID = await ask('Your Discord user ID (Developer Mode on → right-click your name → Copy User ID):', { current: saved.OWNER_ID });
if (OWNER_ID && !/^\d{15,21}$/.test(OWNER_ID)) { console.log(red('That isn\'t a user ID: it should be 17-20 digits. Nothing saved.')); process.exit(1); }
if (OWNER_ID) console.log(await checkOwner(OWNER_ID));

const PORT = await ask('Dashboard port:', { current: saved.PORT || '5190' });

let ANTHROPIC_API_KEY = saved.ANTHROPIC_API_KEY || '';
if (pc.ANTHROPIC_API_KEY && !ANTHROPIC_API_KEY) console.log(dim('\nTeach-back marking will use the Anthropic key in pc/.env.'));
else {
  ANTHROPIC_API_KEY = await ask('Anthropic API key for teach-back marking (optional, Enter to skip; console.anthropic.com → API keys):', { secret: true, current: ANTHROPIC_API_KEY });
  if (ANTHROPIC_API_KEY) console.log(await checkAnthropic(ANTHROPIC_API_KEY));
}

const AI_PROVIDER = await ask('AI provider for Notes/Mock/Teach marking (gemini, deepseek or anthropic):', { current: saved.AI_PROVIDER || 'gemini' });
if (AI_PROVIDER === 'gemini') console.log(dim('Gemini will use the GEMINI_API_KEY already in community/.env.'));
let DEEPSEEK_API_KEY = saved.DEEPSEEK_API_KEY || '';
if (AI_PROVIDER === 'deepseek') {
  DEEPSEEK_API_KEY = await ask('DeepSeek API key (platform.deepseek.com → API keys):', { secret: true, current: DEEPSEEK_API_KEY });
  if (DEEPSEEK_API_KEY) console.log(await checkDeepSeek(DEEPSEEK_API_KEY));
}

const lines = [`OWNER_ID=${OWNER_ID}`, `PORT=${PORT}`, `AI_PROVIDER=${AI_PROVIDER}`, ...(ANTHROPIC_API_KEY ? [`ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}`] : []), ...(DEEPSEEK_API_KEY ? [`DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}`] : [])];
writeFileSync(ENV, `${lines.join('\n')}\n`);
console.log(green('\nSaved study/.env. Start the dashboard with start.bat.'));
