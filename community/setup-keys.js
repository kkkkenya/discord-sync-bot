// Asks for the community bot's keys (hidden as you type), checks each one, and saves them to community/.env.
// Press Enter to keep a saved value. Run: double-click setup.bat.   `node setup-keys.js --check` only reports gaps.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { GUILD_ID } from '../lib/config.js';
import { MODEL } from './src/config.js';

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
const missing = KEYS.filter((k) => !env[k]);
console.log(missing.length ? red(`\nStill missing: ${missing.join(', ')}. Run setup again when you have them.`) : green("\n✓ Saved. Tell Claude you're done, or double-click start-bot.bat."));
process.exit(0);
