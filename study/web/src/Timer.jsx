import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

// Focus timer: 25 or 50 minutes on one unit, logged when it ends (or when you stop it, for the minutes done).
export default function Timer({ s, refresh }) {
  const [unit, setUnit] = useState('');
  const [length, setLength] = useState(25);
  const [end, setEnd] = useState(null);
  const [now, setNow] = useState(Date.now());
  const started = useRef(0);

  useEffect(() => { if (!unit && s.plan[0]) setUnit(s.plan[0].code); }, [s.plan, unit]);
  useEffect(() => {
    if (!end) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end]);

  const log = async (minutes) => {
    setEnd(null);
    document.title = 'Study Desk';
    if (minutes >= 1) { await api('POST', 'sessions', { unit, minutes }); refresh(); }
  };

  const left = end ? Math.max(0, end - now) : 0;
  useEffect(() => {
    if (!end) return;
    const mm = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
    document.title = `${mm} · ${unit}`;
    if (left === 0) {
      log(length);
      alert(`${length} minutes on ${unit} done. Logged. Take 5, then recall what you just studied.`);
    }
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.data.units.length) return null;
  return (
    <aside className="timer">
      {end ? (
        <>
          <span className="clock">{Math.floor(left / 60000)}:{String(Math.floor(left / 1000) % 60).padStart(2, '0')}</span>
          <span className="small">{unit}</span>
          <button className="ghost" onClick={() => log(Math.floor((Date.now() - started.current) / 60000))}>Stop</button>
        </>
      ) : (
        <>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="unit">
            {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
          </select>
          <select value={length} onChange={(e) => setLength(Number(e.target.value))} aria-label="length">
            <option value={25}>25 min</option><option value={50}>50 min</option>
          </select>
          <button onClick={() => { started.current = Date.now(); setNow(Date.now()); setEnd(Date.now() + length * 60000); }}>Focus</button>
        </>
      )}
    </aside>
  );
}
