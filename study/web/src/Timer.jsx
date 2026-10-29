import { useEffect, useRef, useState } from 'react';
import { api, questEvent } from './api.js';

// Focus timer: 25 or 50 minutes on the current unit. A session of a minute or more is saved when it ends or you stop.
// The unit is fixed when you press Focus, so switching units elsewhere doesn't move a running session.
export default function Timer({ s, refresh, unit, setUnit }) {
  const [length, setLength] = useState(25);
  const [end, setEnd] = useState(null);
  const [now, setNow] = useState(Date.now());
  const started = useRef(0);
  const on = useRef('');

  useEffect(() => {
    if (!end) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end]);

  const finish = (minutes, endedEarly) => {
    setEnd(null);
    document.title = 'Study Desk';
    if (minutes >= 1) api('POST', 'sessions', { unit: on.current, minutes, endedEarly }).then(refresh);
  };

  const left = end ? Math.max(0, end - now) : 0;
  useEffect(() => {
    if (!end) return;
    const mm = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
    document.title = `${mm} · ${on.current}`;
    if (left === 0) finish(length, false);
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.data.units.length) return null;
  const clock = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
  return (
    <aside className="timer">
      {end ? (
        <>
          <span className="clock">{clock}</span>
          <span className="small">{on.current}</span>
          <button className="ghost" onClick={() => { const m = Math.floor((Date.now() - started.current) / 60000); finish(m, m < length); }}>Stop</button>
        </>
      ) : (
        <>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
            {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
          </select>
          <select value={length} onChange={(e) => setLength(Number(e.target.value))} aria-label="Length">
            <option value={25}>25 min</option><option value={50}>50 min</option>
          </select>
          <button onClick={() => { questEvent('focus-start'); on.current = unit; started.current = Date.now(); setNow(Date.now()); setEnd(Date.now() + length * 60000); }}>Focus</button>
        </>
      )}
    </aside>
  );
}
