// Sends one announcement as a personal DM to every member, in stages: each run DMs the next third of the
// members who haven't had it yet. Run once a day for 3 days, here or from the local dashboard (ops/dashboard).
//
//   node announce/send.js desktop-2026-11 --dry-run   who would get it today, nothing sent
//   node announce/send.js desktop-2026-11             send today's stage
//
// The message is announce/<name>.md; {name} becomes the member's server nickname or Discord name.
import { config } from 'dotenv';
config({ path: new URL('../.env', import.meta.url) });
const { plan, sendStage, validName } = await import('./stage.js');

const name = process.argv[2];
if (!validName(name)) { console.error('Usage: node announce/send.js <name> [--dry-run]'); process.exit(1); }
const { summary: s } = await plan(name);
console.log(`${s.members} members, ${s.optedOut} opted out, ${s.sent} already sent, ${s.closed} with DMs closed.`);
console.log(`Stage ${s.stage} of ${s.stages}: ${s.todayCount} DMs today${process.argv.includes('--dry-run') ? ' (dry run, nothing sent)' : ''}.`);
if (process.argv.includes('--dry-run')) {
  console.log(`First few: ${s.firstFew.join(', ')}\n\n--- the message ---\n${s.preview}`);
  process.exit(0);
}
const r = await sendStage(name, { onProgress: ({ done, total }) => { if (done % 10 === 0 || done === total) console.log(`${done}/${total}`); } });
console.log(`Done: ${r.sent} sent, ${r.closed} with DMs closed.${r.failed.length ? `\nFailed:\n${r.failed.join('\n')}` : ''}`);
