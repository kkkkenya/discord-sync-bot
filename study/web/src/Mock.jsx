import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Busy from './Busy.jsx';
import LimitNote from './LimitNote.jsx';

const MINUTE = 60000;
const PER_MARK = 1.5; // minutes per mark, as in a CAT: 30 marks in about 45 minutes

// Timed, closed-book mock exam. Questions come from your bank (built by Notes) and, if there aren't enough,
// are generated fresh from the unit's topics. With an AI key it's marked in one go; without,
// you see the model answers and self-mark.
export default function Mock({ s, unit, setUnit, refresh, focus, go, notify }) {
  const [count, setCount] = useState(5);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mock, setMock] = useState(null);       // active mock (no answers shown)
  const [answers, setAnswers] = useState([]);
  const [left, setLeft] = useState(null);       // ms remaining
  const [result, setResult] = useState(null);   // submitted result
  const [selfEarned, setSelfEarned] = useState([]);
  const startedAt = useRef(0);
  const duration = useRef(0);

  const [predicted, setPredicted] = useState(false);
  useEffect(() => {
    if (focus?.section !== 'mock') return;
    setPredicted(Boolean(focus.predicted));
  }, [focus]);

  useEffect(() => {
    if (left == null || left <= 0) return;
    const t = setInterval(() => setLeft(duration.current - (Date.now() - startedAt.current)), 1000);
    return () => clearInterval(t);
  }, [left]);

  const start = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setResult(null); setSelfEarned([]);
    try {
      const m = await api('POST', 'mocks', { unit, count, name, predicted });
      setMock(m);
      setAnswers(m.questions.map(() => ''));
      duration.current = m.questions.reduce((n, q) => n + q.marks, 0) * PER_MARK * MINUTE;
      startedAt.current = Date.now();
      setLeft(duration.current);
      refresh();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const r = await api('POST', `mocks/${mock.id}/submit`, { answers });
      setMock(null); setLeft(null);
      setResult(r);
      if (r.selfMark) setSelfEarned(r.items.map(() => 0));
      refresh();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const saveSelf = async () => {
    setBusy(true); setError('');
    try {
      const outOf = result.items.reduce((n, it) => n + it.marks, 0);
      const score = Math.min(selfEarned.reduce((a, b) => a + (Number(b) || 0), 0), outOf);
      const items = result.items.map((it, i) => ({ ...it, earned: Number(selfEarned[i]) || 0 }));
      await api('PATCH', `mocks/${result.id}`, { score, outOf, answers: items.map((it) => ({ user: it.user, earned: it.earned })), finishedAt: new Date().toISOString() });
      refresh();
      setResult({ ...result, score, outOf, selfMark: false, items });
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const history = [...s.data.mocks].sort((a, b) => b.at.localeCompare(a.at));
  const banked = s.data.questions.filter((q) => q.unit === unit).length;
  const mm = (ms) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`;

  return (
    <section id="mock" className="reveal">
      <div className="head"><h2>Mock exam</h2></div>
      {error && <p className="banner bad">{error}</p>}

      {!mock && !result && (
        <>
          <p className="muted small">Closed book, timed at {PER_MARK} minutes a mark. {banked > 0 ? `You have ${banked} banked question${banked === 1 ? '' : 's'} for ${unit}.` : 'No banked questions for this unit yet, so questions are generated from your topics.'}</p>
          <form className="row wrap" onSubmit={start}>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
              {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
            </select>
            <label className="muted small">Questions
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <input className="grow" placeholder="Name (optional, e.g. CAT 1 revision)" aria-label="Mock name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="small"><input type="checkbox" checked={predicted} onChange={(e) => setPredicted(e.target.checked)} /> Predicted (from past papers)</label>
            <button disabled={busy || !unit}><Busy on={busy} label="Building…" idle="Start mock" /></button>
          </form>
        </>
      )}

      {mock && (
        <div className="mock">
          <div className="mock-head">
            <b>{mock.name}</b> <span className="muted small">{mock.questions.length} questions · {mock.questions.reduce((n, q) => n + q.marks, 0)} marks · {Math.round(duration.current / MINUTE)} min</span>
            <span className={`clock ${left <= 0 ? 'hot' : ''}`}>{mm(left)}</span>
            {left <= 0 && <span className="hot small">Time's up: finish and submit.</span>}
          </div>
          {mock.questions.map((q, i) => (
            <div className="mq" key={i}>
              <p className="q"><b>{i + 1}.</b> {q.q} <span className="muted small">({q.marks} marks)</span></p>
              <textarea rows={3} placeholder="Write your answer…" value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
            </div>
          ))}
          <button onClick={submit} disabled={busy}><Busy on={busy} label="Marking…" idle="Submit" /></button>
        </div>
      )}

      {result && result.selfMark && (
        <div className="mock">
          <div className="mock-head"><b>{result.name}</b> <span className="muted small">mark each answer yourself against the model answer</span></div>
          {result.items.map((it, i) => (
            <div className="mq" key={i}>
              <p className="q"><b>{i + 1}.</b> {it.q} <span className="muted small">({it.marks} marks)</span></p>
              {it.user && <p className="mine"><b>You:</b> {it.user}</p>}
              <p className="a"><b>Model answer:</b> {it.a}</p>
              <label className="muted small">Marks earned
                <input className="num" type="number" min="0" max={it.marks} value={selfEarned[i]} onChange={(e) => setSelfEarned(selfEarned.map((v, j) => (j === i ? e.target.value : v)))} /> / {it.marks}
              </label>
            </div>
          ))}
          <button onClick={saveSelf} disabled={busy}>{busy ? 'Saving…' : 'Save scores'}</button>
        </div>
      )}

      {result && !result.selfMark && (
        <div className="mock feedback">
          <LimitNote s={s} unit={result.unit} go={go} what="marking multi-step answers" />
          <p className="score">{result.score}/{result.outOf} <span className="muted small">({Math.round((result.score / result.outOf) * 100)}%)</span></p>
          {result.overall && <p>{result.overall}</p>}
          {result.items.map((it, i) => (
            <div className="mq" key={i}>
              <p className="q"><b>{i + 1}.</b> {it.q}</p>
              <p className="a"><b>Answer:</b> {it.a}</p>
              <p className="mine"><b>You:</b> {it.user || '(blank)'}</p>
              <p><span className={it.earned === it.marks ? 'ok' : it.earned === 0 ? 'hot' : 'warm'}><b>{it.earned}/{it.marks}</b></span> {it.note}</p>
            </div>
          ))}
          <button className="ghost" onClick={() => { setResult(null); }}>Back to mocks</button>
        </div>
      )}

      {history.length > 0 && (
        <details className="past">
          <summary>Past mocks ({history.length})</summary>
          {history.map((m) => (
            <div key={m.id} className="row">
              <span className="code">{m.unit}</span> <b>{m.name}</b>
              <span className={m.score != null ? (m.score / m.outOf < 0.4 ? 'hot' : m.score / m.outOf < 0.6 ? 'warm' : 'ok') : 'muted'}>
                {m.score != null ? `${m.score}/${m.outOf}` : m.answers?.length ? 'unmarked' : 'unfinished'}
              </span>
              <span className="muted small">{m.at.slice(0, 10)}</span>
              <button className="x" aria-label={`delete ${m.name}`} onClick={() => api('DELETE', `mocks/${m.id}`).then(() => { notify(`Deleted "${m.name}"`, () => api('POST', 'mocks', { restore: m })); refresh(); })}>×</button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
