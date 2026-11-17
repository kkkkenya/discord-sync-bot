// Answers left today (fixplan-e E3): one count for the whole app, read from /api/usage and lowered by one after each
// AI request (api.js sends 'crux-ai-used'). The owner has no limit, so no line. At 3 or fewer it shows in the warning
// colour. This counts Crux on the web; Crux Harness keeps its own count for its hosted models.
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api.js';

let st = { used: null, limit: null };
const subs = new Set();
const set = (patch) => { st = { ...st, ...patch }; subs.forEach((f) => f()); };
let asked = 0;
export function refreshAllowance() {
  if (Date.now() - asked < 5000) return;
  asked = Date.now();
  api('GET', 'usage').then((u) => set({ used: u.ai?.used ?? null, limit: u.ai?.limit ?? null })).catch(() => {});
}
if (typeof window !== 'undefined') {
  window.addEventListener('crux-ai-used', () => { if (st.used != null) set({ used: st.used + 1 }); });
  window.addEventListener('focus', refreshAllowance);
  window.addEventListener('crux-ai-check', () => { asked = 0; refreshAllowance(); }); // a refused AI request may still have been counted
}
export const answersLeft = () => (st.limit == null || st.used == null ? null : Math.max(0, st.limit - st.used));

export function useAllowance() {
  useEffect(() => { refreshAllowance(); }, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st);
}

/** "12 answers left today", or nothing (owner, not known yet). */
export function AnswersLeft({ className = '' }) {
  const a = useAllowance();
  if (a.limit == null || a.used == null) return null;
  const left = Math.max(0, a.limit - a.used);
  return <span className={`answers-left${left <= 3 ? ' warn-text' : ''}${className ? ` ${className}` : ''}`}><span className="num">{left}</span> {left === 1 ? 'answer' : 'answers'} left today</span>;
}

/** When the day's AI answers are used up: what still works without AI. */
export function NoAiLeft({ go, unit }) {
  return (
    <div className="notice" role="status">
      <p>Today's AI answers are used up. They come back tomorrow. Without AI you can still:</p>
      <div className="actions start">
        <button type="button" className="btn" onClick={() => go('practice', { unit })}>Practise solved questions</button>
        <button type="button" className="btn" onClick={() => go('learn', { unit })}>Read Learn</button>
        <button type="button" className="btn" onClick={() => go('kit', { unit })}>Open the sheet</button>
        <button type="button" className="btn plain" onClick={() => go('prompt', { unit })}>Take a pack to any AI</button>
      </div>
    </div>
  );
}
