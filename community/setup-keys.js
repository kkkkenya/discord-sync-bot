// Asks for the community bot's keys (hidden as you type), checks each one, and saves them to community/.env.
// Press Enter to keep a saved value. Run: double-click setup.bat.   `node setup-keys.js --check` only reports gaps.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { GUILD_ID } from '../lib/config.js';
import { MODEL } from './src/config.js';

const PC_ENV = new URL('../pc/.env', import.meta.url);
const REPO = 'kkkkenya/discord-sync-bot';

const ENV = new URL('./.env', import.meta.url);
const read = () => (existsSync(ENV) ? Object.fromEntries(readFileSync(ENV, 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()])) : {});
const env = read();
const KEYS = ['COMMUNITY_DISCORD_TOKEN', 'GEMINI_API_KEY'];
if (process.argv.includes('--check')) process.exit(KEYS.every((k) => env[k]) ? 0 : 1);

const green = (s) => `\x1b[32m${s}\x1b[0m`; const red = (s) => `\x1b[31m${s}\x1b[0m`; const dim = (s) => `\x1b[2m${s}\x1b[0m`;
let ahead = '';
function ask(question, current = '') {
  process.stdout.write(`\n${question}${current ? dim(` (Enter keeps …${current.slice(-4)})`) : ''}\n> `);
  return new Promise((done) => {
    const stdin = process.stdin; let value = ''; let finished = false;
    const finish = () => { finished = true; stdin.off('data', onData); stdin.setRawMode?.(false); stdin.pause(); process.stdout.write('\n'); done(value.trim() || current); };
    function onData(chunk) {
      const text = ahead + chunk; ahead = '';
      for (let n = 0; n < text.length; n++) {
        const ch = text[n];
        if (ch === '\r' || ch === '\n') { ahead = text.slice(text[n + 1] === '\n' && ch === '\r' ? n + 2 : n + 1); return finish(); }
        if (ch === '\u0003') { process.stdout.write('\nCancelled, nothing saved.\n'); process.exit(1); }
        if (ch === '\u0008' || ch === '\u007f') { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        if (ch >= ' ') { value += ch; process.stdout.write('*'); }
      }
    }
    stdin.setRawMode?.(true); stdin.setEncoding('utf8'); stdin.on('data', onData);
    if (ahead) onData(''); if (!finished) stdin.resume();
  });
}
const get = (url, headers) => fetch(url, { headers }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ ok: false, status: 0, body: e.message }));

