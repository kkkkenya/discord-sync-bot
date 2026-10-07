// Asks for the bot's keys (typed or pasted, hidden as you type), checks each one, and saves them to pc/.env.
// Press Enter to keep a value that's already saved. Optional extras, each asked for once and never saved:
//   - a Supabase access token, to create the bot's tables for you if they're missing
//   - a Vercel token, to copy the keys into Vercel and redeploy (so payments keep working after a token reset)
// Run: double-click setup.bat, or `npm run setup`.   `node setup-keys.js --check` only reports what's missing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { APP_ID, FEATURES, GUILD_ID } from '../lib/config.js';

const ENV = new URL('./.env', import.meta.url);
const SCHEMA = new URL('../supabase/schema.sql', import.meta.url);
const VERCEL = { project: 'prj_mnHQAPnzdEo3n77H5wwKSjVegwcP', team: 'team_JEJX6rJON0objLeKGaREgeT1', name: 'discord-sync-bot' };
const REQUIRED = ['DISCORD_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', ...(FEATURES.dailyProblems ? ['ANTHROPIC_API_KEY'] : [])];

const read = () => {
  if (!existsSync(ENV)) return {};
  return Object.fromEntries(readFileSync(ENV, 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
};

if (process.argv.includes('--check')) {
  const env = read();
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) console.log(`Missing in pc/.env: ${missing.join(', ')}`);
  process.exit(missing.length ? 1 : 0);
}

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const mask = (v) => (v ? `…${v.slice(-4)}` : '');

// One line of input. Secret answers show * instead of the characters. Typing that arrives ahead of the
// question (a paste with line breaks, or answers piped in) is kept for the next question.
let ahead = '';
function ask(question, { secret = false, current = '' } = {}) {
  const keep = current ? dim(` (Enter keeps ${secret ? mask(current) : current})`) : '';
  process.stdout.write(`\n${question}${keep}\n> `);
  return new Promise((done) => {
    const stdin = process.stdin;
    let value = '';
    let finished = false;
    const finish = () => {
      finished = true;
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
        if (ch === '\r' || ch === '\n') {
          ahead = text.slice(text[n + 1] === '\n' && ch === '\r' ? n + 2 : n + 1);
          return finish();
        }
        if (ch === '\u0003') { process.stdout.write('\nCancelled, nothing saved.\n'); process.exit(1); } // Ctrl+C
        if (ch === '\u0008' || ch === '\u007f') { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        if (ch < ' ') continue;
        value += ch;
        process.stdout.write(secret ? '*' : ch);
      }
    }
    stdin.setRawMode?.(true);
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    if (ahead) onData(''); // answer already typed
    if (!finished) stdin.resume();
  });
}
const yes = async (question) => /^y/i.test(await ask(`${question} [y/N]`));

async function call(url, options = {}) {
  try {
    const r = await fetch(url, options);
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, ok: r.ok, body };
  } catch (e) {
    return { status: 0, ok: false, body: e.message };
  }
}

// ── checks: each returns { ok, msg } (ok false = don't keep the value) and may add to `todo` ──
const todo = []; // things to fix that aren't a wrong key (shown at the end)

async function checkDiscord(token) {
  const h = { Authorization: `Bot ${token}` };
  const me = await call('https://discord.com/api/v10/users/@me', { headers: h });
  if (!me.ok) return { ok: false, msg: red(me.status === 401 ? "✗ Discord didn't accept that token. Copy it again (Bot → Reset Token)." : `✗ Couldn't reach Discord (${me.status}).`) };
  const app = await call('https://discord.com/api/v10/applications/@me', { headers: h });
  if (app.ok && app.body.id !== APP_ID) return { ok: false, msg: red(`✗ This token is for a different app (${app.body.name}). Use the app with ID ${APP_ID}, the one Vercel uses.`) };
  const lines = [green(`✓ Bot: ${me.body.username}`)];
  if (app.ok && !(app.body.flags & ((1 << 14) | (1 << 15)))) {
    lines.push(red('✗ Server Members Intent is off. Developer Portal → Bot → turn on "Server Members Intent" → Save.'));
    todo.push('Turn on Server Members Intent (Developer Portal → Bot).');
  }
  const guild = await call(`https://discord.com/api/v10/guilds/${GUILD_ID}`, { headers: h });
  if (guild.ok) lines.push(green(`✓ In the server: ${guild.body.name}`));
  else { lines.push(red("✗ The bot isn't in the Engineering Study Hub server.")); todo.push('Invite the bot to the server.'); }
  return { ok: true, msg: lines.join('\n') };
}

