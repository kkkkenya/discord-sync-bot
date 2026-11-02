// Wallpaper, motion and light or dark: preferences kept on the device (localStorage) and synced, applied as html[data-wp],
// html[data-motion] and html[data-theme] (no data-theme: follow the device).
// Motion starts off when the phone asks to save data or has very little memory.
import { push } from './sync.js';

const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const lowPower = () => navigator.connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2);

export const getLook = () => ({ wp: read('crux-wp', 'auto'), motion: read('crux-motion', lowPower() ? 'off' : 'on'), theme: read('crux-theme', 'system') });
const BAR = { light: '#eef2ee', dark: '#120e0c' }; // the phone's status bar colour (index.html theme-color)

export function applyLook(look = getLook()) {
  const html = document.documentElement;
  html.dataset.wp = look.wp;
  html.dataset.motion = look.motion;
  if (look.theme === 'light' || look.theme === 'dark') html.dataset.theme = look.theme; else delete html.dataset.theme;
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const own = (m.getAttribute('media') || '').includes('dark') ? 'dark' : 'light';
    m.setAttribute('content', BAR[look.theme === 'light' || look.theme === 'dark' ? look.theme : own]);
  }
}

// a look from another device (sync.js): saved here without sending it back
export function adoptLook(change) {
  const look = { ...getLook(), ...change }; // a look synced before light/dark existed has no theme: keep this device's
  try { localStorage.setItem('crux-wp', look.wp); localStorage.setItem('crux-motion', look.motion); localStorage.setItem('crux-theme', look.theme); } catch { /* private window */ }
  applyLook(look);
}

export function setLook(change) {
  const look = { ...getLook(), ...change };
  adoptLook(look);
  push('look', look);
  return look;
}
