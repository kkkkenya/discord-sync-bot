// The focus timer lives outside the screens, so it keeps running while you move around Crux and survives a reload.
// Times are stored as an end time, not a countdown, so a phone that sleeps the tab still finishes on time.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { push } from './sync.js';

export const MODES = { focus: 'Focus', short: 'Short break', long: 'Long break' };
export const PLANS = { classic: { focus: 25, short: 5, long: 15 }, long: { focus: 50, short: 10, long: 20 } };
const KEY = 'crux-focus';
const fresh = { active: false, mode: 'focus', running: false, endsAt: 0, left: 25 * 60e3, round: 1, plan: 'classic', others: null, room: null, roomCount: null };
// rooms used to be per unit: anyone still in one is now in the hub's study room
const oneRoom = (st) => (st.room && st.room !== 'hub' ? { ...st, room: 'hub' } : st);
let state = (() => { try { return oneRoom({ ...fresh, ...JSON.parse(localStorage.getItem(KEY)), others: null }); } catch { return fresh; } })();
const subs = new Set();
function set(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private window */ }
  subs.forEach((f) => f());
}
// after an action, the timer (without the count) goes to your account so your other devices show it
const share = () => { const { others, ...rest } = state; push('focus', rest); };
export const adoptFocus = (v) => { if (v) set(oneRoom({ ...fresh, ...v, others: state.others })); };
export const useFocus = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
// The study room: one for the whole hub (HUB_ROOM), everyone in it on the same clock, so nobody has to coordinate. Focus from :00 to :25
// and :30 to :55, breaks in between. (Nairobi is a whole number of hours from UTC, so UTC minutes are local minutes.)
const BLOCK = 30 * 60e3, ROOM_FOCUS = 25 * 60e3;
export function roomPhase(now = Date.now()) {
  const into = now % BLOCK;
  return into < ROOM_FOCUS ? { mode: 'focus', left: ROOM_FOCUS - into, total: ROOM_FOCUS } : { mode: 'short', left: BLOCK - into, total: BLOCK - ROOM_FOCUS };
}
// what the timer shows: the room's clock when you're in a room, your own timer otherwise
export function view(st, now = Date.now()) {
  if (st.room) return { ...roomPhase(now), running: true };
  return { mode: st.mode, left: st.running ? Math.max(0, st.endsAt - now) : st.left, total: PLANS[st.plan][st.mode] * 60e3, running: st.running };
}
export const remaining = (st, now = Date.now()) => view(st, now).left;
const minutes = (mode, plan = state.plan) => PLANS[plan][mode] * 60e3;

// the server only hears "I'm focusing until …" or "I stopped"; it answers with how many others are focusing
const tell = (until) => api('POST', 'focus', { until, unit: state.room }).then((r) => set({ others: r.others, roomCount: r.room ?? null })).catch(() => set({ others: null }));
export const refreshOthers = () => api('GET', `focus${state.room ? `?unit=${encodeURIComponent(state.room)}` : ''}`).then((r) => set({ others: r.others, roomCount: r.room ?? null })).catch(() => {});

let audio;
const prime = () => { try { audio = audio || new AudioContext(); audio.resume(); } catch { /* no sound */ } };
function chime() {
  try {
    [0, 0.22].forEach((at, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + at;
      o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.55);
    });
  } catch { /* no sound */ }
  navigator.vibrate?.([120, 80, 120]);
}

export function start() {
  prime();
  const endsAt = Date.now() + state.left;
  set({ active: true, running: true, endsAt });
  share();
  if (state.mode === 'focus') tell(new Date(endsAt).toISOString());
}
export function pause() {
  set({ running: false, left: remaining(state) });
  share();
  if (state.mode === 'focus') tell(null);
}
export function reset() {
  if (state.running && state.mode === 'focus') tell(null);
  set({ running: false, left: minutes(state.mode) });
  share();
}
export function switchMode(mode) {
  if (state.running && state.mode === 'focus') tell(null);
  set({ mode, running: false, left: minutes(mode) });
  share();
}
export function setPlan(plan) {
  if (state.running && state.mode === 'focus') tell(null);
  set({ plan, running: false, left: minutes(state.mode, plan) });
  share();
}
export function end() {
  if (state.running && state.mode === 'focus') tell(null);
  set({ ...fresh, plan: state.plan, left: minutes('focus') });
  share();
}
export const HUB_ROOM = 'hub';
// join the study room: your own timer stops and you follow the room's clock
export function joinRoom(unit = HUB_ROOM) {
  prime();
  if (state.running && state.mode === 'focus') tell(null);
  set({ room: unit, active: true, running: false, roomCount: null });
  const p = roomPhase();
  if (p.mode === 'focus') tell(new Date(Date.now() + p.left).toISOString()); else refreshOthers();
  share();
}
export function leaveRoom() {
  tell(null);
  set({ room: null, active: false, roomCount: null, mode: 'focus', left: minutes('focus') });
  share();
}
// a block ran out: chime, then line up the next one (a long break after every fourth focus block)
function finish() {
  chime();
  if (state.mode === 'focus') set({ running: false, mode: state.round % 4 === 0 ? 'long' : 'short', left: minutes(state.round % 4 === 0 ? 'long' : 'short') });
  else set({ running: false, mode: 'focus', round: state.round + 1, left: minutes('focus') });
  share();
}

// re-render once a second while the timer runs; finish the block when it reaches zero
export function useTick() {
  const st = useFocus();
  const [, setNow] = useState(0);
  useEffect(() => {
    if (st.room) {
      // in a room: chime when the room's block changes, and say you're focusing until the new block ends
      let last = roomPhase().mode;
      const t = setInterval(() => {
        const p = roomPhase();
        if (p.mode !== last) { last = p.mode; chime(); if (p.mode === 'focus') tell(new Date(Date.now() + p.left).toISOString()); }
        setNow(Date.now());
      }, 1000);
      return () => clearInterval(t);
    }
    if (!st.running) return;
    const t = setInterval(() => { if (remaining(state) <= 0) finish(); else setNow(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, [st.running, st.room]);
  return st;
}

// how many others are focusing: asked on open, then every 2 minutes while you focus and the app is on screen
export function useOthers(active) {
  useEffect(() => {
    if (!active) return;
    refreshOthers();
    const t = setInterval(() => { if (document.visibilityState === 'visible') refreshOthers(); }, 2 * 60e3);
    return () => clearInterval(t);
  }, [active]);
}

export const clock = (ms) => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