async function checkSupabase(url, key) {
  if (key.startsWith('sb_publishable_')) return { ok: false, msg: red('✗ That is the publishable key. The bot needs the secret key (starts with sb_secret_).') };
  const r = await call(`${url}/rest/v1/files?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (r.ok) return { ok: true, tables: true, msg: green("✓ Supabase key works and the bot's tables exist.") };
  const code = r.body?.code || '';
  if (r.status === 404 || code === 'PGRST205' || code === '42P01') return { ok: true, tables: false, msg: green('✓ Supabase key works') + red(", but the bot's tables don't exist yet.") };
  if (r.status === 401 || r.status === 403) return { ok: false, msg: red("✗ Supabase didn't accept that key. Copy the secret key again.") };
  return { ok: false, msg: red(`✗ Couldn't reach ${url} (${r.status || r.body}). Check the Project URL.`) };
}

// Ask until the value passes its check. Enter on its own keeps the saved value (or leaves it empty).
async function askChecked(question, { secret, current }, check) {
  for (let first = true; ; first = false) {
    const value = await ask(question, { secret, current: first ? current : '' });
    if (!value) return current;
    if (value === current && !first) return current;
    const result = await check(value);
    console.log(result.msg);
    if (result.ok) return value;
    console.log(dim('Try again, or press Enter to skip for now.'));
  }
}

async function createTables(url) {
  console.log(dim('\nThe tables can be made for you with a Supabase access token (used once, not saved):\nsupabase.com/dashboard/account/tokens → Generate new token. Or press Enter and paste supabase/schema.sql into the SQL Editor yourself.'));
  const token = await ask('Supabase access token (starts with sbp_)', { secret: true });
  if (!token) return;
  const ref = new URL(url).hostname.split('.')[0];
  const r = await call(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: readFileSync(SCHEMA, 'utf8') }),
  });
  console.log(r.ok ? green('✓ Created the bot\'s tables.') : red(`✗ Couldn't create the tables (${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`));
}

