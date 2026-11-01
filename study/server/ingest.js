// The context library: downloads a unit's files from Discord, extracts their text (Gemini reads scanned PDFs), and
// keeps it. Hub files are the same for every student, so the text is shared: in production it lives in Supabase
// (crux_file_text) and each instance caches it per unit; locally it's study/data/library.json. fileId -> entry.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { db, enc } from '../../lib/db.js';
import { ocrPdf } from './ai.js';
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

// Production keeps file text in Supabase; locally (dev, tests) it's library.json. CRUX_REMOTE_LIBRARY=1 tries Supabase locally.
export const remote = () => Boolean(process.env.VERCEL) || process.env.CRUX_REMOTE_LIBRARY === '1';
const loadedAt = new Map(); // unit → when its text was loaded into library.files on this instance
const TTL = 10 * 60e3;
const entryOf = (r) => ({ unit: r.unit_code, name: r.name, paper: r.paper, pages: r.pages || 0, chars: r.chars || 0, text: r.text || '', status: r.status, method: r.method, at: r.updated_at, ...(r.page_starts && { pageStarts: r.page_starts }) });

// Before a request runs: the text of these units' files, from Supabase (no-op locally).
export async function ensureLibrary(units) {
  const stale = [...new Set(units.filter(Boolean))].filter((u) => !(Date.now() - (loadedAt.get(u) || 0) < TTL));
  if (!remote() || !stale.length) return;
  const rows = await db.select('crux_file_text', `unit_code=in.(${stale.map((u) => `"${enc(u)}"`).join(',')})&select=file_id,unit_code,name,paper,pages,chars,text,status,method,page_starts,updated_at`);
  for (const [id, e] of Object.entries(library.files)) if (stale.includes(e.unit)) delete library.files[id];
  for (const row of rows) library.files[row.file_id] = entryOf(row);
  for (const u of stale) loadedAt.set(u, Date.now());
}

async function saveEntry(id, e, method, error = null) {
  library.files[id] = e;
  if (!remote()) return saveLibrary();
  await db.upsert('crux_file_text', [{
    file_id: Number(id), unit_code: e.unit, name: e.name, paper: Boolean(e.paper), status: e.status, method, pages: e.pages || null,
    chars: e.text.length, text: e.text || null, page_starts: e.pageStarts || null, error, updated_at: new Date().toISOString(),
  }], 'file_id');
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

// A forwarded message keeps its files in message_snapshots, not in attachments. With several files, the one whose
// name matches (Discord swaps spaces for underscores), else the first.
const plain = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
export function attachmentOf(msg, name) {
  const all = msg.attachments?.length ? msg.attachments : msg.message_snapshots?.[0]?.message?.attachments || [];
  return all.find((a) => plain(a.filename) === plain(name)) || all[0] || null;
}

// Gemini reads scanned PDFs once for everyone. The free quota is shared, so at most OCR_PER_DAY a day across all
// students; files over it wait as 'queued' and are read on a later day.
const OCR_PER_DAY = 200;
const OCR_MAX_BYTES = 20 * 1024 * 1024; // Gemini's inline limit
const scanned = (text, pages) => pages > 0 && text.length / pages < 100;
async function ocrAllowed() {
  if (!remote()) return true;
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  return (await db.rpc('crux_bump', { p_user: 'global', p_day: day, p_kind: 'ocr', p_limit: OCR_PER_DAY })) !== null;
}

// A file still to read: never read, waiting for OCR, a scan read before OCR existed, failed more than a day ago, or
// read before page numbers were kept (PDFs and slides are read again once, so "Learn a topic" can cite pages).
export const needsReading = (f, e = library.files[f.id]) => !e || ['new', 'queued'].includes(e.status) || (!e.status && !e.text)
  || (e.status === 'error' && Date.now() - Date.parse(e.at || 0) > 864e5)
  || (e.text && !e.pageStarts && e.method !== 'ocr' && /\.(pdf|pptx)$/i.test(f.name));

// Ingest one file record (from library.js filesFor) into the library. Returns { id, name, chars, cached, error }.
// A file with no text even after OCR is still recorded, so it isn't downloaded again every time.
export async function ingestFile(f, unitCode) {
  const existing = library.files[f.id];
  if (!needsReading(f, existing)) return { id: f.id, name: f.name, chars: existing.text?.length || 0, cached: true };
  const failed = async (error) => {
    if (existing?.text) return { id: f.id, name: f.name, chars: existing.text.length, error }; // keep what was read before
    await saveEntry(f.id, { unit: unitCode, name: f.name, kind: f.kind, paper: f.paper, pages: 0, at: new Date().toISOString(), chars: 0, text: '', status: 'error' }, 'none', error);
    return { id: f.id, name: f.name, error };
  };
  let att;
  try {
    att = attachmentOf(await messageFor(f.channel_id, f.message_id), f.name);
  } catch (e) {
    return failed(e.message);
  }
  if (!att) return failed('no attachment');
  const dl = await fetch(att.url);
  if (!dl.ok) return failed(`download ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  let { pages, text, pageStarts } = await extract(buf, att.filename);
  const ext = (att.filename.split('.').pop() || '').toLowerCase();
  let method = { pdf: 'pdf', docx: 'docx', pptx: 'pptx' }[ext] || (text ? 'text' : 'none');
  let status = 'done';
  let error = null;
  if (ext === 'pdf' && scanned(text, pages) && process.env.GEMINI_API_KEY) {
    if (buf.length > OCR_MAX_BYTES) error = 'too big to read as a scan (over 20 MB)';
    else if (!(await ocrAllowed())) status = 'queued';
    else {
      try {
        const out = await ocrPdf(buf);
        if (out.text.length > text.length) { text = out.text; pageStarts = undefined; method = 'ocr'; }
      } catch (e) {
        error = `OCR failed: ${e.message}`;
      }
    }
  }
  if (!text && status === 'done') method = 'none';
  const entry = { unit: unitCode, name: f.name, kind: f.kind, paper: f.paper, pages, at: new Date().toISOString(), chars: text.length, text, status, method, ...(pageStarts && { pageStarts }) };
  await saveEntry(f.id, entry, method, error);
  return { id: f.id, name: f.name, chars: text.length, method, error: error || (status === 'queued' ? 'waiting for tomorrow\'s OCR' : text.length ? null : 'no text (scanned?)') };
}

// Reads a unit's unread files for up to `budgetMs` (Vercel cuts a request off), so the app calls again until
// nothing is pending. One broken file is recorded with its error and the rest carry on.
export async function prepareUnit(files, unitCode, budgetMs = 45e3) {
  const started = Date.now();
  const results = [];
  for (const f of files.filter((x) => needsReading(x))) {
    if (Date.now() - started > budgetMs) break;
    results.push(await ingestFile(f, unitCode).catch((e) => ({ id: f.id, name: f.name, error: e.message })));
  }
  const pending = files.filter((x) => needsReading(x) && library.files[x.id]?.status !== 'queued').length;
  return { results, total: files.length, done: files.length - files.filter((x) => needsReading(x)).length, pending };
}
