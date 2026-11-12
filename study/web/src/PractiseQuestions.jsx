import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { photoData } from './media.js';
import AskTutor from './AskTutor.jsx';
import Solution from './Solution.jsx';
import { Icon } from './icons.jsx';
import OpenAt from './OpenAt.jsx';
import { AiWait } from './Busy.jsx';
import Rich, { AnswerBox, QuestionBox } from './Rich.jsx';
import TopicNotes from './TopicNotes.jsx';

const qname = (x) => `${x.source} · ${x.label || `Q${x.number}`}`;

// The unit's questions by topic, then sub-topic (outline order), the untagged last: [{ id, name, subs: [{ id, name, qs }] }]
function grouped(questions, topics, subtopics) {
  const out = [];
  const byTopic = new Map();
  for (const t of topics) { const g = { id: t.id, name: t.name, subs: [] }; byTopic.set(t.id, g); out.push(g); }
  const none = { id: '', name: 'Not tagged with a topic yet', subs: [] };
  for (const q of questions) {
    const g = byTopic.get(q.topicId) || none;
    const sub = subtopics.find((x) => x.id === q.subtopicIds?.[0]);
    let s = g.subs.find((x) => x.id === (sub?.id || ''));
    if (!s) { s = { id: sub?.id || '', name: sub?.name || '', order: sub?.order ?? 1e9, qs: [] }; g.subs.push(s); }
    s.qs.push(q);
  }
  for (const g of [...out, none]) g.subs.sort((a, b) => a.order - b.order);
  return [...out, none].filter((g) => g.subs.length);
}

