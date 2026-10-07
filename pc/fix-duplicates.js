// Cleans up after uploads that timed out:
//   1. Copies the bot posted of files that were already on the server: listed, then deleted only if you type y.
//   2. Files in #to-sort that lost their note (so they have no Sort buttons): given a note again.
// Only the bot's own messages from its uploads are ever touched; files people posted are never deleted.
// Run: double-click fix-duplicates.bat, or `node fix-duplicates.js`.
import { config } from 'dotenv';
import { createInterface } from 'node:readline/promises';
config({ path: new URL('./.env', import.meta.url), quiet: true });
const { api } = await import('../lib/discord.js');
const { db } = await import('../lib/db.js');
const { CHANNELS, GUILD_ID } = await import('../lib/config.js');
const { fingerprint } = await import('./src/uploader/existing.js');

const when = (id) => Number((BigInt(id) >> 22n) + 1420070400000n);
const me = await api('GET', '/users/@me');

async function allRows() {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await db.select('files', `select=id,hash,name,size,channel_id,message_id,dest_name,created_at&order=id.asc&limit=1000&offset=${offset}`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
const rows = await allRows();
const uploads = rows.filter((r) => !r.hash.startsWith('discord:'));
if (!uploads.length) { console.log('The bot has not uploaded anything yet.'); process.exit(0); }
const since = Math.min(...uploads.map((r) => Date.parse(r.created_at))) - 3600 * 1000; // an hour before its first upload

// 1. same file (exact size and type) more than once: keep the oldest message, the later ones are copies
const byFile = new Map();
for (const r of rows) {
  if (!r.size) continue;
  const key = fingerprint(r.size, r.name);
  if (!byFile.has(key)) byFile.set(key, []);
  byFile.get(key).push(r);
}
const candidates = new Map(); // message id -> { row, keep }
for (const list of byFile.values()) {
  const msgs = [...new Map(list.map((r) => [r.message_id, r])).values()].sort((a, b) => (BigInt(a.message_id) < BigInt(b.message_id) ? -1 : 1));
  for (const r of msgs.slice(1)) if (when(r.message_id) >= since) candidates.set(r.message_id, { row: r, keep: msgs[0] });
}
const copies = [];
for (const [id, c] of candidates) {
  const m = await api('GET', `/channels/${c.row.channel_id}/messages/${id}`).catch(() => null);
  if (m && m.author.id === me.id && m.attachments?.length) copies.push({ ...c, m }); // the bot's own upload, not a forward
}

const jump = (ch, id) => `https://discord.com/channels/${GUILD_ID}/${ch}/${id}`;
console.log(`\n${copies.length} duplicate cop${copies.length === 1 ? 'y' : 'ies'} posted by the bot:`);
for (const c of copies) console.log(`  ${c.row.name}  in ${c.row.dest_name}\n      copy:     ${jump(c.row.channel_id, c.m.id)}\n      original: ${jump(c.keep.channel_id, c.keep.message_id)} (${c.keep.dest_name})`);

const deleted = new Set();
if (copies.length) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nDelete these ${copies.length} copies? The originals stay. [y/N] `);
  rl.close();
  if (/^y/i.test(answer.trim())) {
    // their #to-sort notes go too, so no Sort buttons point at a deleted file
    const notes = (await api('GET', `/channels/${CHANNELS.toSort}/messages?limit=100`)).filter((n) => n.author.id === me.id && n.components?.length);
    for (const c of copies) {
      await api('DELETE', `/channels/${c.row.channel_id}/messages/${c.m.id}`).catch((e) => console.log(`  couldn't delete ${c.row.name}: ${e.message}`));
      await db.remove('files', `message_id=eq.${c.m.id}`);
      deleted.add(c.m.id);
      for (const n of notes) if (JSON.stringify(n.components).includes(c.m.id)) await api('DELETE', `/channels/${CHANNELS.toSort}/messages/${n.id}`).catch(() => {});
      console.log(`  deleted ${c.row.name}`);
    }
  } else console.log('Nothing deleted.');
}

// 2. #to-sort files without a note
const recent = [];
for (let before = ''; recent.length < 500;) {
  const page = await api('GET', `/channels/${CHANNELS.toSort}/messages?limit=100${before ? `&before=${before}` : ''}`);
  recent.push(...page);
  if (page.length < 100) break;
  before = page[page.length - 1].id;
}
const referenced = new Set(recent.flatMap((n) => JSON.stringify(n.components || []).match(/sort:start:(\d+)/g) || []).map((s) => s.split(':')[2]));
const isCopy = new Set(copies.map((c) => c.m.id)); // copies you kept get no buttons: they'd only clutter #to-sort
const orphans = recent.filter((m) => m.author.id === me.id && m.attachments?.length && !m.content?.includes('· part') && !referenced.has(m.id) && !isCopy.has(m.id) && when(m.id) >= since);
for (const f of orphans.reverse()) {
  await api('POST', `/channels/${CHANNELS.toSort}/messages`, {
    content: `⚠️ **Couldn't place this file**: its note was lost when the upload timed out\n📁 File: \`${f.attachments[0].filename}\``,
    components: [{ type: 1, components: [
      { type: 2, style: 1, label: 'Sort into a unit', custom_id: `sort:start:${f.id}` },
      { type: 2, style: 2, label: 'Not a unit: #pdf-library', custom_id: `sort:library:${f.id}` },
    ] }],
    message_reference: { message_id: f.id, fail_if_not_exists: false },
    allowed_mentions: { parse: [] },
  });
  console.log(`  gave ${f.attachments[0].filename} its Sort buttons back`);
}
console.log(`\nDone: ${deleted.size} duplicate${deleted.size === 1 ? '' : 's'} removed, ${orphans.length} #to-sort file${orphans.length === 1 ? '' : 's'} given Sort buttons.`);
process.exit(0);
