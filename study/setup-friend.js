// Setup for a friend's Study Desk: links this laptop to the Study Hub with a code, picks the AI (the Study Hub's, free
// for now with a daily allowance, or your own key, hidden as you type and checked once), and connects Discord.
// Writes study/.env. None of the Study Hub's own keys are ever on this laptop. Press Enter to keep what's saved.
import { green, red, dim, bold, NAMES, readEnv, writeEnv, ask, askKey, askPort } from './setup-lib.js';

const ENV = new URL('./.env', import.meta.url);
const saved = readEnv(ENV);
const HUB = process.env.STUDY_HUB_URL || saved.STUDY_HUB_URL || 'https://discord-sync-bot.vercel.app/api/study';

const call = async (action, body = {}, token = '') => {
  let r;
  try {
    r = await fetch(HUB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ action, ...body }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new Error('Couldn’t reach the Study Hub. Check your internet and try again.'); }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(out.error || `The Study Hub answered ${r.status}.`), { status: r.status });
  return out;
};

console.log(bold('\nStudy Desk setup'));
console.log('This links your Study Desk to the Study Hub. Your study data stays on this laptop.');

// 1. the code
let token = saved.STUDY_HUB_TOKEN || '';
let me = null;
if (token) {
  try { me = await call('me', {}, token); } catch (e) {
    if (e.status !== 401 && e.status !== 403) { console.log(red(e.message)); process.exit(1); } // offline or Hub trouble: don't pretend the link is bad
    console.log(dim('\nYour saved link is no longer valid, so you need a new code.'));
    token = '';
  }
}
if (me) console.log(green(`\nLinked as ${me.name}.`) + dim(' Enter a new code only if you were given one.'));
let question = me
  ? 'New Study Desk code (Enter to keep this link):'
  : 'Your Study Desk code (from the person who invited you, or /study link in Discord if you have Premium), like SD-7K2M-9QXA:';
for (let tries = 0; tries < 3; tries++) {
  const code = (await ask(question)).replace(/\s+/g, '').toUpperCase();
  if (!code) break;
  let out;
  try { out = await call('link', { code }); } catch (e) {
    console.log(red(e.message));
    question = me ? 'Try the code again (Enter to keep your current link):' : 'Try the code again (a code works once; ask for a new one if it still fails):';
    continue;
  }
  token = out.token;
  writeEnv(ENV, { ...saved, STUDY_HUB_TOKEN: token }); // the code is single-use and the old token is dead now: keep the new link before anything else can fail
  try { me = await call('me', {}, token); } catch (e) {
    console.log(red(e.message));
    console.log('Your code worked and the link is saved. Run setup again and press Enter at the code prompt to finish.');
    process.exit(1);
  }
  console.log(green(`✓ Linked. Welcome, ${out.name}.`));
  break;
}
if (!me) { console.log(red('\nA code is needed the first time. Ask the person who invited you, then run setup again.')); process.exit(1); }

// 2. the AI
const allowance = me.aiDailyCap ? `${me.aiDailyCap} AI actions a day` : 'a daily allowance of AI actions';
console.log(`\n${bold('Which AI should Study Desk use?')} It writes study kits, checks answers step by step, marks teach-backs and reads photos and voice.`);
console.log(`  1  The Study Hub's AI: nothing to set up. ${green(`Free for now, ${allowance}`)} (a check, a study kit, a marked teach-back each count as one).`);
console.log(dim('     Later this becomes part of the Study Hub Premium plan; you’ll be told in Discord before anything changes, and you can switch to your own key any time.'));
console.log('  2  Your own Gemini key: free from Google (aistudio.google.com → Get API key), no daily limit from us. Best if you study a lot.');
console.log('  3  Your own DeepSeek key (platform.deepseek.com, paid by you, very cheap). Can’t read photos or voice.');
console.log('  4  Your own Claude key (console.anthropic.com, paid by you). Reads photos, not voice.');
const pickNow = { hub: '1', gemini: '2', deepseek: '3', anthropic: '4' }[saved.AI_PROVIDER] || '1';
let pick = '';
while (!['1', '2', '3', '4'].includes(pick)) pick = await ask('Pick 1, 2, 3 or 4:', { current: pickNow });
const AI_PROVIDER = { 1: 'hub', 2: 'gemini', 3: 'deepseek', 4: 'anthropic' }[pick];
const KEY = { gemini: 'GEMINI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', anthropic: 'ANTHROPIC_API_KEY' }[AI_PROVIDER];
const keys = { GEMINI_API_KEY: saved.GEMINI_API_KEY || '', DEEPSEEK_API_KEY: saved.DEEPSEEK_API_KEY || '', ANTHROPIC_API_KEY: saved.ANTHROPIC_API_KEY || '' };
if (KEY) {
  keys[KEY] = await askKey(AI_PROVIDER, `Paste your ${NAMES[AI_PROVIDER]} API key (shown as * as you type):`, keys[KEY]);
  if (!keys[KEY]) console.log(dim('No working key given: Study Desk will use the Study Hub’s AI until you add one.'));
}

// 3. the port
const PORT = await askPort(saved.PORT || '5190');

writeEnv(ENV, { ...saved, STUDY_HUB_TOKEN: token, AI_PROVIDER: KEY && !keys[KEY] ? 'hub' : AI_PROVIDER, PORT, ...keys });
console.log(green('\nSaved. Your settings are in study\\.env on this laptop only.'));

// 4. Discord
if (me.discordLinked) console.log(green('Discord is connected: /study commands and your morning plan DM work while Study Desk is open.'));
else if ((await ask('Connect Discord now, for /study commands and a morning plan DM? (Y/n)')).toLowerCase() !== 'n') {
  try {
    const { code: pair, minutes } = await call('pair', {}, token);
    console.log(`\nIn the Study Hub Discord server (or a DM with the bot), type:\n\n   ${bold(`/study connect code:${pair}`)}\n\n${dim(`The code works for ${minutes} minutes. You can also do it later in Study Desk: Settings → Connect Discord.`)}`);
  } catch (e) { console.log(red(e.message)); }
}
console.log(`\nStart Study Desk from the ${bold('Study Desk')} shortcut on your desktop or Start menu.`);
