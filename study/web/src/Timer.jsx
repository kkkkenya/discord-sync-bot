import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import CheckIn from './CheckIn.jsx';

// Focus timer: 25 or 50 minutes on one unit. When it ends (or you stop after 5+ min), a quick check-in
// captures focus / kind / energy before the session is saved, so insights can learn your patterns.
export default function Timer({ s, refresh }) {
  const [unit, setUnit] = useState('');
  const [length, setLength] = useState(25);
  const [end, setEnd] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [checkIn, setCheckIn] = useState(null);
  const started = useRef(0);

  useEffect(() => { if (!unit && s.plan[0]) setUnit(s.plan[0].code); }, [s.plan, unit]);
  useEffect(() => {
    if (!end) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end]);

  const saveSession = async (extra = {}) => {
    await api('POST', 'sessions', { unit, minutes: checkIn.minutes, endedEarly: checkIn.endedEarly, ...extra });
    setCheckIn(null);
    refresh();
  };

  const finish = (minutes, endedEarly) => {
    setEnd(null);
    document.title = 'Study Desk';
    if (minutes >= 5) setCheckIn({ minutes, endedEarly });
    else if (minutes >= 1) api('POST', 'sessions', { unit, minutes, endedEarly }).then(refresh);
  };

  const left = end ? Math.max(0, end - now) : 0;
  useEffect(() => {
    if (!end) return;
    const mm = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
    document.title = `${mm} · ${unit}`;
    if (left === 0) finish(length, false);
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.data.units.length) return null;
  const clock = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
  return (
    <>
      <aside className="timer">
        {end ? (
          <>
            <span className="clock">{clock}</span>
            <span className="small">{unit}</span>
            <button className="ghost" onClick={() => { const m = Math.floor((Date.now() - started.current) / 60000); finish(m, m < length); }}>Stop</button>
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
      {checkIn && (
        <div className="checkin-backdrop">
          <CheckIn onSave={saveSession} onSkip={() => saveSession({})} />
        </div>
      )}
    </>
  );
}
