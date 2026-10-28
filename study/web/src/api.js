import { useEffect, useState } from 'react';

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

// Tells the tutorial (Quests.jsx) that you just did something it asks for, like opening the top-bar menu.
export const questEvent = (name) => window.dispatchEvent(new CustomEvent('study-quest', { detail: name }));

// Units with no date of their own count down to the KU calendar. This marks them all TBA (dates moved by the strike).
export async function markUndatedTba(units) {
  for (const u of units.filter((x) => !x.catDate)) await api('PATCH', `units?code=${encodeURIComponent(u.code)}`, { catDate: 'TBA' });
}

export const daysUntil = (today, day) => Math.round((new Date(`${day}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000);
export const pct = (p) => Math.round((p.score / p.outOf) * 100);
