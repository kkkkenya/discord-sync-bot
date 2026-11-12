// Sends one announcement as a personal DM to every member, in stages: each run DMs the next third of the
// members who haven't had it yet (owner, 2026-11-12: "in stages across 3 days"). Run once a day for 3 days.
//
//   node announce/send.js desktop-2026-11 --dry-run   who would get it today, nothing sent
//   node announce/send.js desktop-2026-11             send today's stage
//
// The message is announce/<name>.md; {name} becomes the member's server nickname or Discord name.
// Skips bots and members who turned check-ins off (/nudges off). Members with DMs closed are noted, not retried.
// Progress is kept in data/announce-<name>.json, so nobody gets it twice and a crash can be re-run.
import { config } from 'dotenv';
import fs from 'node:fs';
config({ path: new URL('../.env', import.meta.url) });
const { api } = await import('../../lib/discord.js');
const { GUILD_ID } = await import('../../lib/config.js');
const { db } = await import('../../lib/db.js');

const name = process.argv[2];
const dry = process.argv.includes('--dry-run');
const STAGES = 3;
const GAP_MS = 3000; // one DM every 3 s, well inside Discord's limits
if (!name || !/^[\w-]+$/.test(name)) { console.error('Usage: node announce/send.js <name> [--dry-run]'); process.exit(1); }
const text = fs.readFileSync(new URL(`./${name}.md`, import.meta.url), 'utf8').trim();
const stateFile = new URL(`../data/announce-${name}.json`, import.meta.url);
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { sent: {}, closed: {}, stages: [] };
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));

// every member, in pages of 1000
const members = [];
for (let after = '0'; ;) {
  const page = await api('GET', `/guilds/${GUILD_ID}/members?limit=1000&after=${after}`);
  members.push(...page);
  if (page.length < 1000) break;
  after = page.at(-1).user.id;
}
const optedOut = new Set((await db.select('prefs', 'nudges=eq.false&select=user_id').catch(() => [])).map((p) => p.user_id));
const everyone = members.filter((m) => !m.user.bot).sort((a, b) => a.user.id.localeCompare(b.user.id));
const left = everyone.filter((m) => !optedOut.has(m.user.id) && !state.sent[m.user.id] && !state.closed[m.user.id]);
const stagesLeft = Math.max(1, STAGES - state.stages.length);
const today = left.slice(0, Math.ceil(left.length / stagesLeft));
const display = (m) => m.nick || m.user.global_name || m.user.username;

console.log(`${everyone.length} members, ${optedOut.size} opted out, ${Object.keys(state.sent).length} already sent, ${Object.keys(state.closed).length} with DMs closed.`);
console.log(`Stage ${state.stages.length + 1} of ${STAGES}: ${today.length} DMs today${dry ? ' (dry run, nothing sent)' : ''}.`);
if (dry) {
  console.log(`First few: ${today.slice(0, 5).map(display).join(', ')}`);
  console.log(`\n--- the message, for ${display(today[0] ?? everyone[0])} ---\n${text.replaceAll('{name}', display(today[0] ?? everyone[0]))}`);
  process.exit(0);
}

let sent = 0, closed = 0;
for (const m of today) {
  try {
    const channel = await api('POST', '/users/@me/channels', { recipient_id: m.user.id });
    await api('POST', `/channels/${channel.id}/messages`, { content: text.replaceAll('{name}', display(m)), allowed_mentions: { parse: [] } });
    state.sent[m.user.id] = new Date().toISOString();
    sent++;
  } catch (e) {
    // 50007: the member doesn't accept DMs from server members
    if (String(e.message).includes('50007') || String(e.message).includes('403')) { state.closed[m.user.id] = new Date().toISOString(); closed++; }
    else console.error(`${display(m)}: ${e.message}`);
  }
  save();
  await new Promise((r) => setTimeout(r, GAP_MS));
}
state.stages.push({ at: new Date().toISOString(), sent, closed });
save();
console.log(`Done: ${sent} sent, ${closed} with DMs closed.`);
