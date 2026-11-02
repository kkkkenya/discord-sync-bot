import { useEffect, useMemo, useState } from 'react';
import { api, useElapsed } from './api.js';
import { photoData } from './media.js';
import FreeBody from './FreeBody.jsx';
import OpenAt from './OpenAt.jsx';
import PickList from './PickList.jsx';
import Rich, { AnswerBox, QuestionBox } from './Rich.jsx';

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
  const [sol, setSol] = useState(null); // the full worked solution, once asked for (or already made)
  const [solOpen, setSolOpen] = useState(false);
  const [solBusy, setSolBusy] = useState(false);
  const [many, setMany] = useState(new Set()); // questions picked for "Solve several"
  const [manyRun, setManyRun] = useState(null); // { done, total, busy }
  const waited = useElapsed(busy || solBusy);

  useEffect(() => { if (unit) api('GET', `predict?unit=${encodeURIComponent(unit)}`).then((p) => setQuestions(p.questions)).catch(() => setQuestions([])); }, [unit]);
  // where to start: the question a link asked for, else Today's top practise action
  const start = focus?.section === 'practice' ? focus : s.next?.find((a) => a.focus?.section === 'practice')?.focus;
  useEffect(() => { if (start?.questionId) { if (start.unit && start.unit !== unit) setUnit(start.unit); setQid(start.questionId); } }, [start?.questionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // a solution made earlier for this question comes back free; a new one is an AI action
  useEffect(() => {
    setSol(null); setSolOpen(false);
    if (unit && qid) api('GET', `attempts/explain?unit=${encodeURIComponent(unit)}&questionId=${encodeURIComponent(qid)}`).then((x) => { if (!x.none) setSol(x); }).catch(() => {});
  }, [unit, qid]);
  const explain = async (fresh = false) => {
    setSolOpen(true);
    if (sol && !fresh) return;
    setSolBusy(true); setProblem('');
    try {
      const out = await api('POST', 'attempts/explain', { unit, questionId: qid, fresh });
      if (out.needAi) throw new Error(out.message);
      setSol(out);
    } catch (e) { setProblem(e.message); setSolOpen(false); }
    setSolBusy(false);
  };
  // Solve several: the server solves 2-4 per call (by size); keep calling until none are left
  const solveMany = async () => {
    let left = questions.filter((x) => many.has(x.id) && !x.explain).map((x) => x.id);
    setManyRun({ done: 0, total: left.length, busy: true }); setProblem('');
    try {
      while (left.length) {
        const r = await api('POST', 'attempts/explain-batch', { unit, questionIds: left });
        if (r.needAi) throw new Error(r.message);
        const done = new Set(r.done);
        setQuestions((qs) => qs.map((x) => (done.has(x.id) ? { ...x, explain: true } : x)));
        setManyRun((m) => ({ ...m, done: m.done + r.done.length }));
        if (done.has(qid)) setSol(null);
        left = r.left;
      }
      setMany(new Set());
    } catch (e) { setProblem(e.message); }
    setManyRun((m) => ({ ...m, busy: false }));
  };
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
          {[['Past papers and CATs', questions.filter((x) => x.type !== 'Book')], ['From your books, word for word', questions.filter((x) => x.type === 'Book')]].filter(([, list]) => list.length).map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((x) => <option key={x.id} value={x.id}>{tried.has(x.id) ? '✓ ' : ''}{x.source} · {x.label || `Q${x.number}`}{x.marks ? ` · ${x.marks} marks` : ''}{x.explain ? ' · solution saved' : ''}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      <details className="disclosure">
        <summary>Solve several at once</summary>
        <p className="muted small">Pick questions and Crux writes a full worked solution for each, 2 to 4 per AI action. They're saved: open any of them later for free.</p>
        <PickList label="Questions to solve" picked={many} set={setMany}
          items={questions.map((x) => ({ id: x.id, label: `${x.source} · ${x.label || `Q${x.number}`}`, meta: x.marks ? `${x.marks} marks` : null, disabled: Boolean(x.explain), sub: x.explain ? 'Solution saved' : x.text }))} />
        <div className="actions start">
          <button type="button" className="btn primary" disabled={!many.size || manyRun?.busy} onClick={solveMany}>
            {manyRun?.busy ? `Solving… ${manyRun.done} of ${manyRun.total} done` : many.size ? `Solve ${many.size} question${many.size === 1 ? '' : 's'}` : 'Pick questions to solve'}
          </button>
        </div>
        {manyRun?.busy && <p className="row-sub" role="status">Each group of 2 to 4 takes a minute or two. You can keep using Crux; stay on this page until it's done.</p>}
        {manyRun && !manyRun.busy && manyRun.done > 0 && <p className="notice good" role="status">{manyRun.done} solution{manyRun.done === 1 ? '' : 's'} saved. Pick one from the Question list to read it.</p>}
      </details>

      {q && (
        <QuestionBox text={q.text} meta={[q.source, q.label, q.year, q.type]} marks={q.marks}>
          <div className="qbox-tools"><OpenAt fileId={q.fileId} page={q.page} book={q.type === 'Book'} /></div>
        </QuestionBox>
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
            {!solOpen && <button type="button" className="btn" disabled={solBusy} onClick={() => explain()}>Show full solution</button>}
          </div>
          {busy && <p className="row-sub" role="status">The AI may solve it first. This can take a minute.</p>}
        </form>
      )}

      {solOpen && (
        <section className="card stack solution" aria-labelledby="sol-title" aria-busy={solBusy}>
          <div className="card-head">
            <h2 className="card-title" id="sol-title">Worked solution</h2>
            <button type="button" className="btn plain" onClick={() => setSolOpen(false)}>Hide</button>
          </div>
          {solBusy && <><div className="skeleton" style={{ height: 160 }} /><p className="row-sub" role="status">Working it out… {waited}s</p></>}
          {sol && !solBusy && (
            <>
              {(sol.diagram || sol.fbd) && (
                <div className="stack-s">
                  <h3 className="sub-title">Free body diagram</h3>
                  {sol.diagram && <FreeBody d={sol.diagram} />}
                  {sol.fbd && <Rich text={sol.fbd} className="fbd-words" />}
                </div>
              )}
              <Rich text={sol.breakdown} />
              {sol.answer && <AnswerBox text={sol.answer} label="Final answer" />}
              <p className="row-sub">Made by the AI: check it against your notes. <button type="button" className="btn plain" onClick={() => explain(true)}>Make it again</button></p>
            </>
          )}
        </section>
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
          <AnswerBox text={res.key.answer} label={res.key.label ? `Answer · ${res.key.label}` : 'Answer'} />
          {res.note && <p className="row-sub">{res.note}</p>}
          <div className="actions start">
            {right && <button className="btn primary" onClick={nextQuestion}>Next question</button>}
            {!solOpen && <button type="button" className="btn" disabled={solBusy} onClick={() => explain()}>Full worked solution</button>}
          </div>
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
                    <Rich text={cp.step} as="span" />
                    {cp.equation && <Rich text={cp.equation} as="span" className="step-eq" tex />}
                    {cp.value && <span className="row-sub">= <Rich text={cp.value} as="span" tex /></span>}
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
