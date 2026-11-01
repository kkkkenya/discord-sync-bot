import { useEffect, useMemo, useState } from 'react';
import { api, useElapsed } from './api.js';
import { photoData } from './media.js';

// One question at a time: answer it (final answer with units, or a photo of the working), check it, and when it's
// wrong, say where your working broke and what kind of mistake it was. That feeds Insights; then the next question.
export default function PractiseQuestions({ s, unit, setUnit, refresh, go, focus, notify }) {
  const [questions, setQuestions] = useState([]);
  const [qid, setQid] = useState('');
  const [answer, setAnswer] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [steps, setSteps] = useState([]);
  const [broke, setBroke] = useState(null); // the checkpoint picked as where it broke
  const [mistake, setMistake] = useState({ subtopicId: '', errorType: '' });
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState('');
  const waited = useElapsed(busy);

  useEffect(() => { if (unit) api('GET', `predict?unit=${encodeURIComponent(unit)}`).then((p) => setQuestions(p.questions)).catch(() => setQuestions([])); }, [unit]);
  // where to start: the question a link asked for, else Today's top practise action
  const start = focus?.section === 'practice' ? focus : s.next?.find((a) => a.focus?.section === 'practice')?.focus;
  useEffect(() => { if (start?.questionId) { if (start.unit && start.unit !== unit) setUnit(start.unit); setQid(start.questionId); } }, [start?.questionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = questions.find((x) => x.id === qid);
  const tried = useMemo(() => new Set(s.data.attempts.map((a) => a.questionId)), [s.data.attempts]);
  const reset = () => { setRes(null); setSteps([]); setBroke(null); setMistake({ subtopicId: '', errorType: '' }); setSaved(false); setProblem(''); setAnswer(''); setKey(''); };
  const pick = (id) => { reset(); setQid(id); };
  const nextQuestion = () => {
    const pool = questions.filter((x) => x.id !== qid);
    const n = pool.find((x) => x.topicId === q?.topicId && !tried.has(x.id)) || pool.find((x) => !tried.has(x.id)) || pool[0];
    pick(n?.id || '');
  };
  const run = async (fn) => { setBusy(true); setProblem(''); try { await fn(); } catch (e) { setProblem(e.message); } setBusy(false); };
  const took = (out) => { setRes(out); setSteps(out.checkpoints || []); if (out.attempt) refresh(); };
  const check = (e) => { e.preventDefault(); run(async () => took(await api('POST', 'attempts/check', { unit, questionId: qid, answer, key: key || undefined }))); };
  const photo = (file) => file && run(async () => {
    const out = await api('POST', 'attempts/photo', { unit, questionId: qid, image: await photoData(file), key: key || undefined });
    if (out.needVision || out.unreadablePhoto) throw new Error(out.message || out.note);
    took(out);
    if (out.read) setAnswer(out.read.finalAnswer);
    if (out.suggest) { setBroke(out.suggest.brokeAt); setMistake({ subtopicId: out.guess?.subtopicId || '', errorType: out.suggest.errorType || out.guess?.errorType || '' }); }
  });
  const save = () => run(async () => {
    await api('POST', 'attempts/broke', { id: res.attempt.id, step: broke, subtopicId: mistake.subtopicId || null, errorType: mistake.errorType });
    setSaved(true);
    notify('Saved to your weakspots.');
    await refresh();
  });
  const deeper = () => go('prompt', { unit, questionId: qid || undefined, topicId: q?.topicId, goal: 'solution' });

  if (!questions.length) {
    return (
      <div className="empty">
        <h2>No questions for {unit} yet</h2>
        <p>Prepare the unit to read its past papers, or paste a paper.</p>
        <button className="btn primary" onClick={() => go('notes', { unit })}>Prepare {unit}</button>
      </div>
    );
  }

  const wrong = res?.verdict === 'wrong';
  const right = res?.verdict === 'right';
  return (
    <>
      <label className="field">Question
        <select value={qid} onChange={(e) => pick(e.target.value)}>
          <option value="">Pick a question</option>
          {questions.map((x) => <option key={x.id} value={x.id}>{tried.has(x.id) ? '✓ ' : ''}{x.source} · Q{x.number}{x.marks ? ` · ${x.marks} marks` : ''}</option>)}
        </select>
      </label>

      {q && (
        <article className="card">
          <p className="row-sub">{[q.source, q.year, q.type, q.marks && `${q.marks} marks`].filter(Boolean).join(' · ')}</p>
          <p className="question">{q.text}</p>
        </article>
      )}

      {q && !res && (
        <form className="card" onSubmit={check}>
          <label className="field">Final answer, with its unit<input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="142.5 MPa" autoComplete="off" /></label>
          <details>
            <summary className="row-sub">I have the answer key</summary>
            <label className="field">Answer key<input value={key} onChange={(e) => setKey(e.target.value)} placeholder="From the marking scheme" /></label>
          </details>
          <div className="actions start">
            <button className="btn primary" disabled={busy || !answer.trim()}>{busy ? `Checking… ${waited}s` : 'Check answer'}</button>
            <label className={`btn${busy || !s.media?.image ? ' is-disabled' : ''}`}>
              Photo of working
              <input type="file" accept="image/*" capture="environment" className="visually-hidden" disabled={busy || !s.media?.image} onChange={(e) => { photo(e.target.files[0]); e.target.value = ''; }} />
            </label>
          </div>
          {busy && <p className="row-sub" role="status">The AI may solve it first. This can take a minute.</p>}
        </form>
      )}

      {problem && <p className="notice bad" role="alert">{problem}{problem.startsWith("Today's AI limit") && <> <button className="btn plain" onClick={deeper}>Go deeper</button></>}</p>}
      {res?.needKey && (
        <div className="notice" role="status">
          <p>{res.message}</p>
          <button className="btn" onClick={deeper}>Go deeper</button>
        </div>
      )}
      {res?.verdict === 'unreadable' && <p className="notice" role="status">{res.note}</p>}

      {(right || wrong) && (
        <div className="card" role="status">
          <h2 className={right ? 'good-text' : 'bad-text'}>{right ? 'Correct' : 'Not quite'}</h2>
          <p>Answer: <b>{res.key.answer}</b> <span className="chip">{res.key.label}</span></p>
          {res.note && <p className="row-sub">{res.note}</p>}
          {right && <button className="btn primary" onClick={nextQuestion}>Next question</button>}
        </div>
      )}

      {wrong && !saved && (
        <div className="card">
          <h2>Where did yours break?</h2>
          {!steps.length && <p className="row-sub">No checkpoints for this one. <button className="btn plain" onClick={deeper}>Go deeper</button></p>}
          <ol className="steps">
            {steps.map((cp) => (
              <li key={cp.n}>
                <button className="step" aria-pressed={broke === cp.n} onClick={() => setBroke(cp.n)}>
                  <span className="step-n">{cp.n}</span>
                  <span className="row-main">
                    <span>{cp.step}</span>
                    {cp.equation && <code>{cp.equation}</code>}
                    {cp.value && <span className="row-sub">= {cp.value}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {broke != null && (
            <>
              <fieldset className="chips">
                <legend className="field">What went wrong at step {broke}?</legend>
                {s.errorTypes.map((x) => <button type="button" key={x.id} className="chip" aria-pressed={mistake.errorType === x.id} onClick={() => setMistake({ ...mistake, errorType: x.id })}>{x.label}</button>)}
              </fieldset>
              {res.subtopics?.length > 0 && (
                <label className="field">Sub-topic
                  <select value={mistake.subtopicId} onChange={(e) => setMistake({ ...mistake, subtopicId: e.target.value })}>
                    <option value="">Not sure</option>
                    {res.subtopics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
              )}
              <button className="btn primary" disabled={busy || !mistake.errorType} onClick={save}>Save</button>
            </>
          )}
        </div>
      )}
      {wrong && saved && <button className="btn primary" onClick={nextQuestion}>Next question</button>}
    </>
  );
}
