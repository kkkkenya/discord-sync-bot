// Sends whatever daily posts are due and not yet sent today. Run by GitHub Actions a few times a day
// (.github/workflows/community-posts.yml), so posts go out with the PC off. Safe to run any number of times.
//   node scheduler.js            due jobs only
//   node scheduler.js --now      every job that hasn't run today, ignoring the times (for a first test)
import { config } from 'dotenv';
config({ path: new URL('./.env', import.meta.url), quiet: true });
config({ path: new URL('../pc/.env', import.meta.url), quiet: true }); // Supabase keys, when run on the PC

const { SCHEDULE } = await import('./src/config.js');
const { JOBS } = await import('./src/posts.js');
const { load, nairobiDay, nairobiMinutes, store } = await import('./src/rest.js');

const missingKeys = ['COMMUNITY_DISCORD_TOKEN', 'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter((k) => !process.env[k]);
if (missingKeys.length) { console.log(`Not set up yet (missing ${missingKeys.join(', ')}): nothing posted. Run community/setup.bat.`); process.exit(0); }
const now = process.argv.includes('--now');
const day = nairobiDay();
const minutes = nairobiMinutes();
const done = await load('done', {});
let failed = false;
for (const { job, at } of SCHEDULE) {
  const [h, m] = at.split(':').map(Number);
  if (done[job] === day || (!now && minutes < h * 60 + m)) continue;
  if (now && job === 'reveal' && minutes < h * 60 + m) continue; // a test run never gives the trivia answer away early
  try {
    await JOBS[job]();
    done[job] = day;
    await store('done', done);
    console.log(`${job}: done`);
  } catch (e) {
    failed = true;
    console.error(`${job} failed: ${e.message}`); // left undone: the next run tries again
  }
}
process.exit(failed ? 1 : 0);
