// Nightly backup: every student document changed in the last 24 hours is copied to the private Supabase Storage
// bucket crux-backups as YYYY-MM-DD/<user id>.json, and days older than KEEP_DAYS are deleted.
// storage(method, path, body) is a Supabase Storage call (supabaseStorage below; tests pass a fake).
export const BUCKET = 'crux-backups';
export const KEEP_DAYS = 14;

const nairobiDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

export async function runBackup({ db, storage, now = Date.now() }) {
  await storage('POST', '/bucket', { id: BUCKET, name: BUCKET, public: false }).catch(() => {}); // already there
  const since = new Date(now - 24 * 3600e3).toISOString();
  const rows = await db.select('crux_docs', `updated_at=gte.${encodeURIComponent(since)}&select=user_id,rev,doc,updated_at`);
  const day = nairobiDay(now);
  for (const r of rows) await storage('POST', `/object/${BUCKET}/${day}/${r.user_id}.json`, r, { upsert: true });

  const cutoff = nairobiDay(now - KEEP_DAYS * 864e5);
  const days = (await storage('POST', `/object/list/${BUCKET}`, { prefix: '', limit: 1000 })).map((x) => x.name).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n));
  const old = days.filter((d) => d < cutoff);
  for (const d of old) {
    const files = (await storage('POST', `/object/list/${BUCKET}`, { prefix: `${d}/`, limit: 1000 })).map((x) => `${d}/${x.name}`);
    if (files.length) await storage('DELETE', `/object/${BUCKET}`, { prefixes: files });
  }
  return { day, saved: rows.length, deletedDays: old };
}

export const supabaseStorage = async (method, path, body, { upsert = false } = {}) => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(upsert ? { 'x-upsert': 'true' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`storage ${method} ${path} -> ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};
