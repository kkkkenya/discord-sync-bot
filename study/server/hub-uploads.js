// Files students add in Crux for the hub: Crux hands out a one-time link to the private crux-uploads bucket
// (Supabase Storage), the browser uploads the file straight there (Vercel can't take big uploads), and the drive
// dumper on the hub PC collects it into Drop, which turns it into a PDF if needed and posts it to the unit
// (pc/src/uploader/fromcrux.js). Files sent together arrive as one batch (photos of one paper become one PDF).
import { db, enc } from '../../lib/db.js';
import { REWARD } from '../../lib/rewards.js';
import { isScheme } from './predict.js';
import { data } from './store.js';

export const BUCKET = 'crux-uploads';
export const MAX_BYTES = 50 * 1024 * 1024;
export const PER_DAY = 30;
const TYPES = /\.(pdf|jpe?g|png|pptx?|docx?)$/i;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const safe = (name) => String(name).replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';

async function storage(method, path, body) {
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, apikey: process.env.SUPABASE_SERVICE_KEY, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw bad(`File storage: ${out.message || out.error || r.status}`, 502);
  return out;
}

// The past papers of a unit, newest first, for "This is a marking scheme for…": [{ label, year, type }].
export function unitPapers(unit) {
  const seen = new Map();
  for (const q of data.paperq) {
    if (q.unit !== unit || q.type === 'Book' || isScheme(q.source)) continue;
    const label = String(q.source || '').replace(/\.[a-z0-9]{2,4}$/i, '').trim();
    if (label && !seen.has(label)) seen.set(label, { label, year: q.year || null, type: q.type });
  }
  return [...seen.values()].sort((a, b) => (b.year || 0) - (a.year || 0) || a.label.localeCompare(b.label));
}

// A marking scheme is named for its paper, so the hub files it as one and Crux pairs it with that paper's questions
// (practice.js schemeFor): scheme { paper } (a label from unitPapers) or { year, type: Exam|CAT 1|CAT 2|Tutorial, sheet }.
export function schemeName(unit, name, scheme) {
  const ext = (String(name).match(/\.[a-z0-9]+$/i) || ['.pdf'])[0].toLowerCase();
  let label = String(scheme.paper || '').trim();
  if (label) {
    if (!unitPapers(unit).some((p) => p.label === label)) throw bad('Pick the paper this marking scheme is for.');
  } else {
    const type = ['Exam', 'CAT 1', 'CAT 2', 'Tutorial'].find((t) => t === scheme.type);
    const year = Number(scheme.year);
    if (!type) throw bad('Pick the kind of paper: Exam, CAT 1, CAT 2 or Tutorial.');
    if (type !== 'Tutorial' && !(year >= 2000 && year <= 2100)) throw bad('Enter the year of the paper, like 2023.');
    const sheet = Number(scheme.sheet) || null;
    if (type === 'Tutorial' && !sheet) throw bad('Enter the tutorial number, like 3.');
    label = [year >= 2000 ? year : '', type === 'Tutorial' ? `Tutorial ${sheet}` : type].filter(Boolean).join(' ');
  }
  // the hub puts the unit code in front of every file it gets from Crux
  const code = unit.replace(' ', '[\\s_-]*');
  label = label.replace(new RegExp(`^\\s*${code}\\s*`, 'i'), '');
  return safe(`${label} marking scheme${ext}`);
}

// { unit, name, size, batch, scheme? } → { id, uploadUrl } (PUT the file there as form data, then POST /api/uploads/done)
export async function startUpload(body, user, { store = storage } = {}) {
  if (!process.env.SUPABASE_URL) throw bad('Adding files for the hub works on crux.engineeringhub.site.');
  const unit = data.units.find((u) => u.code === body.unit);
  if (!unit) throw bad('Pick one of your units first.');
  if (!TYPES.test(safe(body.name))) throw bad('PDFs, photos (JPG, PNG), PowerPoint and Word files only.');
  const name = body.scheme ? schemeName(unit.code, safe(body.name), body.scheme) : safe(body.name);
  const size = Number(body.size) || 0;
  if (size <= 0 || size > MAX_BYTES) throw bad(`Up to ${MAX_BYTES / 1024 / 1024} MB a file.`);
  const since = new Date(Date.now() - 864e5).toISOString();
  const today = await db.select('crux_uploads', `user_id=eq.${enc(user.id)}&created_at=gt.${enc(since)}&select=id`);
  if (today.length >= PER_DAY) throw bad(`That's ${PER_DAY} files today. Add more tomorrow, or send them to a class rep.`, 429);
  const batch = String(body.batch || Date.now()).replace(/[^\w-]/g, '').slice(0, 40) || String(Date.now());
  const path = `${unit.code.replace(' ', '-')}/${batch}/${Date.now().toString(36)}-${name}`;
  const signed = await store('POST', `/object/upload/sign/${BUCKET}/${path.split('/').map(enc).join('/')}`);
  const [row] = await db.insert('crux_uploads', [{ user_id: user.id, user_name: user.name, unit_code: unit.code, batch, name, path, size, status: 'uploading' }]);
  return { id: row.id, uploadUrl: `${process.env.SUPABASE_URL}/storage/v1${signed.url}` };
}

// { id } after the file is up: it joins the queue for the hub PC
export async function finishUpload(body, user) {
  const rows = await db.update('crux_uploads', `id=eq.${enc(body.id)}&user_id=eq.${enc(user.id)}&status=eq.uploading&select=id`, { status: 'new', updated_at: new Date().toISOString() });
  if (!rows?.length) throw bad('That upload was not found.', 404);
  return { ok: true };
}

// when the hub posted your files since `since` (ISO), for the activity graph: [created_at]
export async function postedDays(user, since) {
  if (!process.env.SUPABASE_URL) return [];
  const rows = await db.select('crux_uploads', `user_id=eq.${enc(user.id)}&status=eq.posted&created_at=gte.${enc(since)}&select=created_at`);
  return rows.map((r) => r.created_at);
}

// Who has added the most files the hub posted this semester (duplicates don't count): the top `limit`, and where you
// stand. { top: [{ name, files, you }], you: { rank, files } | null, since }
export async function contributors(user, { limit = 10, select = db.select } = {}) {
  if (!process.env.SUPABASE_URL) return { top: [], you: null, since: REWARD.start };
  const rows = await select('crux_uploads', `status=eq.posted&created_at=gte.${REWARD.start}&select=user_id,user_name`);
  const by = new Map();
  for (const r of rows) {
    const c = by.get(r.user_id) || { id: r.user_id, name: r.user_name || 'A student', files: 0 };
    c.files += 1;
    by.set(r.user_id, c);
  }
  const ranked = [...by.values()].sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));
  const i = ranked.findIndex((c) => c.id === user.id);
  return {
    top: ranked.slice(0, limit).map((c) => ({ name: c.name, files: c.files, you: c.id === user.id })),
    you: i < 0 ? null : { rank: i + 1, files: ranked[i].files },
    since: REWARD.start,
  };
}

// your files for a unit, newest first: [{ id, name, status, created_at, note }]
export async function myUploads(unit, user) {
  if (!process.env.SUPABASE_URL) return [];
  return db.select('crux_uploads', `user_id=eq.${enc(user.id)}&unit_code=eq.${enc(unit)}&status=neq.uploading&order=created_at.desc&limit=20&select=id,name,status,created_at,note`);
}
