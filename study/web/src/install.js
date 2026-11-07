import { useEffect, useState } from 'react';

// Putting Crux on the home screen. Chrome and Edge offer their own install popup (beforeinstallprompt), which has to be
// caught as soon as the page loads, so this module is imported by main.jsx. iPhone Safari has no popup: the person
// adds it from the Share menu, so there Crux shows how instead.
let deferred = null;
const listeners = new Set();
const tell = () => listeners.forEach((f) => f());

addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; tell(); });
addEventListener('appinstalled', () => { deferred = null; tell(); });

export const installed = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// 'prompt' (the browser's popup is ready), 'ios' (show the Share steps), or null (installed, or this browser can't)
const kind = () => (installed() ? null : deferred ? 'prompt' : ios() ? 'ios' : null);

export function useInstall() {
  const [k, setK] = useState(kind);
  useEffect(() => {
    const f = () => setK(kind());
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  const run = async () => {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    tell();
    return outcome === 'accepted';
  };
  return { kind: k, run };
}
