// Minimal Supabase (PostgREST) client, no dependencies. Used by both Vercel and the PC bot.
// Needs SUPABASE_URL and SUPABASE_SERVICE_KEY (the service_role key: server-side only, never in the website).
export const enc = encodeURIComponent;

async function req(method, path, body, prefer) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`supabase ${method} ${path} -> ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export const db = {
  select: (table, qs = '') => req('GET', `/${table}?${qs}`),
  // ignoreDuplicates: a row that already exists is skipped and left out of the result
  insert: (table, rows, { ignoreDuplicates = false } = {}) =>
    req('POST', `/${table}`, rows, `return=representation${ignoreDuplicates ? ',resolution=ignore-duplicates' : ''}`),
  upsert: (table, rows, onConflict) =>
    req('POST', `/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, rows, 'return=representation,resolution=merge-duplicates'),
  update: (table, qs, patch) => req('PATCH', `/${table}?${qs}`, patch, 'return=representation'),
  remove: (table, qs) => req('DELETE', `/${table}?${qs}`, null, 'return=representation'),
};
