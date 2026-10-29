// Sets up study/.env: your Discord user ID (who the bot DMs), the dashboard port, and the AI provider with its key
// (hidden as you type, checked once). The bot token and Supabase keys stay in pc/.env; a Gemini key already in
// community/.env is used as it is. Press Enter to keep what's saved. Run: double-click setup.bat, or `npm run setup`.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { green, red, dim, readEnv, writeEnv, ask, askKey, askPort, checkKey, verdict } from './setup-lib.js';

const ENV = new URL('./.env', import.meta.url);
const pc = config({ path: fileURLToPath(new URL('../pc/.env', import.meta.url)), quiet: true, processEnv: {} }).parsed || {};
const community = config({ path: fileURLToPath(new URL('../community/.env', import.meta.url)), quiet: true, processEnv: {} }).parsed || {};

// No Study Hub bot keys on this laptop (a friend's install), or --friend: set up with a Study Desk code instead.
if (!pc.DISCORD_TOKEN || process.argv.includes('--friend')) {
  await import('./setup-friend.js');
  process.exit(0);
}

const saved = readEnv(ENV);

async function checkOwner(id) {
  const h = { Authorization: `Bot ${pc.DISCORD_TOKEN}`, 'Content-Type': 'application/json' };
  const api = (path, body) => fetch(`https://discord.com/api/v10${path}`, { method: 'POST', headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  try {
    const ch = await api('/users/@me/channels', { recipient_id: id });
    if (ch.status === 401) return red('The bot token in pc/.env was rejected. Run pc\\setup.bat to update it.');
    if (!ch.ok) return red(`Discord doesn't know user ${id}. Copy your ID again (Settings → Advanced → Developer Mode on, then right-click your name → Copy User ID).`);
    const { id: channel } = await ch.json();
    const msg = await api(`/channels/${channel}/messages`, { content: 'Study DMs are set up. Type `help` here once the study dashboard is running.' });
    if (msg.status === 403) return red('The bot can\'t DM you. In the Study Hub server: right-click the server icon → Privacy Settings → allow Direct Messages, then run this again.');
    if (!msg.ok) return red(`Couldn't send you a test DM (${msg.status}).`);
    return green('✓ Sent you a test DM.');
  } catch { return red('Couldn’t reach Discord to send the test DM. The ID is saved; check your internet and run setup again.'); }
}

console.log('Study dashboard setup. Your bot token and Supabase keys are read from pc/.env.');

let OWNER_ID = '';
for (;;) {
  OWNER_ID = await ask('Your Discord user ID (Developer Mode on → right-click your name → Copy User ID):', { current: saved.OWNER_ID });
  if (!OWNER_ID || /^\d{15,21}$/.test(OWNER_ID)) break;
  console.log(red('That isn\'t a user ID: it should be 17-20 digits. Try again, or press Enter to skip.'));
}
if (OWNER_ID) console.log(await checkOwner(OWNER_ID));
else console.log(dim('No user ID: the bot won’t DM you. Run setup again to add one.'));

const PORT = await askPort(saved.PORT || '5190');

// The AI that suggests topics, solves checkpoints, marks teach-backs and mocks. Only the chosen provider's key is asked
// for; keys you saved earlier for the others are kept. The top bar's settings can switch provider at any time.
const providers = ['gemini', 'deepseek', 'anthropic'];
let AI_PROVIDER = '';
while (!providers.includes(AI_PROVIDER)) {
  AI_PROVIDER = (await ask('AI provider (gemini, deepseek or anthropic):', { current: providers.includes(saved.AI_PROVIDER) ? saved.AI_PROVIDER : 'gemini' })).toLowerCase();
  if (!providers.includes(AI_PROVIDER)) console.log(red('Type gemini, deepseek or anthropic.'));
}
let { GEMINI_API_KEY = '', DEEPSEEK_API_KEY = '', ANTHROPIC_API_KEY = '' } = saved;
if (AI_PROVIDER === 'gemini') {
  if (community.GEMINI_API_KEY && !GEMINI_API_KEY) {
    console.log(dim('Using the Gemini key in community/.env.'));
    console.log(verdict('gemini', await checkKey('gemini', community.GEMINI_API_KEY)));
  } else GEMINI_API_KEY = await askKey('gemini', 'Gemini API key (aistudio.google.com → Get API key):', GEMINI_API_KEY);
}
if (AI_PROVIDER === 'deepseek') DEEPSEEK_API_KEY = await askKey('deepseek', 'DeepSeek API key (platform.deepseek.com → API keys):', DEEPSEEK_API_KEY);
if (AI_PROVIDER === 'anthropic') {
  if (pc.ANTHROPIC_API_KEY && !ANTHROPIC_API_KEY) console.log(dim('Using the Anthropic key in pc/.env.'));
  else ANTHROPIC_API_KEY = await askKey('anthropic', 'Anthropic API key (console.anthropic.com → API keys):', ANTHROPIC_API_KEY);
}

writeEnv(ENV, { ...saved, OWNER_ID, PORT, AI_PROVIDER, GEMINI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY });
console.log(green('\nSaved study/.env. Start the dashboard with start.bat.'));
