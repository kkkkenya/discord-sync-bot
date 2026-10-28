import { useEffect, useState } from 'react';
import { api, pct } from './api.js';

export default function Papers({ s, refresh, focus }) {
  const blank = { unit: s.data.units[0]?.code || '', label: '', score: '', outOf: '', fileId: null };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (focus?.section === 'papers') setF((x) => ({ ...x, unit: focus.unit || x.unit, label: focus.label || '', fileId: focus.fileId || null }));
  }, [focus]);

  const save = async (e) => {
    e.preventDefault();
    await api('POST', 'papers', { ...f, score: Number(f.score), outOf: Number(f.outOf) });
    setF({ ...blank, unit: f.unit });
    refresh();
  };

  const rows = [...s.data.papers].sort((a, b) => b.at.localeCompare(a.at));
  const byUnit = s.data.units.map((u) => {
    const ps = s.data.papers.filter((p) => p.unit === u.code);
    return { u, n: ps.length, last: ps.at(-1), avg: ps.length ? Math.round(ps.reduce((n, p) => n + pct(p), 0) / ps.length) : null, mins: s.stats.minutesWeek[u.code] || 0 };
  });

  return (
    <section id="papers" className="reveal">
      <h2>Past papers</h2>
      <p className="muted small">Do them timed, closed book, then mark honestly. Redo every question you lost marks on, closed book, then teach back the topic behind it. Open papers from a unit's "server files".</p>
      <form className="row wrap" onSubmit={save}>
        <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
          {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
        </select>
        <input className="grow" placeholder="Which paper (e.g. 2023 CAT 1)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} required />
        <input className="num" type="number" min="0" step="0.5" placeholder="Score" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} required />
        <span>/</span>
        <input className="num" type="number" min="1" placeholder="Out of" value={f.outOf} onChange={(e) => setF({ ...f, outOf: e.target.value })} required />
        <button disabled={!f.unit}>Log</button>
      </form>

      {byUnit.length > 0 && (
        <table>
          <thead><tr><th>Unit</th><th>Papers</th><th>Average</th><th>Last</th><th>Study this week</th></tr></thead>
          <tbody>
            {byUnit.map(({ u, n, avg, last, mins }) => (
              <tr key={u.code}>
                <td><span className="code">{u.code}</span></td>
                <td>{n}</td>
                <td>{avg === null ? '–' : <span className={avg < 40 ? 'hot' : avg < 60 ? 'warm' : 'ok'}>{avg}%</span>}</td>
                <td>{last ? `${pct(last)}%` : '–'}</td>
                <td><span className="bar" style={{ '--w': `${Math.min(100, mins / 3)}%` }} />{Math.round(mins / 6) / 10}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 0 && (
        <ul className="log">
          {rows.slice(0, 12).map((p) => (
            <li key={p.id}><span className="code">{p.unit}</span> {p.label} <b>{p.score}/{p.outOf}</b> ({pct(p)}%) <span className="muted small">{p.at.slice(0, 10)}</span>
              <button className="x" aria-label="delete" onClick={() => api('DELETE', `papers/${p.id}`).then(refresh)}>×</button></li>
          ))}
        </ul>
      )}
    </section>
  );
}
