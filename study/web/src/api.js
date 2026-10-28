// Shown when the server can't be reached: the page stays open in the browser after the server window is closed.
export const OFFLINE = "The study server isn't running, so nothing was saved. Click the Study Desk shortcut to start it.";

export async function api(method, path, body) {
  const r = await fetch(`/api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => { throw new Error(OFFLINE); });
  const out = await r.json();
  if (!r.ok) throw new Error(out.error || r.statusText);
  return out;
}

// Units with no date of their own count down to the KU calendar. This marks them all TBA (dates moved by the strike).
export async function markUndatedTba(units) {
  for (const u of units.filter((x) => !x.catDate)) await api('PATCH', `units?code=${encodeURIComponent(u.code)}`, { catDate: 'TBA' });
}

export const daysUntil =(today, day) => Math.round((new Date(`${day}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000);
export const pct = (p) => Math.round((p.score / p.outOf) * 100);
