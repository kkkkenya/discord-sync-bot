// The context library: downloads a unit's files from Discord, extracts their text, and caches it in
// study/data/library.json (separate from study.json so the daily store stays small). fileId -> entry.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { extract } from './extract.js';

const DIR = new URL('../data/', import.meta.url);
const FILE = new URL('library.json', DIR);
const EMPTY = { files: {} };

export const library = existsSync(FILE) ? { ...EMPTY, ...JSON.parse(readFileSync(FILE, 'utf8')) } : structuredClone(EMPTY);

export function saveLibrary() {
  mkdirSync(DIR, { recursive: true });
  const tmp = new URL('library.json.tmp', DIR);
  writeFileSync(tmp, JSON.stringify(library, null, 1));
  renameSync(tmp, FILE);
}

export const libraryMeta = () =>
  Object.fromEntries(Object.entries(library.files).map(([id, e]) => [id, { unit: e.unit, name: e.name, chars: e.chars, paper: e.paper }]));

// Relevant material to ground an AI call: the unit's synced text, topic-matching files first, capped.
export function contextFor(unit, topic, maxChars = 12000) {
  const entries = Object.entries(library.files)
    .map(([, e]) => e)
    .filter((e) => e.unit === unit && e.text);
  if (!entries.length) return '';
  const needle = (topic || '').trim().toLowerCase();
  const score = (e) => {
    if (!needle) return 0;
    const name = (e.name || '').toLowerCase();
    const text = e.text.toLowerCase();
    if (text.includes(needle)) return 2;
    const words = needle.split(/\s+/).filter((w) => w.length > 3);
    if (words.some((w) => text.includes(w) || name.includes(w))) return 1;
    return 0;
  };
  entries.sort((a, b) => score(b) - score(a));
  let out = '';
  for (const e of entries) {
    if (out.length >= maxChars) break;
    out += `\n\n--- ${e.name} (${e.paper ? 'past paper / CAT' : 'notes'}) ---\n${e.text}`;
  }
  return out.slice(0, maxChars);
}

async function messageFor(channelId, messageId) {
  const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Discord message ${r.status}`);
  return r.json();
}

// Ingest one file record (from library.js filesFor) into the cache. Returns { id, name, chars, cached, error }.
// A file with no extractable text (a scanned paper) is still recorded, so it isn't re-downloaded every sync.
export async function ingestFile(f, unitCode) {
  const existing = library.files[f.id];
  if (existing) return { id: f.id, name: f.name, chars: existing.text?.length || 0, cached: true };
  let att;
  try {
    const msg = await messageFor(f.channel_id, f.message_id);
    att = msg.attachments?.[0] || null;
  } catch (e) {
    return { id: f.id, name: f.name, error: e.message };
  }
  if (!att) return { id: f.id, name: f.name, error: 'no attachment' };
  const dl = await fetch(att.url);
  if (!dl.ok) return { id: f.id, name: f.name, error: `download ${dl.status}` };
  const buf = Buffer.from(await dl.arrayBuffer());
  const { pages, text } = await extract(buf, att.filename);
  library.files[f.id] = { unit: unitCode, name: f.name, kind: f.kind, paper: f.paper, pages, at: new Date().toISOString(), chars: text.length, text };
  saveLibrary();
  return { id: f.id, name: f.name, chars: text.length, error: text.length ? null : 'no text (scanned?)' };
}
