// Wallpaper and motion: preferences for this device (localStorage), applied as html[data-wp] and html[data-motion].
// Motion starts off when the phone asks to save data or has very little memory.
import { push } from './sync.js';

const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const lowPower = () => navigator.connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2);

export const getLook = () => ({ wp: read('crux-wp', 'auto'), motion: read('crux-motion', lowPower() ? 'off' : 'on') });

export function applyLook(look = getLook()) {
  document.documentElement.dataset.wp = look.wp;
  document.documentElement.dataset.motion = look.motion;
}

// a look from another device (sync.js): saved here without sending it back
export function adoptLook(look) {
  try { localStorage.setItem('crux-wp', look.wp); localStorage.setItem('crux-motion', look.motion); } catch { /* private window */ }
  applyLook(look);
}

export function setLook(change) {
  const look = { ...getLook(), ...change };
  adoptLook(look);
  push('look', look);
  return look;
}
