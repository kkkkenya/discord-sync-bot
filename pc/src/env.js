// Imported first by index.js: loads pc/.env before anything reads process.env. Logs are kept by the supervisor
// (ops/supervise.js) in pc/data/logs/; `npm start` prints to the console only.
import { config } from 'dotenv';
import { mkdirSync } from 'node:fs';

config({ path: new URL('../.env', import.meta.url), quiet: true });

const DATA = new URL('../data/', import.meta.url);
mkdirSync(DATA, { recursive: true });
process.on('uncaughtException', (e) => { console.error('Crashed:', e); process.exit(1); });

for (const key of ['DISCORD_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in pc/.env. Run setup.bat (or: npm run setup) to add your keys.`);
    process.exit(1);
  }
}
