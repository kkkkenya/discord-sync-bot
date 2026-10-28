// The context library: downloads a unit's files from Discord, extracts their text, and caches it in
// study/data/library.json (separate from study.json so the daily store stays small). fileId -> entry.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { extract } from './extract.js';

// Same folder as study.json (STUDY_DATA_DIR overrides both).
const DIR = process.env.STUDY_DATA_DIR ? pathToFileURL(`${process.env.STUDY_DATA_DIR.replace(/[\\/]$/, '')}/`) : new URL('../data/', import.meta.url);
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

const OUTLINE = /outline|syllabus|course[\s_-]*(content|description)/i;

// What a unit covers, for suggesting its topics: the course outline first, then the parsed past-paper questions,
// then the opening of each notes file (often its contents page). { text, sources: what was read }.
export function outlineContext(unit, questions = [], files = library.files, maxChars = 14000) {
  const mine = Object.values(files).filter((e) => e.unit === unit && e.text);
  const parts = [];
  const sources = [];
  for (const e of mine.filter((x) => OUTLINE.test(x.name))) { parts.push(`--- Course outline: ${e.name} ---\n${e.text.slice(0, 6000)}`); sources.push(e.name); }
  if (questions.length) {
    parts.push(`--- Past-paper questions ---\n${questions.map((q) => `- ${q.slice(0, 400)}`).join('\n')}`);
    sources.push(`${questions.length} past-paper question${questions.length === 1 ? '' : 's'}`);
  }
  for (const e of mine.filter((x) => !x.paper && !OUTLINE.test(x.name))) {
    if (parts.join('').length >= maxChars) break;
    parts.push(`--- Notes: ${e.name} ---\n${e.text.slice(0, 3000)}`);
    sources.push(e.name);
  }
  return { text: parts.join('\n\n').slice(0, maxChars), sources };
}

// Files added from this computer (a tutorial sheet, an outline you were sent): kept in the library like synced ones,
// id 'local-<hash of the contents>' so the same file isn't added twice. Tutorials, CATs and papers count as papers.
const PAPER_NAME = /tut(?:orial)?|(?<![a-z])cats?(?![a-z])|exam|paper|assignment|quiz/i;
export const LOCAL_TYPES = /\.(pdf|docx|pptx|txt|md)$/i;

export async function addLocalFile(unit, name, buf) {
  const id = `local-${createHash('sha1').update(buf).digest('hex').slice(0, 12)}`;
  const had = library.files[id];
  if (had) return { id, name: had.name, chars: had.chars, paper: had.paper, duplicate: true };
  const { pages, text, pageStarts } = await extract(buf, name);
  const paper = PAPER_NAME.test(name) && !OUTLINE.test(name);
  library.files[id] = { unit, name, kind: 'local', paper, pages, at: new Date().toISOString(), chars: text.length, text, local: true, ...(pageStarts && { pageStarts }) };
  saveLibrary();
  return { id, name, chars: text.length, paper };
}

export const localFiles = (unit) => Object.entries(library.files).filter(([, e]) => e.local && e.unit === unit)
  .map(([id, e]) => ({ id, name: e.name, paper: e.paper, url: null, synced: true, chars: e.chars, pages: e.pages, text: e.text, local: true }));

export function removeLocalFile(id) {
  if (!library.files[id]?.local) return false;
  delete library.files[id];
  saveLibrary();
  return true;
}

async function messageFor(channelId, messageId) {
  const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Discord message ${r.status}`);
  return r.json();
}

// A forwarded message keeps its files in message_snapshots, not in attachments.
export const attachmentOf = (msg) => msg.attachments?.[0] || msg.message_snapshots?.[0]?.message?.attachments?.[0] || null;

// Ingest one file record (from library.js filesFor) into the cache. Returns { id, name, chars, cached, error }.
// A file with no extractable text (a scanned paper) is still recorded, so it isn't re-downloaded every sync.
export async function ingestFile(f, unitCode) {
  const existing = library.files[f.id];
  // synced before page numbers were kept: read a PDF or slide deck again once, so "Learn a topic" can cite pages
  const needsPages = existing?.text && !existing.pageStarts && /\.(pdf|pptx)$/i.test(f.name);
  if (existing && !needsPages) return { id: f.id, name: f.name, chars: existing.text?.length || 0, cached: true };
  let att;
  try {
    const msg = await messageFor(f.channel_id, f.message_id);
    att = attachmentOf(msg);
  } catch (e) {
    return { id: f.id, name: f.name, error: e.message };
  }
  if (!att) return { id: f.id, name: f.name, error: 'no attachment' };
  const dl = await fetch(att.url);
  if (!dl.ok) return { id: f.id, name: f.name, error: `download ${dl.status}` };
  const buf = Buffer.from(await dl.arrayBuffer());
  const { pages, text, pageStarts } = await extract(buf, att.filename);
  library.files[f.id] = { unit: unitCode, name: f.name, kind: f.kind, paper: f.paper, pages, at: new Date().toISOString(), chars: text.length, text, ...(pageStarts && { pageStarts }) };
  saveLibrary();
  return { id: f.id, name: f.name, chars: text.length, error: text.length ? null : 'no text (scanned?)' };
}