async function checkDiscord(token) {
  const h = { Authorization: `Bot ${token}` };
  const me = await get('https://discord.com/api/v10/users/@me', h);
  if (!me.ok) return { ok: false, msg: red("✗ Discord didn't accept that token. Copy it again (Bot → Reset Token).") };
  const lines = [green(`✓ Bot: ${me.body.username}`)];
  const app = await get('https://discord.com/api/v10/applications/@me', h);
  if (app.ok && app.body.id === '1550580619858284564') return { ok: false, msg: red('✗ That is the uploader\'s token. The community bot needs its own app (Developer Portal → New Application).') };
  if (app.ok && !(app.body.flags & ((1 << 18) | (1 << 19)))) lines.push(red('✗ Message Content Intent is off: Developer Portal → your app → Bot → turn on "Message Content Intent" → Save. Without it the bot can\'t read chat.'));
  const guild = await get(`https://discord.com/api/v10/guilds/${GUILD_ID}`, h);
  lines.push(guild.ok ? green(`✓ In the server: ${guild.body.name}`)
    : red(`✗ Not in the server yet. Invite it: https://discord.com/oauth2/authorize?client_id=${me.body.id}&scope=bot&permissions=397284550720`));
  return { ok: true, msg: lines.join('\n') };
}
async function checkGemini(key) {
  const r = await get(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`, { 'x-goog-api-key': key });
  return r.ok ? { ok: true, msg: green(`✓ Gemini key works (${MODEL}).`) } : { ok: false, msg: red(`✗ Gemini didn't accept that key (${r.status}: ${r.body?.error?.message || ''}).`) };
}
async function askChecked(question, current, check) {
  for (let first = true; ; first = false) {
    const value = await ask(question, first ? current : '');
    if (!value) return current;
    const r = await check(value);
    console.log(r.msg);
    if (r.ok) return value;
    console.log(dim('Try again, or press Enter to skip for now.'));
  }
}

console.log('Community bot: key setup. Paste with right-click or Ctrl+V; keys show as *. Ctrl+C cancels.');
console.log(dim('\n1. discord.com/developers/applications → New Application (e.g. "Hub Buddy") → Bot → Reset Token → Copy.\n   On the same page turn on "Message Content Intent".'));
env.COMMUNITY_DISCORD_TOKEN = await askChecked('Community bot token', env.COMMUNITY_DISCORD_TOKEN, checkDiscord);
console.log(dim('\n2. aistudio.google.com/apikey → Create API key → Copy.'));
env.GEMINI_API_KEY = await askChecked('Gemini API key', env.GEMINI_API_KEY, checkGemini);
writeFileSync(ENV, `# Community bot keys. Made by setup-keys.js; never commit or share this file.\nCOMMUNITY_DISCORD_TOKEN=${env.COMMUNITY_DISCORD_TOKEN || ''}\nGEMINI_API_KEY=${env.GEMINI_API_KEY || ''}\n`);

// 3. Supabase: the community_state table that remembers what's been posted (the uploader's keys are reused)
const pc = existsSync(PC_ENV) ? Object.fromEntries(readFileSync(PC_ENV, 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()])) : {};
const sbHead = { apikey: pc.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${pc.SUPABASE_SERVICE_KEY}` };
const hasTable = async () => (await get(`${pc.SUPABASE_URL}/rest/v1/community_state?select=key&limit=1`, sbHead)).ok;
if (!pc.SUPABASE_URL || !pc.SUPABASE_SERVICE_KEY) console.log(red('\n✗ pc/.env has no Supabase keys yet: run pc/setup.bat first, then this again.'));
else if (await hasTable()) console.log(green('\n✓ Supabase: the community_state table exists.'));
else {
  console.log(dim('\n3. The community_state table is missing. It can be made for you with a Supabase access token (used once, not\n   saved): supabase.com/dashboard/account/tokens → Generate new token. Or press Enter and paste the end of\n   supabase/schema.sql (from "Community bot memory") into the SQL Editor yourself.'));
  const token = await ask('Supabase access token (starts with sbp_)');
  if (token) {
    const ref = new URL(pc.SUPABASE_URL).hostname.split('.')[0];
    const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8').split('-- Community bot memory')[1];
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `--${sql}` }) });
    console.log(r.ok && await hasTable() ? green('✓ Created the community_state table.') : red(`✗ Couldn't create it (${r.status}). Paste the end of supabase/schema.sql into the SQL Editor.`));
  }
}

// 4. GitHub: the keys the daily posts need, stored as Actions secrets so posts go out with the PC off
console.log(dim(`\n4. So posts go out when your PC is off, the keys are stored as secrets in the GitHub repo ${REPO}.\n   github.com/settings/personal-access-tokens/new → Repository access: Only select repositories → discord-sync-bot\n   → Permissions: Secrets "Read and write" and Actions "Read and write" → Generate. Used once, not saved.\n   Press Enter to skip.`));
const gh = await ask('GitHub token (starts with github_pat_)');
if (gh && env.COMMUNITY_DISCORD_TOKEN && env.GEMINI_API_KEY && pc.SUPABASE_SERVICE_KEY) {
  const sodium = (await import('libsodium-wrappers')).default;
  await sodium.ready;
  const h = { Authorization: `Bearer ${gh}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const key = await get(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, h);
  if (!key.ok) console.log(red(`✗ GitHub didn't accept that token (${key.status}). It needs Secrets: Read and write on ${REPO}.`));
  else {
    const secrets = { COMMUNITY_DISCORD_TOKEN: env.COMMUNITY_DISCORD_TOKEN, GEMINI_API_KEY: env.GEMINI_API_KEY, SUPABASE_URL: pc.SUPABASE_URL, SUPABASE_SERVICE_KEY: pc.SUPABASE_SERVICE_KEY };
    for (const [name, value] of Object.entries(secrets)) {
      const sealed = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(key.body.key, sodium.base64_variants.ORIGINAL));
      const r = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${name}`, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL), key_id: key.body.key_id }) });
      console.log(r.ok ? green(`✓ GitHub secret ${name} saved`) : red(`✗ GitHub secret ${name} (${r.status})`));
    }
    const run = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/community-posts.yml/dispatches`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
    console.log(run.ok ? green("✓ Started a first run: anything due today gets posted in a minute or two.") : dim(`(Couldn't start a run now (${run.status}); the schedule takes over at the next post time.)`));
  }
}
const missing = KEYS.filter((k) => !env[k]);
console.log(missing.length ? red(`\nStill missing: ${missing.join(', ')}. Run setup again when you have them.`) : green("\n✓ Saved. Tell Claude you're done, or double-click start-bot.bat."));
process.exit(0);
