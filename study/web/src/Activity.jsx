import { useEffect, useState } from 'react';
import { api } from './api.js';

const date = (day, opts) => new Date(`${day}T12:00:00+03:00`).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', ...opts });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function what(d) {
  const parts = [d.questions && plural(d.questions, 'question'), d.sessions && plural(d.sessions, 'session'), d.teach && plural(d.teach, 'teach-back'),
    d.mocks && plural(d.mocks, 'mock'), d.files && `${plural(d.files, 'file')} posted`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing';
}
// 0 to 4, like a commit graph: relative to your busiest day, so a quiet week still shows its best days
const level = (n, max) => (!n ? 0 : Math.min(4, Math.ceil((4 * n) / Math.max(max, 4))));

// Your days of study, one square a day for 20 weeks: questions checked, sessions, teach-backs, mocks and files the
// hub posted for you. Only you see it.
export function Activity({ s }) {
  const [a, setA] = useState(null);
  useEffect(() => { api('GET', 'activity').then(setA).catch(() => {}); }, [s]);
  if (!a) return null;
  const max = Math.max(...a.days.map((d) => d.n));
  const months = a.days.map((d, i) => (i % 7 === 0 && (i === 0 || d.day.slice(5, 7) !== a.days[i - 7].day.slice(5, 7)) ? { col: i / 7 + 1, label: date(d.day, { month: 'short' }) } : null)).filter(Boolean)
    .filter((m, i, all) => !all[i + 1] || all[i + 1].col - m.col >= 3); // a month with a day or two at the start has no room
  return (
    <div className="card stack-s">
      <div className="card-head">
        <h2>Your study days</h2>
        {a.streak > 1 && <span className="chip num">{a.streak}-day streak</span>}
      </div>
      <div className="days-wrap">
        <div className="days-months" aria-hidden="true">{months.map((m) => <span key={m.col} style={{ gridColumn: m.col }}>{m.label}</span>)}</div>
        <ol className="days" aria-label={`${a.total} things done in the last 20 weeks`}>
          {a.days.map((d) => (
            <li key={d.day} className={`l${level(d.n, max)}`} title={`${date(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${what(d)}`}>
              <span className="visually-hidden">{date(d.day, { day: 'numeric', month: 'short' })}: {what(d)}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="row-sub">{a.total ? `${a.total} things done in 20 weeks: questions, sessions, teach-backs, mocks and files the hub posted for you. Only you see this.` : 'Each day you check a question, study, teach back or add a file fills in a square. Only you see this.'}</p>
    </div>
  );
}

// The students who've added the most files to the hub this semester (files it already had don't count).
export function Contributors({ s }) {
  const [c, setC] = useState(null);
  useEffect(() => { api('GET', 'contributors').then(setC).catch(() => {}); }, [s]);
  if (!c?.top.length) return null;
  return (
    <div className="card stack-s">
      <div className="card-head"><span className="row-main"><h2>Top contributors</h2><span className="row-sub">Files added to the hub since {date(c.since, { day: 'numeric', month: 'long' })}</span></span></div>
      <ol className="leaders">
        {c.top.map((x, i) => (
          <li key={`${x.name}${i}`} className={x.you ? 'is-you' : ''}>
            <span className="leader-n num">{i + 1}</span>
            <span className="row-main">{x.name}{x.you && <span className="muted"> (you)</span>}</span>
            <span className="num">{plural(x.files, 'file')}</span>
          </li>
        ))}
      </ol>
      {c.you && !c.top.some((x) => x.you) && <p className="row-sub">You're number {c.you.rank} with {plural(c.you.files, 'file')}.</p>}
      {!c.you && <p className="row-sub">Add a past paper or marking scheme on a unit's Notes tab to join the list.</p>}
    </div>
  );
}
