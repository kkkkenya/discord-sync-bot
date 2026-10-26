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
