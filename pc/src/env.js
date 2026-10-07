// Imported first by index.js: loads pc/.env before anything reads process.env, and copies everything the bot
// prints to pc/data/bot.log (the window can be closed or minimised, the log stays).
import { config } from 'dotenv';
import { appendFileSync, mkdirSync } from 'node:fs';

config({ path: new URL('../.env', import.meta.url), quiet: true });

const DATA = new URL('../data/', import.meta.url);
mkdirSync(DATA, { recursive: true });
const LOG = new URL('bot.log', DATA);
const text = (x) => (x instanceof Error ? x.stack || x.message : typeof x === 'string' ? x : JSON.stringify(x));
for (const level of ['log', 'warn', 'error']) {
  const print = console[level].bind(console);
  console[level] = (...args) => {
    print(...args);
    try { appendFileSync(LOG, `${new Date().toISOString()} ${level === 'log' ? '' : `${level.toUpperCase()} `}${args.map(text).join(' ')}\n`); } catch { /* log file busy */ }
  };
}
process.on('uncaughtException', (e) => { console.error('Crashed:', e); process.exit(1); });

for (const key of ['DISCORD_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in pc/.env. Run setup.bat (or: npm run setup) to add your keys.`);
    process.exit(1);
  }
}
