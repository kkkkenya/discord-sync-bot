// Files already on the server (from the old uploader, or posted by hand) go into the Supabase file index too, so
// /find covers the whole library and the uploader never posts a second copy. The first start reads every unit
// post, shelf, #pdf-library and #to-sort; later starts only read what's new (pc/data/state.json keeps the place).
// Files members post are added as they arrive.
//
// A local file counts as already on the server when an attachment there has the same exact size and file type
// (for files under 50 KB, the same size and name). Discord keeps uploads byte-for-byte, so the size matches.
import { ChannelType } from 'discord.js';
import { extname } from 'node:path';
import { CHANNELS } from '../../../lib/config.js';
import { db } from '../../../lib/db.js';
import SHELVES from '../../../lib/shelves.json' with { type: 'json' };
import { save, state } from '../state.js';
import { kindOf } from './classify.js';

const SMALL = 50 * 1024;
const OUR_PARTS = /· (part|piece) \d+ of \d+/; // the 2nd+ parts of a split book: the first part stands for the file
const CODE = /(?<![A-Za-z])([A-Za-z]{3})[\s_.-]*(\d{3})(?!\d)/;
const newest = (msgs) => msgs.reduce((a, m) => (BigInt(m.id) > BigInt(a) ? m.id : a), '0');
const oldest = (msgs) => msgs.reduce((a, m) => (a === null || BigInt(m.id) < BigInt(a) ? m.id : a), null);

// Discord turns spaces into underscores in file names, so names are compared letters-and-digits only.
export const fingerprint = (size, name) => (size >= SMALL
  ? `${size}|${extname(name).toLowerCase()}`
  : `${size}|${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`);

function attachmentsOf(msg) {
  const out = [...msg.attachments.values()];
  for (const snap of msg.messageSnapshots?.values?.() ?? []) out.push(...(snap.attachments?.values?.() ?? [])); // forwarded files
  return out;
}

// Every channel or post where library files live, with what we know about it.
async function places(ctx) {
  const out = new Map();
  const shelfIds = new Set(SHELVES.map((s) => s.id));
  const channels = await ctx.guild.channels.fetch();
  for (const forum of channels.values()) {
    if (forum?.type !== ChannelType.GuildForum) continue;
    const threads = new Map();
    for (const t of (await forum.threads.fetchActive()).threads.values()) if (t.parentId === forum.id) threads.set(t.id, t);
    for (let before; ;) {
      const page = await forum.threads.fetchArchived({ type: 'public', limit: 100, before });
      for (const t of page.threads.values()) threads.set(t.id, t);
      if (!page.hasMore || !page.threads.size) break;
      before = new Date(Math.min(...page.threads.map((t) => t.archiveTimestamp || Date.now())));
    }
    for (const t of threads.values()) out.set(t.id, placeOf(t, forum.name, shelfIds));
  }
  for (const id of [...shelfIds, CHANNELS.library, CHANNELS.toSort]) {
    if (out.has(id)) continue;
    const ch = await ctx.client.channels.fetch(id).catch(() => null);
    if (ch) out.set(id, placeOf(ch, null, shelfIds));
  }
  return [...out.values()];
}

function placeOf(ch, forumName, shelfIds) {
  if (shelfIds.has(ch.id)) return { channel: ch, unit_code: null, forum: null, dest_name: SHELVES.find((s) => s.id === ch.id).name };
  const m = forumName ? ch.name.split(' — ')[0].toUpperCase().match(CODE) : null;
  return { channel: ch, unit_code: m ? `${m[1]} ${m[2]}` : null, forum: forumName, dest_name: ch.id === CHANNELS.toSort ? 'to-sort' : ch.name };
}

async function messagesSince(ch, after) {
  const out = [];
  if (after) { // later scans: forwards from where the last one stopped
    for (let cursor = after; ;) {
      const page = [...(await ch.messages.fetch({ limit: 100, after: cursor })).values()];
      out.push(...page);
      if (page.length < 100) return out;
      cursor = newest(page);
    }
  }
  for (let before; ;) { // first scan: everything, newest to oldest
    const page = [...(await ch.messages.fetch(before ? { limit: 100, before } : { limit: 100 })).values()];
    out.push(...page);
    if (page.length < 100) return out;
    before = oldest(page);
  }
}

function rowsFor(place, msgs) {
  const rows = [];
  for (const m of msgs) {
    if (OUR_PARTS.test(m.content || '')) continue;
    for (const a of attachmentsOf(m)) {
      rows.push({
        hash: `discord:${m.id}:${a.id}`, name: a.name, kind: kindOf(`${a.name} ${m.content || ''}`, a.name),
        unit_code: place.unit_code, dest_name: place.dest_name, forum: place.forum,
        channel_id: place.channel.id, message_id: m.id, size: a.size,
      });
    }
  }
  return rows;
}

async function store(rows) {
  if (!rows.length) return 0;
  // skip messages already in the index (files this bot uploaded are stored with their real sha256)
  const known = new Set((await db.select('files', `channel_id=eq.${rows[0].channel_id}&select=message_id&limit=10000`)).map((r) => r.message_id));
  const fresh = rows.filter((r) => !known.has(r.message_id));
  let added = 0;
  for (let n = 0; n < fresh.length; n += 500) added += (await db.insert('files', fresh.slice(n, n + 500), { ignoreDuplicates: true })).length;
  return added;
}

// write: false (dry run) reads everything and changes nothing; it returns the fingerprints it found.
export async function scanExisting(ctx, { write = true } = {}) {
  const found = new Set();
  state.scanned ||= {};
  let files = 0; let added = 0;
  const list = await places(ctx);
  for (const place of list) {
    try {
      const msgs = await messagesSince(place.channel, write ? state.scanned[place.channel.id] : undefined);
      const rows = rowsFor(place, msgs);
      for (const r of rows) found.add(fingerprint(r.size, r.name));
      files += rows.length;
      if (write) {
        added += await store(rows);
        if (msgs.length) state.scanned[place.channel.id] = newest(msgs);
      }
    } catch (e) {
      console.error(`  couldn't read ${place.channel.name}: ${e.message}`);
    }
  }
  if (write) save();
  return { found, places: list.length, files, added };
}

// A file a member posts in a unit post, shelf or library channel joins the index straight away.
export async function recordLive(ctx, msg) {
  if (!msg.guildId || msg.author?.id === ctx.client.user.id || !attachmentsOf(msg).length) return;
  const ch = msg.channel;
  const shelfIds = new Set(SHELVES.map((s) => s.id));
  const inForum = ch.parent?.type === ChannelType.GuildForum;
  if (!inForum && !shelfIds.has(ch.id) && ![CHANNELS.library, CHANNELS.toSort].includes(ch.id)) return;
  await store(rowsFor(placeOf(ch, inForum ? ch.parent.name : null, shelfIds), [msg]));
  state.scanned ||= {};
  state.scanned[ch.id] = msg.id;
  save();
}

// Is a local file already on the server? Checks the index by exact size.
export async function onServer(size, name) {
  const same = await db.select('files', `size=eq.${size}&select=name,channel_id,message_id&limit=50`);
  return same.find((f) => fingerprint(size, f.name) === fingerprint(size, name)) || null;
}