async function checkAnthropic(key) {
  const r = await call('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
  return r.ok ? { ok: true, msg: green('✓ Anthropic key works.') } : { ok: false, msg: red(`✗ Anthropic didn't accept that key (${r.status}).`) };
}

function checkFolders(value) {
  const dirs = value.split(';').map((d) => d.trim()).filter(Boolean);
  if (!dirs.length) return dim('No folders: the uploader stays off until you add one.');
  return dirs.map((d) => (existsSync(d) ? green(`✓ ${d}`) : red(`✗ Not found: ${d}`))).join('\n');
}

async function syncVercel(env) {
  console.log(dim('\nThis needs a Vercel token (used once, not saved): vercel.com/account/tokens → Create Token.'));
  const token = await ask('Vercel token', { secret: true });
  if (!token) return;
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const q = `teamId=${VERCEL.team}`;
  for (const key of ['DISCORD_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
    const r = await call(`https://api.vercel.com/v10/projects/${VERCEL.project}/env?upsert=true&${q}`, {
      method: 'POST', headers: h, body: JSON.stringify({ key, value: env[key], type: 'encrypted', target: ['production', 'preview'] }),
    });
    console.log(r.ok ? green(`✓ Vercel ${key} saved`) : red(`✗ Vercel ${key} (${r.status}): ${r.body?.error?.message || ''}`));
    if (!r.ok) return;
  }
  const list = await call(`https://api.vercel.com/v6/deployments?projectId=${VERCEL.project}&target=production&limit=1&${q}`, { headers: h });
  const latest = list.body?.deployments?.[0]?.uid;
  if (!latest) { console.log(red('✗ No production deployment found to redeploy. Redeploy from the Vercel dashboard.')); return; }
  const re = await call(`https://api.vercel.com/v13/deployments?${q}`, {
    method: 'POST', headers: h, body: JSON.stringify({ name: VERCEL.name, deploymentId: latest, target: 'production' }),
  });
  console.log(re.ok ? green('✓ Redeploying on Vercel with the new keys (takes about a minute).') : red(`✗ Redeploy failed (${re.status}). Redeploy from the Vercel dashboard.`));
}

function save(env) {
  writeFileSync(ENV, [
    '# Engineering Study Hub PC bot settings. Made by setup-keys.js; run it again to change anything.',
    '# This file is git-ignored: never commit it or share it.',
    '',
    `DISCORD_TOKEN=${env.DISCORD_TOKEN || ''}`,
    `SUPABASE_URL=${env.SUPABASE_URL || ''}`,
    `SUPABASE_SERVICE_KEY=${env.SUPABASE_SERVICE_KEY || ''}`,
    `ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY || ''}`,
    '',
    '# Folders of notes, past papers and books, separated by ;  Drive shortcuts (.lnk) inside them are followed.',
    `WATCH_DIRS=${env.WATCH_DIRS || ''}`,
    `BOOK_MB=${env.BOOK_MB || 15}`,
    `BOOK_PAGES=${env.BOOK_PAGES || 150}`,
    '',
  ].join('\n'));
}

// ── main ──
const env = read();
console.log('Engineering Study Hub bot: key setup. Paste with right-click or Ctrl+V; secrets show as *. Ctrl+C cancels.');

console.log(dim('\n1. Discord: Developer Portal → your app → Bot → Reset Token → Copy.'));
const oldToken = env.DISCORD_TOKEN;
env.DISCORD_TOKEN = await askChecked('Discord bot token', { secret: true, current: env.DISCORD_TOKEN }, checkDiscord);

console.log(dim('\n2. Supabase: Project Settings → API Keys.'));
env.SUPABASE_URL = (await ask('Supabase Project URL', { current: env.SUPABASE_URL })).replace(/\/+$/, '');
env.SUPABASE_SERVICE_KEY = await askChecked('Supabase secret key (starts with sb_secret_)', { secret: true, current: env.SUPABASE_SERVICE_KEY },
  (key) => checkSupabase(env.SUPABASE_URL, key));
if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY && (await checkSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)).tables === false) {
  await createTables(env.SUPABASE_URL);
  const again = await checkSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  console.log(again.msg);
  if (again.tables === false) todo.push("Create the bot's tables: paste supabase/schema.sql into Supabase → SQL Editor → Run.");
}

if (FEATURES.dailyProblems) {
  console.log(dim('\n3. Anthropic: console.anthropic.com → API keys.'));
  env.ANTHROPIC_API_KEY = await askChecked('Anthropic API key', { secret: true, current: env.ANTHROPIC_API_KEY }, checkAnthropic);
}

console.log(dim('\nFolders to upload from, separated by ; (not the folder with the bot\'s code).'));
env.WATCH_DIRS = await ask('Watch folders', { current: env.WATCH_DIRS });
console.log(checkFolders(env.WATCH_DIRS));

save(env);
console.log(green('\n✓ Saved pc/.env'));

if (env.DISCORD_TOKEN && env.SUPABASE_SERVICE_KEY) {
  const changed = env.DISCORD_TOKEN !== oldToken;
  const why = changed ? 'The Discord token changed: until Vercel has it, payments and commands stop working.' : 'Do this whenever the token or Supabase keys change.';
  if (await yes(`\nCopy the Discord token and Supabase keys to Vercel too, and redeploy? ${why}`)) await syncVercel(env);
  else if (changed) todo.push('Put the new DISCORD_TOKEN (and SUPABASE_URL, SUPABASE_SERVICE_KEY) in Vercel → Settings → Environment Variables, then redeploy.');
}
const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) todo.unshift(`Add ${missing.join(', ')} (run setup again when you have ${missing.length === 1 ? 'it' : 'them'}).`);
console.log(todo.length ? red(`\nStill to do:\n${todo.map((t) => `  • ${t}`).join('\n')}`) : green("\nAll set. Tell Claude you're done, or start the bot with start-bot.bat."));
process.exit(0);
