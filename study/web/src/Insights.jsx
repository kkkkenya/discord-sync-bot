import { useEffect, useState } from 'react';
import { api } from './api.js';

const ago = (today, day) => {
  if (!day) return 'Not tried yet';
  const n = Math.round((Date.parse(today) - Date.parse(day)) / 864e5);
  return n <= 0 ? 'Tried today' : n === 1 ? 'Tried yesterday' : `Tried ${n} days ago`;
};

// Weakspots across every unit, mistakes by type over 14 days, and questions tried per day.
export default function Insights({ s, go, deeper }) {
  const [d, setD] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { api('GET', 'insights').then(setD).catch((e) => setProblem(e.message)); }, [s]);
  if (problem) return <p className="notice bad">{problem}</p>;
  if (!d) return <div className="skeleton" style={{ height: 240 }} />;
  const maxErr = Math.max(1, ...d.errors.map((e) => e.n));
  const maxDay = Math.max(1, ...d.trend.map((x) => x.tried));
  const wrongs = d.errors.reduce((n, e) => n + e.n, 0);
  return (
    <>
      <div>
        <h2 className="list-title">Fix first</h2>
        {!d.weakspots.length ? (
          <div className="card"><p className="row-sub">Rate your sub-topics or try some questions, and your weakest spots show up here.</p></div>
        ) : (
          <div className="list">
            {d.weakspots.map((w) => (
              <div key={w.subtopicId} className="list-row weak">
                <span className="row-main">
                  <span>{w.name}</span>
                  <span className="row-sub">{w.unit} · {w.topic} · {ago(s.today, w.lastTried)}{w.errorTypes.length ? ` · ${w.errorTypes.join(', ')}` : ''}</span>
                </span>
                <span className="weak-actions">
                  <button className="btn" onClick={() => go('practice', { unit: w.unit, topicId: w.topicId, subtopicId: w.subtopicId })}>Practise</button>
                  <button className="btn plain" onClick={() => deeper({ unit: w.unit, topicId: w.topicId })}>Go deeper</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Mistakes, last 14 days</h2>
        {!wrongs ? <p className="row-sub">None logged. When an answer is wrong, mark where it broke and it counts here.</p> : (
          <ul className="bars">
            {d.errors.map((e) => (
              <li key={e.id}>
                <span className="bar-label">{e.label}</span>
                <span className="bar"><span style={{ width: `${(100 * e.n) / maxErr}%` }} /></span>
                <span className="bar-n">{e.n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Questions tried</h2>
        <div className="trend" role="img" aria-label={`Questions tried per day for 14 days: ${d.trend.map((x) => x.tried).join(', ')}`}>
          {d.trend.map((x) => (
            <span key={x.day} className="col" title={`${x.day}: ${x.tried} tried, ${x.right} right`}>
              <span className="tried" style={{ height: `${(100 * x.tried) / maxDay}%` }}><span className="right" style={{ height: `${x.tried ? (100 * x.right) / x.tried : 0}%` }} /></span>
            </span>
          ))}
        </div>
        <p className="row-sub">Last 14 days. The darker part is right answers.</p>
      </div>
    </>
  );
}
