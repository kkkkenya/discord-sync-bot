// The hosted study room you are in (fixplan-f), outside the screens like the focus timer, so it keeps going while
// you move around Crux. The room's clock is a schedule from the server (room-clock.js); this file keeps the last
// state, the gap between this device's clock and the server's, and asks again every 20 s while the page is on screen.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { chime, prime, stopOwn } from './focus-store.js';
import { length, phaseAt, settle } from './room-clock.js';

const KEY = 'crux-room';
const POLL = 20e3; // server/defs.js ROOMS.pollSeconds
const saved = () => { try { return localStorage.getItem(KEY) || null; } catch { return null; } };
let st = { code: saved(), data: null, offset: 0, notice: null };
const subs = new Set();
function set(patch) {
  st = { ...st, ...patch };
  try { if (st.code) localStorage.setItem(KEY, st.code); else localStorage.removeItem(KEY); } catch { /* private window */ }
  subs.forEach((f) => f());
}
export const useRoom = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st);
export const serverNow = () => Date.now() + st.offset;

// a reply from the server: the room, its people, and the server's time
// a reply older than what we have (a poll that crossed a host action) is dropped
function adopt(v) {
  if (st.data && st.data.room.code === v.room.code && v.room.version < st.data.room.version) return;
  set({ code: v.room.code, data: v, offset: v.now - Date.now(), notice: null });
}
function gone(message) { tellFocus(null); set({ code: null, data: null, notice: message }); }
export const clearNotice = () => set({ notice: null });

// hosted rooms count toward "N others focusing" (without a room name)
let told = null;
function tellFocus(until) {
  if (until === told) return;
  told = until;
  api('POST', 'focus', { until, unit: null }).catch(() => {});
}

export async function hostRoom({ name, unit, plan }) {
  prime();
  const v = await api('POST', 'rooms', { name, unit, plan });
  stopOwn();
  adopt(v);
}
export async function joinCode(code) {
  prime();
  const v = await api('POST', 'rooms/join', { code });
  stopOwn();
  adopt(v);
}
export async function refresh() {
  if (!st.code) return;
  try { adopt(await api('GET', `rooms/state?code=${encodeURIComponent(st.code)}`)); } catch (e) {
    if (e.status === 410 || e.status === 403 || e.status === 400) gone(e.message);
    else if (e.status === 401) gone('Sign in again to rejoin the room.');
    // no connection: keep the last state; the clock runs on its own
  }
}
// a host action; when someone else changed the room first, take the new state and say so
export async function act(action, extra = {}) {
  prime();
  try {
    const v = await api('POST', 'rooms/act', { code: st.code, action, version: st.data?.room.version, ...extra });
    if (v.ended) return gone('You ended the room.');
    adopt(v);
  } catch (e) {
    if (e.status === 409) { await refresh(); throw new Error('The room changed. Check it and try again.'); }
    if (e.status === 410) return gone(e.message);
    throw e;
  }
}
// a check-in at a break: done, partly or stuck (counts only reach the host)
export async function checkin(how) {
  if (!st.code) return;
  try { adopt(await api('POST', 'rooms/checkin', { code: st.code, how })); } catch (e) {
    if (e.status === 410 || e.status === 403) return gone(e.message);
    throw e;
  }
}
export async function leaveHosted() {
  await api('POST', 'rooms/leave', {}).catch(() => {});
  gone(null);
}

// The room's clock now, as the page shows it.
export function roomView(s = st) {
  if (!s.data) return null;
  return phaseAt(s.data.room.clock, Date.now() + s.offset);
}

// One engine for the whole app, however many screens show the room (kept pages, the mini bar): it chimes when the
// phase changes, tells the focus count, and asks the server every 20 s while the page is on screen. Screens only
// re-render once a second.
let users = 0, engine = null;
function startEngine() {
  if (engine) return;
  if (!st.data) refresh();
  let last = null, polled = Date.now();
  const beat = setInterval(() => {
    if (!st.code) return;
    const v = roomView();
    if (v) {
      const key = `${v.state}:${v.mode}:${v.round}`;
      if (last && key !== last) chime();
      last = key;
      // the block's exact end in server time, so the same value is sent once, not every second
      const c = settle(st.data.room.clock, serverNow());
      tellFocus(v.state === 'running' && v.mode === 'focus' ? new Date(c.phaseStart + length(c.plan, c.phase)).toISOString() : null);
    }
    if (Date.now() - polled >= POLL && document.visibilityState === 'visible') { polled = Date.now(); refresh(); }
  }, 1000);
  const back = () => { if (document.visibilityState === 'visible' && st.code) { polled = Date.now(); refresh(); } };
  // opening the Focus page (or an invite) shows the room as it is now, not as of the last poll
  const opened = () => { if (/^#\/(focus|room)(\/|$)/.test(location.hash)) back(); };
  document.addEventListener('visibilitychange', back);
  window.addEventListener('hashchange', opened);
  engine = () => { clearInterval(beat); document.removeEventListener('visibilitychange', back); window.removeEventListener('hashchange', opened); };
}
function stopEngine() { engine?.(); engine = null; }

export function useHostedRoom() {
  const s = useRoom();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.code) return;
    users++;
    startEngine();
    const t = setInterval(() => tick(Date.now()), 1000);
    return () => { clearInterval(t); if (--users === 0) stopEngine(); };
  }, [s.code]);
  return s;
}
