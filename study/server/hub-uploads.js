// Files students add in Crux for the hub: Crux hands out a one-time link to the private crux-uploads bucket
// (Supabase Storage), the browser uploads the file straight there (Vercel can't take big uploads), and the drive
// dumper on the hub PC collects it into Drop, which turns it into a PDF if needed and posts it to the unit
// (pc/src/uploader/fromcrux.js). Files sent together arrive as one batch (photos of one paper become one PDF).
import { db, enc } from '../../lib/db.js';
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

// { unit, name, size, batch } → { id, uploadUrl } (PUT the file there as form data, then POST /api/uploads/done)
export async function startUpload(body, user, { store = storage } = {}) {
  if (!process.env.SUPABASE_URL) throw bad('Adding files for the hub works on crux.engineeringhub.site.');
  const unit = data.units.find((u) => u.code === body.unit);
  if (!unit) throw bad('Pick one of your units first.');
  const name = safe(body.name);
  if (!TYPES.test(name)) throw bad('PDFs, photos (JPG, PNG), PowerPoint and Word files only.');
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

// your files for a unit, newest first: [{ id, name, status, created_at, note }]
export async function myUploads(unit, user) {
  if (!process.env.SUPABASE_URL) return [];
  return db.select('crux_uploads', `user_id=eq.${enc(user.id)}&unit_code=eq.${enc(unit)}&status=neq.uploading&order=created_at.desc&limit=20&select=id,name,status,created_at,note`);
}
