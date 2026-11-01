// Crux setup: asks for the keys (hidden as you type), checks each one, saves them to study/.env, makes the Crux
// tables in Supabase if they're missing, and copies everything to the Vercel project "crux" (made if missing).
// Press Enter to keep a value that's already saved. Run: double-click setup-web.bat, or `node setup-web.js`.
// Discord, Supabase and Gemini keys default to the bot's (pc/.env, community/.env).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV = new URL('./.env', import.meta.url);
const SQL = new URL('../supabase/crux.sql', import.meta.url);
const VERCEL = { team: 'team_JEJX6rJON0objLeKGaREgeT1', name: 'crux', repo: 'kkkkenya/discord-sync-bot' };

const read = (url) => (existsSync(url)
  ? Object.fromEntries(readFileSync(url, 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
  : {});
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const mask = (v) => (v ? `…${v.slice(-4)}` : '');

// One line of input; secret answers show * instead of the characters.
let ahead = '';
function ask(question, { secret = false, current = '' } = {}) {
  const keep = current ? dim(` (Enter keeps ${secret ? mask(current) : current})`) : '';
  process.stdout.write(`\n${question}${keep}\n> `);
  return new Promise((done) => {
    const stdin = process.stdin;
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode?.(false);
      stdin.pause();
      process.stdout.write('\n');
      done(value.trim() || current);
    };
    function onData(chunk) {
      const text = ahead + chunk;
      ahead = '';
      for (let n = 0; n < text.length; n++) {
        const ch = text[n];
        if (ch === '\r' || ch === '\n') { ahead = text.slice(text[n + 1] === '\n' && ch === '\r' ? n + 2 : n + 1); return finish(); }
        if (ch === '\u0003') { process.stdout.write('\nCancelled, nothing saved.\n'); process.exit(1); }
        if (ch === '\u0008' || ch === '\u007f') { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        value += ch;
        process.stdout.write(secret ? '*' : ch);
      }
    }
    stdin.setRawMode?.(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
    if (ahead) onData('');
  });
}

async function call(url, init) {
  try {
    const r = await fetch(url, init);
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: e.cause?.code || e.message };
  }
}

// --- checks: each returns a message, green when the value works ---------------------------------------------
const checks = {
  discord: async (token) => {
    const r = await call('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` } });
    return r.ok ? green(`✓ Bot token works (${r.body.username}).`) : red(`✗ Discord didn't accept the bot token (${r.status}). Copy it again from pc/.env or reset it.`);
  },
  crux: async (id, secret) => {
    const r = await call('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'identify' }),
    });
    return r.ok ? green('✓ Crux client ID and secret work.') : red(`✗ Discord didn't accept the Crux client ID and secret (${r.status}). Copy both from Developer Portal → Crux → OAuth2.`);
  },
  supabase: async (url, key) => {
    const r = await call(`${url}/rest/v1/crux_docs?select=user_id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (r.ok) return { msg: green('✓ Supabase works and the Crux tables exist.'), tables: true };
    if (r.status === 401 || r.status === 403) return { msg: red("✗ Supabase didn't accept the key. It's SUPABASE_SERVICE_KEY in pc/.env."), tables: null };
    if (r.status === 404 || ['PGRST205', '42P01'].includes(r.body?.code)) return { msg: green('✓ Supabase works') + red(", but the Crux tables don't exist yet."), tables: false };
    return { msg: red(`✗ Couldn't reach Supabase (${r.status || r.body}).`), tables: null };
  },
  gemini: async (key) => {
    const r = await call('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash', { headers: { 'x-goog-api-key': key } });
    return r.ok ? green('✓ Gemini key works.') : red(`✗ Gemini didn't accept the key (${r.status}). aistudio.google.com → Get API key.`);
  },
  deepseek: async (key) => {
    const r = await call('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return red(`✗ DeepSeek didn't accept the key (${r.status}). platform.deepseek.com → API keys.`);
    const b = r.body.balance_infos?.[0];
    return green(`✓ DeepSeek key works. Balance: ${b ? `${b.total_balance} ${b.currency}` : 'unknown'}.`);
  },
};

// --- main ---------------------------------------------------------------------------------------------------
const pc = read(new URL('../pc/.env', import.meta.url));
const community = read(new URL('../community/.env', import.meta.url));
const env = read(ENV);
const todo = [];
console.log('Crux setup. Paste with right-click or Ctrl+V; secrets show as *. Ctrl+C cancels.');

env.DISCORD_TOKEN ||= pc.DISCORD_TOKEN;
env.SUPABASE_URL ||= pc.SUPABASE_URL;
env.SUPABASE_SERVICE_KEY ||= pc.SUPABASE_SERVICE_KEY;
env.GEMINI_API_KEY ||= community.GEMINI_API_KEY;
env.CRUX_SESSION_SECRET ||= randomBytes(32).toString('base64url');
env.CRON_SECRET ||= randomBytes(24).toString('base64url'); // Vercel's cron sends it to /api/cron/backup

console.log(dim('\n1. Your Discord user ID (Discord → Settings → Advanced → Developer Mode, then right-click your name → Copy User ID).'));
env.OWNER_ID = await ask('Your Discord user ID', { current: env.OWNER_ID });

console.log(dim('\n2. The bot token (reads members\' roles). From pc/.env unless you change it.'));
env.DISCORD_TOKEN = await ask('Bot token', { secret: true, current: env.DISCORD_TOKEN });
console.log(await checks.discord(env.DISCORD_TOKEN));

console.log(dim('\n3. The Crux app for sign-in: discord.com/developers/applications → Crux → OAuth2 → Client ID and Reset Secret.'));
env.CRUX_DISCORD_CLIENT_ID = await ask('Crux client ID', { current: env.CRUX_DISCORD_CLIENT_ID });
env.CRUX_DISCORD_CLIENT_SECRET = await ask('Crux client secret', { secret: true, current: env.CRUX_DISCORD_CLIENT_SECRET });
if (env.CRUX_DISCORD_CLIENT_ID && env.CRUX_DISCORD_CLIENT_SECRET) console.log(await checks.crux(env.CRUX_DISCORD_CLIENT_ID, env.CRUX_DISCORD_CLIENT_SECRET));
else todo.push('Create the Crux app in the Discord Developer Portal, then run setup-web.bat again.');

console.log(dim('\n4. Supabase (the bot\'s project). From pc/.env unless you change them.'));
env.SUPABASE_URL = await ask('Supabase Project URL', { current: env.SUPABASE_URL });
env.SUPABASE_SERVICE_KEY = await ask('Supabase secret key', { secret: true, current: env.SUPABASE_SERVICE_KEY });
let sb = await checks.supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
console.log(sb.msg);
if (sb.tables === false) {
  console.log(dim('The Crux tables can be made for you with a Supabase access token (used once, not saved):\nsupabase.com/dashboard/account/tokens → Generate new token. Or press Enter and paste supabase/crux.sql into the SQL Editor.'));
  const token = await ask('Supabase access token (starts with sbp_)', { secret: true });
  if (token) {
    const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0];
    const r = await call(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: readFileSync(SQL, 'utf8') }),
    });
    console.log(r.ok ? green('✓ Made the Crux tables.') : red(`✗ Couldn't make the tables (${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`));
    sb = await checks.supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }
  if (sb.tables === false) todo.push('Make the Crux tables: paste supabase/crux.sql into Supabase → SQL Editor → Run.');
}

console.log(dim('\n5. AI. Gemini comes from community/.env. DeepSeek is optional for now (Premium analysis).'));
env.GEMINI_API_KEY = await ask('Gemini API key', { secret: true, current: env.GEMINI_API_KEY });
if (env.GEMINI_API_KEY) console.log(await checks.gemini(env.GEMINI_API_KEY));
env.DEEPSEEK_API_KEY = await ask('DeepSeek API key (optional)', { secret: true, current: env.DEEPSEEK_API_KEY });
if (env.DEEPSEEK_API_KEY) console.log(await checks.deepseek(env.DEEPSEEK_API_KEY));

const KEYS = ['OWNER_ID', 'DISCORD_TOKEN', 'CRUX_DISCORD_CLIENT_ID', 'CRUX_DISCORD_CLIENT_SECRET', 'CRUX_SESSION_SECRET', 'CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'];
writeFileSync(ENV, ['# Crux settings. Made by setup-web.js; run it again to change anything. Git-ignored: never commit or share it.',
  ...KEYS.map((k) => `${k}=${env[k] || ''}`), `PORT=${env.PORT || 5190}`, ''].join('\n'));
console.log(green('\n✓ Saved study/.env'));

// --- Vercel ------------------------------------------------------------------------------------------------
console.log(dim('\n6. Vercel: a token copies these keys to the project "crux" (and makes the project if it isn\'t there).\n   vercel.com/account/tokens → Create Token. Used once, not saved. Press Enter to skip.'));
const vt = await ask('Vercel token', { secret: true });
if (vt) {
  const h = { Authorization: `Bearer ${vt}`, 'Content-Type': 'application/json' };
  const q = `teamId=${VERCEL.team}`;
  let project = await call(`https://api.vercel.com/v9/projects/${VERCEL.name}?${q}`, { headers: h });
  if (project.status === 404) {
    project = await call(`https://api.vercel.com/v11/projects?${q}`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ name: VERCEL.name, framework: 'vite', rootDirectory: 'study', outputDirectory: 'dist', gitRepository: { type: 'github', repo: VERCEL.repo } }),
    });
    console.log(project.ok ? green('✓ Made the Vercel project "crux" (root directory study/).') : red(`✗ Couldn't make the Vercel project (${project.status}): ${project.body?.error?.message || ''}`));
  }
  if (project.ok) {
    // Crux's API imports the bot's lib/ folder, outside study/: Vercel has to include it (can't be set on create)
    const r = await call(`https://api.vercel.com/v9/projects/${VERCEL.name}?${q}`, { method: 'PATCH', headers: h, body: JSON.stringify({ sourceFilesOutsideRootDirectory: true }) });
    console.log(r.ok ? green('✓ Vercel includes the files outside study/ that Crux needs.') : red(`✗ Couldn't set "Include files outside the root directory" (${r.status}). Turn it on in Vercel → crux → Settings → Build and Deployment.`));
  }
  if (project.ok) {
    let saved = 0;
    for (const key of KEYS.filter((k) => env[k])) {
      const r = await call(`https://api.vercel.com/v10/projects/${VERCEL.name}/env?upsert=true&${q}`, {
        method: 'POST', headers: h, body: JSON.stringify({ key, value: env[key], type: 'encrypted', target: ['production', 'preview'] }),
      });
      if (r.ok) saved++; else console.log(red(`✗ Vercel ${key} (${r.status}): ${r.body?.error?.message || ''}`));
    }
    console.log(green(`✓ ${saved} keys saved in Vercel. The next push to main deploys Crux with them.`));
    todo.push('In Vercel → crux → Settings → Domains, add crux.engineeringhub.site, then add the CNAME it shows at Namecheap.');
  }
} else todo.push('Run setup-web.bat again with a Vercel token to copy the keys to Vercel.');

if (todo.length) console.log(`\nStill to do:\n${todo.map((t, n) => `  ${n + 1}. ${t}`).join('\n')}`);
