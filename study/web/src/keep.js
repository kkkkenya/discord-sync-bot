// How many pages stay loaded after you leave them (Settings › Pages kept open), on this device only: a phone with
// little memory can keep fewer. 1 means none are kept: every page loads fresh.
export const KEEP_CHOICES = [1, 4, 8, 12];
const DEFAULT = 8;

export function keptPages() {
  try { const n = Number(localStorage.getItem('crux-keep')); return KEEP_CHOICES.includes(n) ? n : DEFAULT; } catch { return DEFAULT; }
}
export function setKeptPages(n) {
  try { localStorage.setItem('crux-keep', String(n)); } catch { /* private window */ }
  window.dispatchEvent(new Event('crux-keep'));
}

// The page's memory, where the browser says (Chrome and Edge): { mb, high } with high over 70% of its limit or 700 MB.
export function memoryUse() {
  const m = performance?.memory;
  if (!m?.usedJSHeapSize) return null;
  const mb = Math.round(m.usedJSHeapSize / 1048576);
  return { mb, high: m.usedJSHeapSize > 0.7 * m.jsHeapSizeLimit || mb > 700 };
}
