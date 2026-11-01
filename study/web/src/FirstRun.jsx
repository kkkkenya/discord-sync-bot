import { useEffect, useState } from 'react';
import { api } from './api.js';

const YEARS = [1, 2, 3, 4, 5];

// The first run, for a document with no units: course and year, the units you take, then their dates.
export default function FirstRun({ s, refresh }) {
  const [step, setStep] = useState(1);
  const [cat, setCat] = useState(null);
  const [cohort, setCohort] = useState(s.settings.cohort || { course: 'EMM', year: 3, sem: 1 });
  const [picked, setPicked] = useState(new Set());
  const [units, setUnits] = useState([]);
  const [dates, setDates] = useState({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    api('GET', `catalog?course=${cohort.course}&year=${cohort.year}`).then((c) => { setCat(c); setPicked(new Set(c.core.map((u) => u.code))); })
      .catch((e) => setProblem(e.message));
  }, [cohort.course, cohort.year]);

  const run = (fn) => async () => {
    setBusy(true); setProblem('');
    try { await fn(); } catch (e) { setProblem(e.message); }
    setBusy(false);
  };
  const saveCohort = run(async () => { await api('POST', 'settings', { cohort }); setStep(2); });
  const saveUnits = run(async () => {
    const list = [...(cat?.core || []), ...(cat?.shared || [])].filter((u) => picked.has(u.code)).map((u) => ({ code: u.code, title: u.title }));
    if (!list.length) throw new Error('Pick at least one unit.');
    setUnits(list);
    setStep(3);
  });
  const finish = run(async () => {
    await api('PUT', 'units', units);
    for (const u of units) {
      const d = dates[u.code];
      if (d) await api('PATCH', `units?code=${encodeURIComponent(u.code)}`, { catDate: d });
    }
    await refresh();
  });

  const all = [...(cat?.core || []), ...(cat?.shared || [])];
  return (
    <div className="firstrun">
      <header className="page-head">
        <p className="row-sub">Step {step} of 3</p>
        <h1>{step === 1 ? 'Your course' : step === 2 ? 'Your units' : 'CAT dates'}</h1>
        {step === 3 && <p>Leave a date empty to use the KU calendar, or mark it TBA. You can change these later.</p>}
      </header>
      {problem && <p className="notice bad" role="alert">{problem}</p>}

      {step === 1 && (
        <div className="card">
          <label className="field">Course
            <select value={cohort.course} onChange={(e) => setCohort({ ...cohort, course: e.target.value })}>
              {(cat?.courses || [{ code: cohort.course, name: cohort.course }]).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <div className="pair">
            <label className="field">Year
              <select value={cohort.year} onChange={(e) => setCohort({ ...cohort, year: Number(e.target.value) })}>
                {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </label>
            <label className="field">Semester
              <select value={cohort.sem} onChange={(e) => setCohort({ ...cohort, sem: Number(e.target.value) })}>
                <option value={1}>Semester 1</option><option value={2}>Semester 2</option>
              </select>
            </label>
          </div>
          <button className="btn primary" onClick={saveCohort} disabled={busy}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <>
          <fieldset className="list checks">
            <legend className="visually-hidden">Units you take this semester</legend>
            {all.map((u) => (
              <label key={u.code} className="list-row">
                <input type="checkbox" checked={picked.has(u.code)} onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(u.code); else next.delete(u.code);
                  setPicked(next);
                }} />
                <span className="row-main"><span>{u.code}</span><span className="row-sub">{u.title}</span></span>
              </label>
            ))}
            {!all.length && <p className="empty">No units found for this course and year.</p>}
          </fieldset>
          <div className="actions">
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary" onClick={saveUnits} disabled={busy || !picked.size}>Continue</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="list">
            {units.map((u) => (
              <div key={u.code} className="list-row">
                <span className="row-main"><span>{u.code}</span><span className="row-sub">{u.title}</span></span>
                <label className="tba"><input type="checkbox" checked={dates[u.code] === 'TBA'} onChange={(e) => setDates({ ...dates, [u.code]: e.target.checked ? 'TBA' : '' })} /> TBA</label>
                <input type="date" aria-label={`${u.code} CAT date`} disabled={dates[u.code] === 'TBA'} value={dates[u.code] && dates[u.code] !== 'TBA' ? dates[u.code] : ''}
                  onChange={(e) => setDates({ ...dates, [u.code]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setStep(2)}>Back</button>
            <button className="btn primary" onClick={finish} disabled={busy}>{busy ? 'Saving…' : 'Start'}</button>
          </div>
        </>
      )}
    </div>
  );
}
