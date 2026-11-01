// A student's imported notes (Obsidian, Notion). Private, so they never go in the shared library cache: in production
// they live in Supabase (crux_notes) and the routes that read them load the unit's notes into the request
// (loadNotes); locally they're study/data/notes.json. A note with the same unit and title replaces the old one.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { db, enc } from '../../lib/db.js';
import { remote } from './ingest.js';
import { DATA_DIR, requestScope } from './store.js';

export const LIMITS = { notes: 300, chars: 5 * 1024 * 1024 };
const SOURCES = ['obsidian', 'notion', 'file'];
const bad = (message) => Object.assign(new Error(message), { status: 400 });

// --- local file (dev and tests) ---
const FILE = new URL('notes.json', DATA_DIR);
const readLocal = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return []; } };
const writeLocal = (rows) => { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(new URL('notes.json.tmp', DATA_DIR), JSON.stringify(rows)); renameSync(new URL('notes.json.tmp', DATA_DIR), FILE); };

// Notes for a unit, for this request. Sync, for contextFor and learn: in production loadNotes() fetched them first.
export function ownNotes(unit) {
  const scope = requestScope();
  const rows = scope ? scope.notes || [] : (existsSync(FILE) ? readLocal() : []);
  return rows.filter((n) => n.unit === unit);
}

export async function loadNotes(userId, unit) {
  const scope = requestScope();
  if (!scope || !remote() || !unit) return;
  scope.notes = await db.select('crux_notes', `user_id=eq.${enc(userId)}&unit=eq.${enc(unit)}&select=id,unit,title,text,source,chars`);
}

// Titles and sizes only, for the Notes tab.
export async function listNotes(userId, unit) {
  const q = unit ? `&unit=eq.${enc(unit)}` : '';
  const rows = remote() ? await db.select('crux_notes', `user_id=eq.${enc(userId)}${q}&select=id,unit,title,source,chars,created_at&order=title`)
    : readLocal().filter((n) => !unit || n.unit === unit);
  return rows.map(({ id, unit: u, title, source, chars }) => ({ id, unit: u, title, source, chars }));
}

// [{ unit, title, text, source }] → { imported, replaced }. Checks the limits against what's already saved.
export async function importNotes(userId, notes, units) {
  if (!Array.isArray(notes) || !notes.length) throw bad('No notes to import.');
  const clean = notes.map((n) => ({
    unit: String(n.unit || ''), title: String(n.title || '').trim().slice(0, 200), text: String(n.text || ''), source: SOURCES.includes(n.source) ? n.source : 'file',
  })).filter((n) => n.title && n.text.trim());
  const unknown = clean.find((n) => !units.includes(n.unit));
  if (unknown) throw bad(`"${unknown.title}" isn't in one of your units. Pick a unit for it.`);
  const have = remote() ? await db.select('crux_notes', `user_id=eq.${enc(userId)}&select=unit,title,chars`) : readLocal();
  const key = (n) => `${n.unit}|${n.title.toLowerCase()}`;
  const incoming = new Set(clean.map(key));
  const kept = have.filter((n) => !incoming.has(key(n)));
  const count = kept.length + clean.length;
  const chars = kept.reduce((s, n) => s + (n.chars || n.text?.length || 0), 0) + clean.reduce((s, n) => s + n.text.length, 0);
  if (count > LIMITS.notes) throw bad(`That would make ${count} notes. The limit is ${LIMITS.notes}: delete some, or import fewer.`);
  if (chars > LIMITS.chars) throw bad(`That would make ${Math.round(chars / 1048576 * 10) / 10} MB of notes. The limit is 5 MB.`);
  const replaced = have.length - kept.length;
  if (remote()) {
    for (let i = 0; i < clean.length; i += 50) {
      await db.upsert('crux_notes', clean.slice(i, i + 50).map((n) => ({ user_id: userId, ...n, chars: n.text.length })), 'user_id,unit,title');
    }
  } else {
    writeLocal([...kept, ...clean.map((n) => ({ id: randomUUID().slice(0, 8), ...n, chars: n.text.length, created_at: new Date().toISOString() }))]);
  }
  return { imported: clean.length, replaced };
}

export async function deleteNote(userId, id) {
  if (remote()) return (await db.remove('crux_notes', `user_id=eq.${enc(userId)}&id=eq.${enc(id)}`)).length > 0;
  const rows = readLocal();
  const left = rows.filter((n) => n.id !== id);
  writeLocal(left);
  return left.length !== rows.length;
}
