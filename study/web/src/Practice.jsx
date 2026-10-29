import { useEffect, useState } from 'react';
import { api, useElapsed } from './api.js';
import { photoData } from './media.js';
import LimitNote from './LimitNote.jsx';

// Checkpoint feedback: type your final answer (and, if you like, the operations you used). A right answer is
// accepted in any unit. A wrong one shows numbered checkpoints; tap "Broke here" on the step where your paper
// diverged and it goes into your weakspots. Nothing is held against you until you do.
export default function Practice({ s, unit, setUnit, refresh, go, focus, notify }) {
  const [questions, setQuestions] = useState([]);
  const [questionId, setQuestionId] = useState('');
  const [pasted, setPasted] = useState('');
  const [answer, setAnswer] = useState('');
  const [ops, setOps] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [steps, setSteps] = useState({ list: [], note: '' }); // the checkpoints on show
  const [open, setOpen] = useState(null); // the checkpoint whose "Broke here" form is open
  const [form, setForm] = useState({ subtopicId: '', errorType: 'concept-gap' });
  const [done, setDone] = useState({}); // step -> 'broke' | 'flagged'
  const [err, setErr] = useState('');
  const [photoMsg, setPhotoMsg] = useState(''); // why a photo couldn't be checked

  const [want, setWant] = useState(null); // { topicId, subtopicId } from a weakspot: pick its newest question
  useEffect(() => { if (unit) api('GET', `predict?unit=${encodeURIComponent(unit)}`).then((p) => setQuestions(p.questions)).catch(() => setQuestions([])); }, [unit]);
  // arriving from a past-paper question, a Today task or a weakspot
  useEffect(() => {
    if (focus?.section !== 'practice' || !focus.unit) return;
    setQuestionId(focus.questionId || ''); clear();
    setWant(!focus.questionId && focus.topicId ? { topicId: focus.topicId, subtopicId: focus.subtopicId } : null);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!want) return;
    const on = questions.filter((q) => q.unit === unit && q.topicId === want.topicId);
    if (!on.length) return;
    const best = (on.some((q) => q.subtopicIds?.includes(want.subtopicId)) ? on.filter((q) => q.subtopicIds?.includes(want.subtopicId)) : on)
      .sort((a, b) => (b.year || 0) - (a.year || 0))[0];
    setQuestionId(best.id); setWant(null);
  }, [want, questions, unit]);
  const waited = useElapsed(busy);

  const clear = () => { setRes(null); setSteps({ list: [], note: '' }); setOpen(null); setDone({}); setErr(''); };
  const question = questions.find((q) => q.id === questionId);
  const topicId = question?.topicId || '';
  const label = (id) => s.errorTypes.find((e) => e.id === id)?.label || id;

  const check = async (e) => {
    e.preventDefault();
    setBusy(true); clear();
    try {
      const out = await api('POST', 'attempts/check', { unit, questionId: questionId || undefined, question: questionId ? undefined : pasted, answer, operations: ops || undefined, key: key || undefined });
      setRes(out);
      setSteps({ list: out.checkpoints || [], note: out.checkpointNote || '' });
      if (out.attempt) refresh();
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  // Phase 9: a photo of the working instead of a typed answer; a suggested broken step opens pre-filled
  const photo = async (file) => {
    if (!file) return;
    setBusy(true); clear(); setPhotoMsg('');
    try {
      const out = await api('POST', 'attempts/photo', { unit, questionId: questionId || undefined, question: questionId ? undefined : pasted, image: await photoData(file), key: key || undefined });
      if (out.needVision || out.unreadablePhoto) setPhotoMsg(out.message || out.note);
      else {
        setRes(out);
        setSteps({ list: out.checkpoints || [], note: out.checkpointNote || '' });
        if (out.read) setAnswer(out.read.finalAnswer);
        const cp = out.suggest && out.checkpoints.find((c) => c.n === out.suggest.brokeAt);
        if (cp) { setOpen(cp.n); setForm({ subtopicId: cp.subtopicId || out.guess?.subtopicId || '', errorType: out.suggest.errorType || out.guess?.errorType || cp.errorType || 'concept-gap' }); }
        if (out.attempt) refresh();
      }
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  const show = async () => {
    setBusy(true);
    try { const out = await api('POST', 'attempts/checkpoints', { id: res.attempt.id }); setSteps({ list: out.checkpoints, note: out.note }); } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  const openForm = (cp) => {
    setOpen(cp.n);
    setForm({ subtopicId: cp.subtopicId || res.guess.subtopicId || '', errorType: res.guess.errorType || cp.errorType || 'concept-gap' });
  };
  const broke = async (cp) => {
    try {
      await api('POST', 'attempts/broke', { id: res.attempt.id, step: cp.n, subtopicId: form.subtopicId || null, errorType: form.errorType });
      const sub = res.subtopics.find((x) => x.id === form.subtopicId);
      setDone({ [cp.n]: 'broke' }); setOpen(null);
      notify(`Logged: ${sub ? `${sub.name} · ` : ''}${label(form.errorType)}. Your weakspots are updated.`);
      refresh();
    } catch (x) { setErr(x.message); }
  };
  const flag = async (cp) => {
    try {
      await api('POST', 'attempts/flag', { id: res.attempt.id, step: cp.n });
      setDone({ [cp.n]: 'flagged' }); setOpen(null);
    } catch (x) { setErr(x.message); }
  };

  const right = res?.verdict === 'right';
  const wrong = res?.verdict === 'wrong';
  return (
    <section id="practice" className="reveal">
      <div className="head"><h2>Check my answer</h2></div>
      <p className="muted small">
        Type your final answer with its unit. If it is wrong you get numbered checkpoints: tap <b>Broke here</b> on the step where your working diverged and Study Desk learns which sub-topic and which kind of mistake is costing you marks.
      </p>
      {!s.data.units.length ? <p className="muted">Pick your units first.</p> : (
        <form onSubmit={check}>
          <LimitNote s={s} unit={unit} go={go} what="step-by-step solutions" />
          <div className="row wrap">
            <select value={unit} onChange={(e) => { setUnit(e.target.value); setQuestionId(''); clear(); }} aria-label="Unit">
              {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
            </select>
            <select value={questionId} onChange={(e) => { setQuestionId(e.target.value); clear(); }} aria-label="Past-paper question">
              <option value="">Paste a question instead</option>
              {questions.map((q) => <option key={q.id} value={q.id}>{q.source} · Q{q.number}{q.marks ? ` · ${q.marks}m` : ''}: {q.text.slice(0, 50)}</option>)}
            </select>
          </div>
          {question
            ? <p className="small qtext">{question.text.length > 600 ? `${question.text.slice(0, 600)}…` : question.text}</p>
            : <textarea rows={3} placeholder="Paste the question text" aria-label="Question text" value={pasted} onChange={(e) => setPasted(e.target.value)} />}
          <div className="row wrap">
            <label className="small">Final answer{' '}
              <input className="grow" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="142.5 MPa" required />
            </label>
            <label className="small">Operations you used (optional){' '}
              <input className="grow" value={ops} onChange={(e) => setOps(e.target.value)} placeholder="Mohr's circle, then principal stresses" />
            </label>
          </div>
          <details className="small" open={res?.needKey || undefined}>
            <summary>I have the answer key</summary>
            <label className="small">Answer key{' '}<input value={key} onChange={(e) => setKey(e.target.value)} placeholder="from your marking scheme, e.g. 0.1425 GPa" /></label>
            <span className="muted"> Without one the AI solves it and the key is labelled “AI-solved: verify”.</span>
          </details>
          <div className="row wrap">
            <button disabled={busy || !answer.trim() || (!questionId && pasted.trim().length < 10)}>{busy ? `Checking… ${waited}s` : 'Check'}</button>
            <span className="muted small">or</span>
            <label className={`button ghost${busy || !s.media?.image || (!questionId && pasted.trim().length < 10) ? ' disabled' : ''}`}>
              Check a photo of my working
              <input type="file" accept="image/*" capture="environment" hidden disabled={busy || !s.media?.image || (!questionId && pasted.trim().length < 10)}
                onChange={(e) => { photo(e.target.files[0]); e.target.value = ''; }} />
            </label>
            {busy && <span className="muted small" role="status">The AI may read and solve it first: this can take a minute.</span>}
          </div>
          {!s.media?.image && <p className="muted small">Photos need an AI that can read them (Gemini or Claude, in Settings). You can still type your final answer.</p>}
        </form>
      )}
      {err && <p className="banner bad" role="alert">{err}</p>}
      {photoMsg && <p className="banner" role="status">{photoMsg}</p>}
      {res?.needKey && (
        <p className="banner" role="status">
          {res.message}{' '}
          <button type="button" className="link" onClick={() => go('prompt', { unit, questionId: questionId || undefined, topicId: topicId || undefined, goal: 'solution' })}>Open in Prompt Builder →</button>
        </p>
      )}
      {res?.verdict === 'unreadable' && <p className="banner" role="status">{res.note}</p>}
      {(right || wrong) && (
        <div className="feedback" role="status">
          <p className={`verdict ${right ? 'good' : 'bad'}`}>{right ? 'Matches the key' : 'Doesn’t match the key'}</p>
          <p className="small">
            Key: <b>{res.key.answer}</b> <span className={`badge${res.key.source === 'ai' ? ' warm' : ''}`}>{res.key.label}</span>
            {res.key.schemeFile && <span className="muted"> ({res.key.schemeFile})</span>}
          </p>
          {res.note && <p className="small warm">{res.note}</p>}
          {res.read && (
            <details className="small">
              <summary>Read from your photo: final answer <b>{res.read.finalAnswer}</b></summary>
              <ol>{res.read.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
            </details>
          )}
          {res.suggest && !Object.keys(done).length && <p className="small warm">From your photo, your working seems to break at <b>checkpoint {res.suggest.brokeAt}</b>{res.suggest.why ? `: ${res.suggest.why}` : ''}. It's open below: press Save if that's right, or pick a different step.</p>}
          {res.assumedUnit && <p className="small muted">One of the two had no unit, so the numbers were compared as they are.</p>}
          {res.key.source === 'ai' && <p className="small muted">The AI solved this itself, so if the checkpoints look wrong to you, say so below: nothing is held against you.</p>}
          {right && !steps.list.length && <button className="ghost" onClick={show} disabled={busy}>Show checkpoints</button>}
          {steps.note && <p className="small muted">{steps.note}{' '}<button type="button" className="link" onClick={() => go('prompt', { unit, questionId: questionId || undefined, topicId: topicId || undefined, goal: 'solution' })}>Open in Prompt Builder →</button></p>}
          {steps.list.length > 0 && (
            <ol className="cps">
              {steps.list.map((cp) => (
                <li key={cp.n} className={done[cp.n] === 'broke' ? 'broke' : ''}>
                  <b>Checkpoint {cp.n}.</b> {cp.step}
                  {cp.equation && <div className="eq">{cp.equation}</div>}
                  {cp.value && <div className="small">= <b>{cp.value}</b></div>}
                  {done[cp.n] === 'broke' && <p className="small bad-text">Marked: your working broke here.</p>}
                  {done[cp.n] === 'flagged' && (
                    <p className="small muted">Saved. Nothing is held against you.{' '}
                      <button type="button" className="link" onClick={() => go('prompt', { unit, questionId: questionId || undefined, topicId: topicId || undefined, goal: 'solution' })}>Get a verified solution in the Prompt Builder →</button>
                    </p>
                  )}
                  {!done[cp.n] && !wrongDone(done) && (
                    <div className="row wrap">
                      <button type="button" className="ghost" onClick={() => (open === cp.n ? setOpen(null) : openForm(cp))} aria-expanded={open === cp.n}>Broke here ❌</button>
                      <button type="button" className="link small" onClick={() => flag(cp)}>This checkpoint looks wrong</button>
                    </div>
                  )}
                  {open === cp.n && (
                    <div className="row wrap">
                      <label className="small">Sub-topic{' '}
                        <select value={form.subtopicId} onChange={(e) => setForm({ ...form, subtopicId: e.target.value })}>
                          <option value="">(none)</option>
                          {res.subtopics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </label>
                      <label className="small">Mistake{' '}
                        <select value={form.errorType} onChange={(e) => setForm({ ...form, errorType: e.target.value })}>
                          {s.errorTypes.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                      </label>
                      <button type="button" onClick={() => broke(cp)}>Save</button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {open != null && !res.subtopics.length && <p className="small muted">This unit has no sub-topics for this topic yet, so the mistake is logged without one. Add them under Weakspots.</p>}
        </div>
      )}
    </section>
  );
}

// once a step is marked, the others stop offering "Broke here" (re-marking is a fresh check)
const wrongDone = (done) => Object.values(done).includes('broke');