// The questions down the side by topic and sub-topic (always in view on a laptop, a drawer on a phone), and one
// question beside them: answer it (final answer with units, or a photo of the working), check it, and when it's
// wrong, say where your working broke and what kind of mistake it was. That feeds Insights. Notes on the question's
// sub-topic and a follow-up chat sit with the question, so nothing sends you to another page and back.
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
  const [selecting, setSelecting] = useState(false);
  const [filter, setFilter] = useState('');
  const [show, setShow] = useState('all'); // all | new | saved
  const [listOpen, setListOpen] = useState(false); // the drawer, on a phone
  const [listFolded, setListFolded] = useState(() => { try { return localStorage.getItem('crux-qnav-folded') === '1'; } catch { return false; } }); // the column, on a laptop
  const foldList = (f) => { setListFolded(f); try { localStorage.setItem('crux-qnav-folded', f ? '1' : '0'); } catch { /* private window */ } };
  const [notesOpen, setNotesOpen] = useState(false);
  const [chats, setChats] = useState({}); // question id → the follow-up chat
  const work = useRef(null);

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
  const topics = useMemo(() => s.data.topics.filter((t) => t.unit === unit).sort((a, b) => (a.order || 0) - (b.order || 0)), [s.data.topics, unit]);
  const groups = useMemo(() => grouped(questions, topics, s.data.subtopics), [questions, topics, s.data.subtopics]);
  const order = useMemo(() => groups.flatMap((g) => g.subs.flatMap((x) => x.qs)), [groups]);
  const at = order.findIndex((x) => x.id === qid);
  // the list fills the page until a question is open, then folds to a rail beside it (hover the rail to pick another
  // without unfolding it; click it to keep the list open beside the question)
  const pick = (id) => {
    if (!q) foldList(true);
    if (document.activeElement?.closest?.('.qnav')) document.activeElement.blur(); // the rail's pop-out closes after a pick
    reset(); setQid(id); setListOpen(false);
    requestAnimationFrame(() => { const top = work.current?.getBoundingClientRect().top; if (top < 0 || top > window.innerHeight * 0.6) work.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  };
  const nextQuestion = () => {
    const rest = [...order.slice(at + 1), ...order.slice(0, Math.max(at, 0))];
    const n = rest.find((x) => x.topicId === q?.topicId && !tried.has(x.id)) || rest.find((x) => !tried.has(x.id)) || rest[0];
    pick(n?.id || '');
  };
  const shownQ = (x) => (show === 'new' ? !tried.has(x.id) : show === 'saved' ? Boolean(x.explain) : true)
    && (!filter.trim() || `${qname(x)} ${x.text}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const subName = (id) => s.data.subtopics.find((x) => x.id === id)?.name;
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
  const topic = topics.find((t) => t.id === q?.topicId);
  const subs = (q?.subtopicIds || []).map(subName).filter(Boolean);
  return (
    <div className={`practise-layout${q ? '' : ' is-browse'}`}>
      <aside className={`qnav card${listOpen ? ' is-open' : ''}${q ? '' : ' is-browse'}${q && listFolded ? ' is-folded' : ''}`} aria-label="Questions">
        <button type="button" className="qnav-rail" aria-expanded="false" aria-label={`Keep the questions open (${order.length})`} title="Keep the questions open" onClick={() => foldList(false)}>
          <Icon name="chevron" /><span className="chip num">{order.length}</span><span className="qnav-rail-word">Questions</span>
        </button>
        <button type="button" className="qnav-toggle" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>
          <span className="row-main">{q ? qname(q) : 'Pick a question'}</span><span className="chip num">{order.length}</span><span className={`chev${listOpen ? ' open' : ''}`}><Icon name="chevron" /></span>
        </button>
        <div className="qnav-body">
          <div className="qnav-tools">
            <div className="qnav-search">
              <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search questions" aria-label="Search questions" />
              {q && <button type="button" className="iconbtn qnav-all" aria-label="All questions, full page" title="All questions, full page" onClick={() => { reset(); setQid(''); }}><Icon name="expand" /></button>}
              {q && <button type="button" className="iconbtn qnav-fold" aria-expanded={!listFolded} aria-label={listFolded ? 'Keep the questions open' : 'Fold the questions away'} title={listFolded ? 'Keep the questions open' : 'Fold the questions away'} onClick={() => foldList(!listFolded)}><Icon name="chevron" /></button>}
            </div>
            <div className="segmented small" role="group" aria-label="Show">
              {[['all', 'All'], ['new', 'Not tried'], ['saved', 'Solved']].map(([id, name]) => <button key={id} type="button" aria-pressed={show === id} onClick={() => setShow(id)}>{name}</button>)}
            </div>
          </div>
          <div className="qnav-list">
            {groups.map((g) => {
              const list = g.subs.map((x) => ({ ...x, qs: x.qs.filter(shownQ) })).filter((x) => x.qs.length);
              if (!list.length) return null;
              return (
                <details key={g.id || 'none'} className="qgroup" open={!q || (q.topicId || null) === (g.id || null) || filter.trim() !== '' || undefined}>
                  <summary><span className="qgroup-name">{g.name}</span><span className="num muted small">{list.reduce((n, x) => n + x.qs.length, 0)}</span></summary>
                  {list.map((x) => (
                    <div key={x.id || 'none'} className="qsub">
                      {x.name && <p className="qsub-name">{x.name}</p>}
                      <ul>
                        {x.qs.map((y) => (
                          <li key={y.id}>
                            {selecting && <input type="checkbox" checked={many.has(y.id)} disabled={Boolean(y.explain)} aria-label={`Solve ${qname(y)}`}
                              onChange={(e) => { const n = new Set(many); if (e.target.checked) n.add(y.id); else n.delete(y.id); setMany(n); }} />}
                            <button type="button" className="qitem" aria-current={y.id === qid || undefined} onClick={() => pick(y.id)}>
                              <span className="qitem-name">{tried.has(y.id) && <span className="good-text" aria-label="Tried">✓ </span>}{qname(y)}</span>
                              <span className="qitem-meta">{y.type === 'Book' && <span className="chip">Book</span>}{y.marks ? <span className="num">{y.marks}m</span> : null}{y.explain && <span className="chip good">Solved</span>}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </details>
              );
            })}
          </div>
          <div className="qnav-foot">
            {!selecting ? <button type="button" className="btn plain" onClick={() => setSelecting(true)}>Solve several at once</button> : (
              <>
                <button type="button" className="btn primary" disabled={!many.size || manyRun?.busy} onClick={solveMany}>
                  {manyRun?.busy ? `Solving… ${manyRun.done} of ${manyRun.total}` : many.size ? `Solve ${many.size}` : 'Tick questions to solve'}
                </button>
                <button type="button" className="btn plain" disabled={manyRun?.busy} onClick={() => { setSelecting(false); setMany(new Set()); }}>Done</button>
              </>
            )}
          </div>
          {selecting && <p className="muted small">Crux writes a full worked solution for each, 2 to 4 per AI action, and saves them to open later for free.</p>}
          <AiWait on={Boolean(manyRun?.busy)} kind="batch" note="Each group of 2 to 4 takes a minute or two." />
          {manyRun && !manyRun.busy && manyRun.done > 0 && <p className="notice good" role="status">{manyRun.done} solution{manyRun.done === 1 ? '' : 's'} saved.</p>}
        </div>
      </aside>

      <div className="qwork stack" ref={work}>
      {q && (
        <div className="qbar">
          <button type="button" className="iconbtn qbar-prev" aria-label="Previous question" disabled={at <= 0} onClick={() => pick(order[at - 1].id)}><Icon name="chevron" /></button>
          <span className="qbar-where">
            <span className="num muted small">{at + 1} of {order.length}</span>
            <span className="qbar-topic">{topic?.name || 'No topic yet'}{subs.length ? <span className="muted"> › {subs.join(', ')}</span> : null}</span>
          </span>
          <button type="button" className={`btn${notesOpen ? ' primary' : ''}`} aria-expanded={notesOpen} onClick={() => setNotesOpen((o) => !o)}><Icon name="notes" /> Notes on this</button>
          <button type="button" className="iconbtn" aria-label="Next question" disabled={at >= order.length - 1} onClick={() => pick(order[at + 1].id)}><Icon name="chevron" /></button>
        </div>
      )}
      {q && notesOpen && (
        <section className="card" aria-label="Notes on this question's topic">
          <TopicNotes unit={unit} topicId={q.topicId} subtopics={subs} go={go} />
        </section>
      )}

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
            <button className="btn primary" disabled={busy || !answer.trim()}>{busy ? 'Checking…' : 'Check answer'}</button>
            <label className={`btn${busy || !s.media?.image ? ' is-disabled' : ''}`}>
              Photo of working
              <input type="file" accept="image/*" capture="environment" className="visually-hidden" disabled={busy || !s.media?.image} onChange={(e) => { photo(e.target.files[0]); e.target.value = ''; }} />
            </label>
            {!solOpen && <button type="button" className="btn" disabled={solBusy} onClick={() => explain()}>Show full solution</button>}
          </div>
          <AiWait on={busy} kind="check" note="The first check of a question can take a minute: the AI solves it once, then it's saved." />
        </form>
      )}

      {solOpen && (
        <section className="card stack solution" aria-labelledby="sol-title" aria-busy={solBusy}>
          <div className="card-head">
            <h2 className="card-title" id="sol-title">Worked solution</h2>
            <button type="button" className="btn plain" onClick={() => setSolOpen(false)}>Hide</button>
          </div>
          {solBusy && <><AiWait on kind="solution" /><div className="skeleton" style={{ height: 160 }} /></>}
          {sol && !solBusy && (
            <>
              <Solution sol={sol} />
              <p className="row-sub">{sol.schemeFile ? `Made by the AI from the marking scheme (${sol.schemeFile}).` : 'Made by the AI: check it against your notes.'} <button type="button" className="btn plain" onClick={() => explain(true)}>Make it again</button></p>
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
      {q && (sol || res?.key) && (
        <AskTutor unit={unit} qid={q.id} ai={s.ai} chat={chats[q.id]} setChat={(c) => setChats((x) => ({ ...x, [q.id]: c }))} />
      )}
      </div>
    </div>
  );
}
