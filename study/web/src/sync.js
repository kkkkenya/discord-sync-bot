// Settings that follow your Discord account between phone and laptop: the focus timer, the bell's seen state,
// wallpaper and motion, and the current unit. A change is sent a moment after it happens (several changes travel
// together). When Crux loads or you come back to it, a value changed more recently on another device replaces
// this device's copy.
import { api } from './api.js';

const STAMP = 'crux-sync-at';
const stamps = () => { try { return JSON.parse(localStorage.getItem(STAMP)) || {}; } catch { return {}; } };
const stamp = (key, at) => { const all = { ...stamps(), [key]: at }; try { localStorage.setItem(STAMP, JSON.stringify(all)); } catch { /* private window */ } };

const appliers = {};
export const onSync = (key, apply) => { appliers[key] = apply; };

let pending = {};
let timer;
export function push(key, value) {
  stamp(key, Date.now());
  pending[key] = value;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const body = pending;
    pending = {};
    api('POST', 'sync', body).then((r) => { if (r.at) Object.keys(body).forEach((k) => stamp(k, r.at)); }).catch(() => { /* kept in the outbox */ });
  }, 1500);
}

// the account's copy (s.settings.sync: { key: { v, at } }) -> this device, for keys changed later elsewhere
export function pull(sync = {}) {
  const local = stamps();
  for (const [key, entry] of Object.entries(sync || {})) {
    if (entry?.at > (local[key] || 0) && appliers[key]) { appliers[key](entry.v); stamp(key, entry.at); }
  }
}
