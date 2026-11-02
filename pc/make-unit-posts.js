// Makes the server match KU's timetable (lib/timetable.json): a post for every timetabled unit in its department's
// year forum ("EEE 305 — Digital Electronics I"), and the year forum itself when it's missing (copied from the
// department's other years: same category, permissions and tags). A unit that already has a post anywhere is left
// alone, so files never split across two posts. Then lib/threads.json is saved again from the live server.
//   node make-unit-posts.js           shows what it would do, changes nothing
//   node make-unit-posts.js --go      does it
//   node make-unit-posts.js --go --titles   also adds the title to posts named by code only ("EEE 305")
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
config({ path: new URL('./.env', import.meta.url), quiet: true });
const { api, sleep } = await import('../lib/discord.js');
const { GUILD_ID } = await import('../lib/config.js');
const { PostIndex } = await import('./src/uploader/posts.js');
const TIMETABLE = (await import('../lib/timetable.json', { with: { type: 'json' } })).default;

const GO = process.argv.includes('--go');
const TITLES = process.argv.includes('--titles');
if (!process.env.DISCORD_TOKEN) { console.error('No DISCORD_TOKEN in pc/.env. Run setup.bat first.'); process.exit(1); }

const FORUM = 15;
const channels = await api('GET', `/guilds/${GUILD_ID}/channels`);
const forums = channels.filter((c) => c.type === FORUM);
const index = new PostIndex(null);
for (const f of forums) index.forums.set(f.name, f);

// every post: the active ones, then each forum's archived ones
const threads = [];
const active = await api('GET', `/guilds/${GUILD_ID}/threads/active`);
for (const t of active.threads) { const f = forums.find((x) => x.id === t.parent_id); if (f) threads.push({ t, f }); }
for (const f of forums) {
  for (let before = ''; ;) {
    const page = await api('GET', `/channels/${f.id}/threads/archived/public?limit=100${before ? `&before=${before}` : ''}`);
    for (const t of page.threads) threads.push({ t, f });
    if (!page.has_more || !page.threads.length) break;
    before = page.threads.at(-1).thread_metadata.archive_timestamp;
  }
}
for (const { t, f } of threads) index.add({ id: t.id, name: t.name }, f);
console.log(`The server has ${forums.length} forums and ${threads.length} posts.`);

// what's missing
const forumPlan = new Map(); // forum name -> the sibling forum to copy
const postPlan = []; // { code, title, forum }
const renamePlan = []; // { thread, name }
for (const [code, title] of Object.entries(TIMETABLE.titles)) {
  const posts = index.byCode.get(code) || [];
  if (posts.length) {
    for (const p of posts) if (TITLES && p.name.trim() === code) renamePlan.push({ id: p.id, name: `${code} — ${title}`, forum: p.forum });
    continue;
  }
  let forum = index.forumFor(code);
  if (!forum) {
    // its year forum doesn't exist yet: name it like the department's others (eee-year-3 → eee-year-5)
    const probe = new PostIndex(null);
    probe.forums = { get: (name) => ({ name }) }; // any forum "exists", so forumFor just names it
    const name = probe.forumFor(code)?.name;
    const sibling = name && forums.find((f) => f.name.replace(/\d+$/, '') === name.replace(/\d+$/, ''));
    if (!name || !sibling) { console.log(`  ${code}: no forum rule for it, skipped`); continue; }
    forumPlan.set(name, sibling);
    forum = { name };
  }
  postPlan.push({ code, title, forum: forum.name });
}

console.log(`\nForums to make (${forumPlan.size}):`);
for (const [name, sib] of forumPlan) console.log(`  #${name} (copied from #${sib.name})`);
console.log(`\nPosts to make (${postPlan.length}):`);
for (const p of postPlan) console.log(`  #${p.forum}: ${p.code} — ${p.title}`);
if (TITLES) {
  console.log(`\nPosts to give a title (${renamePlan.length}):`);
  for (const r of renamePlan) console.log(`  #${r.forum}: ${r.name}`);
}
if (!GO) { console.log('\nNothing changed. Run with --go to make them.'); process.exit(0); }

for (const [name, sib] of forumPlan) {
  const made = await api('POST', `/guilds/${GUILD_ID}/channels`, {
    name, type: FORUM, parent_id: sib.parent_id, topic: sib.topic?.replace(/year\s*\d/i, `year ${name.match(/\d+$/)[0]}`) || null,
    permission_overwrites: sib.permission_overwrites, available_tags: (sib.available_tags || []).map(({ name: n, emoji_id, emoji_name, moderated }) => ({ name: n, emoji_id, emoji_name, moderated })),
    default_sort_order: sib.default_sort_order ?? null, default_forum_layout: sib.default_forum_layout ?? 0,
  });
  index.forums.set(name, made);
  console.log(`Made #${name}`);
}
for (const p of postPlan) {
  const forum = index.forums.get(p.forum);
  const t = await api('POST', `/channels/${forum.id}/threads`, {
    name: `${p.code} — ${p.title}`.slice(0, 100),
    message: { content: `**${p.code} — ${p.title}**: past papers, CATs and notes. New files for this unit land here automatically.` },
  });
  index.add({ id: t.id, name: t.name }, forum);
  console.log(`Posted ${t.name} in #${p.forum}`);
  await sleep(1200); // stay well inside Discord's rate limit for new threads
}
for (const r of renamePlan) {
  await api('PATCH', `/channels/${r.id}`, { name: r.name.slice(0, 100), archived: false }); // an archived post can't be renamed
  console.log(`Renamed to ${r.name}`);
  await sleep(1200);
}

// the saved post list, for the offline preview and make-units.js
const saved = {};
for (const [code, posts] of index.byCode) saved[code] = posts.map((p) => ({ id: p.id, name: p.name, forum: p.forum }));
writeFileSync(new URL('../lib/threads.json', import.meta.url), `${JSON.stringify(saved, null, 1)}\n`);
console.log(`\nDone. lib/threads.json saved (${Object.keys(saved).length} unit codes).`);
