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
const { dueJobs } = await import('./src/due.js');

const missingKeys = ['COMMUNITY_DISCORD_TOKEN', 'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter((k) => !process.env[k]);
if (missingKeys.length) { console.error(`Not set up (missing ${missingKeys.join(', ')}): nothing posted. Run community/setup.bat.`); process.exit(1); } // red run, not a silent green one
const day = nairobiDay();
const done = await load('done', {});
const due = dueJobs(SCHEDULE, done, day, nairobiMinutes(), { now: process.argv.includes('--now') });
const sent = [], waiting = [];
let failed = false;
for (const job of due) {
  try {
    if (await JOBS[job]() === false) { waiting.push(job); continue; } // not ready yet: the next run tries again
    done[job] = day;
    await store('done', done);
    sent.push(job);
  } catch (e) {
    failed = true;
    console.error(`${job} failed: ${e.message}`); // left undone: the next run tries again
  }
}
console.log(`${day} due: ${due.join(', ') || 'none'} | done: ${sent.join(', ') || 'none'} | waiting: ${waiting.join(', ') || 'none'}`);
process.exit(failed ? 1 : 0);
