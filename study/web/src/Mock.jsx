import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Busy from './Busy.jsx';
import { Icon } from './icons.jsx';
import LimitNote from './LimitNote.jsx';
import OpenAt from './OpenAt.jsx';
import Rich, { AnswerBox, QuestionBox } from './Rich.jsx';

const MINUTE = 60000;
const PER_MARK = 1.5; // minutes per mark, as in a CAT: 30 marks in about 45 minutes

const pct = (m) => (m.score != null && m.outOf ? m.score / m.outOf : null);
const tone = (p) => (p == null ? '' : p < 0.4 ? 'bad' : p < 0.6 ? 'warn' : 'good');

// Timed paper: a closed-book mock. Questions come from your bank and, if there aren't enough, are generated from the
// unit's topics. With AI it's marked in one go; without, you see the model answers and mark it yourself.
export default function Mock({ s, unit, refresh, focus, go, notify }) {
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
  useEffect(() => { if (!mock) { setResult(null); setError(''); setSelfEarned([]); } }, [unit]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const marks = (list) => list.reduce((n, q) => n + q.marks, 0);

  return (
    <div className="stack">
      {error && <p className="notice bad" role="alert">{error}</p>}

      {!mock && !result && (
        <form className="card stack" onSubmit={start}>
          <p className="muted small">Closed book, timed at {PER_MARK} minutes a mark. {banked > 0 ? `${banked} banked question${banked === 1 ? '' : 's'} for ${unit}.` : `No banked questions for ${unit} yet, so they're made from your topics.`}</p>
          <div className="pair">
            <label className="field">Questions
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="field">Name (optional)
              <input placeholder="CAT 1 revision" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
          <label className="check"><input type="checkbox" checked={predicted} onChange={(e) => setPredicted(e.target.checked)} /> Predicted from past papers</label>
          <div className="toolbar"><button className="btn primary" disabled={busy || !unit}><Busy on={busy} label="Building…" idle="Start timed paper" /></button></div>
        </form>
      )}

      {mock && (
        <>
          <div className="paper-bar glass" role="timer" aria-live="off">
            <span className="row-main"><b>{mock.name}</b><span className="row-sub num">{mock.questions.length} questions · {marks(mock.questions)} marks · {Math.round(duration.current / MINUTE)} min</span></span>
            <span className={`paper-clock num${left <= 0 ? ' over' : ''}`}>{mm(left)}</span>
          </div>
          {left <= 0 && <p className="notice bad" role="status">Time's up. Finish the line you're on and submit.</p>}
          {mock.questions.map((q, i) => (
            <section className="stack" key={i}>
              <QuestionBox text={q.q} label={`Question ${i + 1}`} marks={q.marks}>
                {q.fileId && <div className="qbox-tools"><OpenAt fileId={q.fileId} page={q.page} book={q.book} /></div>}
              </QuestionBox>
              <label className="field"><span className="visually-hidden">Answer to question {i + 1}</span>
                <textarea rows={4} placeholder="Your answer" value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
              </label>
            </section>
          ))}
          <div className="toolbar"><button className="btn primary" type="button" onClick={submit} disabled={busy}><Busy on={busy} label="Marking…" idle="Submit" /></button></div>
        </>
      )}

      {result && result.selfMark && (
        <>
          <p className="muted">Mark each answer against the model answer.</p>
          {result.items.map((it, i) => (
            <section className="stack" key={i}>
              <QuestionBox text={it.q} label={`Question ${i + 1}`} marks={it.marks} />
              {it.user && <AnswerBox text={it.user} label="Your answer" tone="mine" />}
              <AnswerBox text={it.a} label="Model answer" tone="model" />
              <label className="field inline">Marks earned
                <span className="toolbar"><input className="num narrow" type="number" min="0" max={it.marks} value={selfEarned[i]} onChange={(e) => setSelfEarned(selfEarned.map((v, j) => (j === i ? e.target.value : v)))} /><span className="muted num">of {it.marks}</span></span>
              </label>
            </section>
          ))}
          <div className="toolbar"><button className="btn primary" type="button" onClick={saveSelf} disabled={busy}>{busy ? 'Saving…' : 'Save scores'}</button></div>
        </>
      )}

      {result && !result.selfMark && (
        <>
          <LimitNote s={s} unit={result.unit} go={go} what="marking multi-step answers" />
          <section className="card stack" aria-label="Result">
            <p className="score-big num">{result.score}<span className="muted">/{result.outOf}</span> <span className={`chip ${tone(pct(result))}`}>{Math.round((result.score / result.outOf) * 100)}%</span></p>
            {result.overall && <Rich text={result.overall} />}
          </section>
          {result.items.map((it, i) => (
            <section className="stack" key={i}>
              <QuestionBox text={it.q} label={`Question ${i + 1}`}><span className={`chip num ${tone(it.earned / it.marks)}`}>{it.earned}/{it.marks}</span></QuestionBox>
              <AnswerBox text={it.user || '(blank)'} label="Your answer" tone="mine" />
              <AnswerBox text={it.a} label="Answer" tone="key">{it.note && <Rich text={it.note} className="muted small" />}</AnswerBox>
            </section>
          ))}
          <div className="toolbar"><button className="btn" type="button" onClick={() => setResult(null)}>Back to timed papers</button></div>
        </>
      )}

      {history.length > 0 && !mock && (
        <details className="disclosure">
          <summary>Past timed papers <span className="muted num">({history.length})</span></summary>
          <div className="list flat">
            {history.map((m) => (
              <div key={m.id} className="list-row static">
                <span className="row-main"><span><b className="num">{m.unit}</b> {m.name}</span><span className="row-sub num">{m.at.slice(0, 10)}</span></span>
                <span className={`chip num ${tone(pct(m))}`}>{m.score != null ? `${m.score}/${m.outOf}` : m.answers?.length ? 'Unmarked' : 'Unfinished'}</span>
                <button type="button" className="iconbtn" aria-label={`Delete ${m.name}`} onClick={() => api('DELETE', `mocks/${m.id}`).then(() => { notify(`Deleted "${m.name}"`, () => api('POST', 'mocks', { restore: m })); refresh(); })}>
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
