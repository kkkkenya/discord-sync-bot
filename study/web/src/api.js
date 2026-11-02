import { useEffect, useState } from 'react';

// Shown when Crux can't be reached (no connection): nothing was saved.
export const OFFLINE = "Couldn't reach Crux, so nothing was saved. Check your connection and try again.";

const send = async (method, path, body) => {
  const r = await fetch(`/api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json();
  if (!r.ok) throw Object.assign(new Error(out.error || r.statusText), { status: r.status });
  return out;
};

// Offline changes: edits that need no AI (dates, ratings, topics, settings, timer, marks) are kept on this device
// and sent in order when Crux is back online. Anything that needs AI or reads files still needs a connection.
const QUEUE = /^(units|stickies(\/[\w-]+)?|topics(\/[\w-]+)?|subtopics(\/audit|\/(?!suggest)[\w-]+)?|settings|sync|focus|hints|attempts\/(broke|flag)|mocks\/[\w-]+|materials\/[\w-]+)(\?.*)?$/;
const OUTBOX = 'crux-outbox';
export const outbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX)) || []; } catch { return []; } };
const keep = (list) => { try { localStorage.setItem(OUTBOX, JSON.stringify(list)); } catch { /* private window */ } window.dispatchEvent(new Event('crux-outbox')); };

export async function api(method, path, body) {
  try {
    return await send(method, path, body);
  } catch (e) {
    if (e.status) throw e; // the server answered: a real error, not a lost connection
    if (method === 'GET' || !QUEUE.test(path)) throw new Error(OFFLINE);
    keep([...outbox(), { method, path, body, at: Date.now() }]);
    return { queued: true };
  }
}

// Sends what was saved offline, oldest first. Stops at the first lost connection; drops a change the server refuses.
let flushing = false;
export async function flushOutbox() {
  if (flushing || !outbox().length) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (let list = outbox(); list.length; list = outbox()) {
      const [next] = list;
      try { await send(next.method, next.path, next.body); } catch (e) { if (!e.status) break; }
      keep(outbox().slice(1));
      sent += 1;
    }
  } finally { flushing = false; }
  return sent;
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
