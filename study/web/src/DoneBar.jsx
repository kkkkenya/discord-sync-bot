// The done bar (fixplan-e E3): when a task ends (an answer checked, a broken step marked, a teach-back scored), one
// line of what changed and the way on: Next (Today's first action that is not the one just done) and Today. So a
// student can keep going without going back to Today. Opened by finished({ change, questionId, kind }).
import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
import { href } from './route.js';

const STATUS = { red: 'red', amber: 'amber', green: 'green' };
export const finished = (detail) => window.dispatchEvent(new CustomEvent('crux-done', { detail }));

export function changeLine(change, kind) {
  if (!change) return kind === 'teach' ? 'Explanation saved' : 'Saved';
  const { topic, from, to } = change;
  if (from && to && from !== to) return `${topic}: ${STATUS[from] || from} → ${STATUS[to] || to}`;
  return `${topic}: still ${STATUS[to] || to}`;
}

// the first action that is not the task just done
export function nextAfter(actions = [], done = {}) {
  const same = (a) => (done.questionId && a.focus?.questionId === done.questionId)
    || (done.kind === 'teach' && a.focus?.section === 'teach' && String(a.focus?.topic || '').toLowerCase() === String(done.topic || '').toLowerCase());
  return actions.find((a) => !same(a)) || null;
}

export default function DoneBar({ s, go }) {
  const [done, setDone] = useState(null);
  useEffect(() => {
    const on = (e) => setDone({ ...e.detail, at: Date.now() });
    const off = () => setDone(null);
    window.addEventListener('crux-done', on);
    window.addEventListener('hashchange', off);
    return () => { window.removeEventListener('crux-done', on); window.removeEventListener('hashchange', off); };
  }, []);
  if (!done) return null;
  const next = nextAfter(s.next, done);
  return (
    <div className="donebar glass" role="status" aria-live="polite">
      <span className={`fdot ${done.change?.to || ''}`} aria-hidden="true" />
      <span className="donebar-line">{changeLine(done.change, done.kind)}</span>
      {next && <button type="button" className="btn primary" onClick={() => { setDone(null); go(next.focus?.section || 'today', next.focus || {}); }}>Next: {next.label}</button>}
      <a className="btn" href={href('today')} onClick={() => setDone(null)}>Today</a>
      <button type="button" className="iconbtn" aria-label="Close" onClick={() => setDone(null)}><Icon name="close" /></button>
    </div>
  );
}
