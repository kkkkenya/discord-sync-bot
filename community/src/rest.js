// Discord REST and the Supabase state store, for code that runs without a gateway connection (GitHub Actions).
const API = 'https://discord.com/api/v10';

export async function discord(method, path, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(API + path, {
      method,
      headers: { Authorization: `Bot ${process.env.COMMUNITY_DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429) { const wait = ((await r.json()).retry_after || 1) * 1000 + 250; await new Promise((ok) => setTimeout(ok, wait)); continue; }
    const text = await r.text();
    if (!r.ok) throw new Error(`Discord ${method} ${path} -> ${r.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  throw new Error(`Discord ${method} ${path}: still rate-limited`);
}

// One row per key in the community_state table (supabase/schema.sql).
const sb = (path, init = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', ...init.headers },
});
export async function load(key, fallback) {
  const r = await sb(`community_state?key=eq.${encodeURIComponent(key)}&select=value`);
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json())[0]?.value ?? fallback;
}
export async function store(key, value) {
  const r = await sb('community_state?on_conflict=key', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export const nairobiDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
export const nairobiMinutes = (d = new Date()) => {
  const [h, m] = d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour12: false }).split(':').map(Number);
  return h * 60 + m;
};

// Claims a job for today so two runs at once (GitHub and the PC) can't both post it. True for the one run whose
// insert lands; release() hands it back when posting fails, so a later run can try again.
export async function claim(key) {
  const r = await sb('community_state?on_conflict=key', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify([{ key, value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).length === 1;
}
export async function release(key) {
  await sb(`community_state?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' });
}
