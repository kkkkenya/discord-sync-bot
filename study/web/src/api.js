import { useEffect, useState } from 'react';

// Shown when Crux can't be reached (no connection): nothing was saved.
export const OFFLINE = "Couldn't reach Crux, so nothing was saved. Check your connection and try again.";

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

// Seconds since `busy` turned on, ticking once a second: long AI waits show they are still going.
export function useElapsed(busy) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!busy) return;
    const t0 = Date.now();
    const t = setInterval(() => setN(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);
  return n;
}

// Units with no date of their own count down to the KU calendar. This marks them all TBA (dates moved by the strike).
export async function markUndatedTba(units) {
  for (const u of units.filter((x) => !x.catDate)) await api('PATCH', `units?code=${encodeURIComponent(u.code)}`, { catDate: 'TBA' });
}

export const daysUntil = (today, day) => Math.round((new Date(`${day}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000);
export const pct = (p) => Math.round((p.score / p.outOf) * 100);

// Reads a unit's files into the library, calling again every 3 seconds while some are left (each call runs about
// 45 seconds). onProgress({ done, total }) after each call. Returns the last answer, with every file's result.
export async function prepareUnit(unit, onProgress = () => {}) {
  const files = [];
  for (;;) {
    const r = await api('POST', 'library/prepare', { unit });
    files.push(...(r.files || []));
    onProgress(r);
    if (r.note || !r.pending) return { ...r, files };
    await new Promise((ok) => setTimeout(ok, 3000));
  }
}
