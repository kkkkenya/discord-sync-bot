// Copies the daily-post keys from community/.env and pc/.env into the repo's Actions secrets with the gh CLI
// (needs `gh auth login` once). Values go through stdin only: never in arguments or output.
//   node push-secrets.js
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const REPO = 'kkkkenya/discord-sync-bot';
const read = (f) => { try { return parse(readFileSync(new URL(f, import.meta.url))); } catch { return {}; } };
const community = read('./.env'), pc = read('../pc/.env');
const secrets = {
  COMMUNITY_DISCORD_TOKEN: community.COMMUNITY_DISCORD_TOKEN,
  GEMINI_API_KEY: community.GEMINI_API_KEY,
  SUPABASE_URL: pc.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: pc.SUPABASE_SERVICE_KEY,
};
let failed = false;
for (const [name, value] of Object.entries(secrets)) {
  if (!value) { console.error(`✗ ${name} is empty in .env: run setup.bat first`); failed = true; continue; }
  try {
    execFileSync('gh', ['secret', 'set', name, '--repo', REPO], { input: value, stdio: ['pipe', 'ignore', 'pipe'] });
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
