import { useEffect, useState } from 'react';
import { api } from './api.js';
import { AiWait } from './Busy.jsx';
import OpenAt from './OpenAt.jsx';
import Rich, { layoutParts } from './Rich.jsx';

// Study this topic: notes and worked examples from your own files first, questions later. Built without AI from the
// pages that cover the topic (server/learn.js); AI-made material is offered only where your files fall short.
function Ref({ r, i }) {
  const pages = r.pages && (r.pages[0] === r.pages[1] ? `page ${r.pages[0]}` : `pages ${r.pages[0]}–${r.pages[1]}`);
  return (
    <li className="ref">
      <div className="ref-head">
        <span className="ref-n num">{i}</span>
        {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a> : <b>{r.name}</b>}
        {pages && <span className="chip num">{pages}</span>}
      </div>
      {!pages && r.find && <p className="muted small">Look for “{r.find}…”{r.local ? ' · on this computer' : ''}</p>}
      <p className="muted small">{r.snippet}</p>
      <OpenAt fileId={r.fileId} page={r.pages?.[0]} book label={r.pages ? `Open at page ${r.pages[0]}` : 'Open the file'} />
      {r.excerpt && <details className="disclosure small"><summary>Read it here</summary><p className="excerpt">{r.excerpt}</p></details>}
    </li>
  );
}

// The topic's study guide: what the course expects for each sub-topic, its formulas, where in your books to read and
// what to skip; then how it's examined, a study order and an "I can…" checklist.
function Guide({ g, remake, busy, books = [] }) {
  const fileOf = (name) => books.find((b) => b.name === name)?.id;
  return (
    <div className="guide stack-s">
      <Rich text={g.overview} />
      <ol className="guide-outline">
        {g.outline.map((o) => (
          <li key={o.name}>
            <details open={g.outline.length <= 3 || undefined}>
              <summary><b>{o.name}</b></summary>
              <div className="stack-s guide-sub">
                <p><span className="guide-k">You should be able to</span> <Rich text={o.expect} as="span" /></p>
                {o.formulas.length > 0 && <ul className="guide-formulas">{o.formulas.map((f) => <li key={f}><Rich text={f} as="span" /></li>)}</ul>}
                {o.read.length > 0 && (
                  <ul className="guide-read">
                    {o.read.map((r) => <li key={r.book + r.where}><b>{r.book.replace(/\.[a-z0-9]+$/i, '').replace(/\(?z-?library\)?/gi, '').replace(/_/g, ' ').trim()}</b> · <span className="num">{r.where}</span><span className="muted">: {r.focus}</span> <OpenAt fileId={fileOf(r.book)} page={r.page || null} book label={r.page ? `Open at page ${r.page}` : 'Open the book'} /></li>)}
                  </ul>
                )}
                {o.skip && <p className="muted small"><span className="guide-k">Skip</span> {o.skip}</p>}
              </div>
            </details>
          </li>
        ))}
      </ol>
      <div className="md-note tip"><b className="md-label">How it's examined:</b> <Rich text={g.exam} as="span" /></div>
      <div>
        <h4 className="guide-h">Study it in this order</h4>
        <ol className="md-list">{g.plan.map((x) => <li key={x}><Rich text={x} as="span" /></li>)}</ol>
      </div>
      <div>
        <h4 className="guide-h">Before the exam, I can…</h4>
        <ul className="guide-check">{g.checklist.map((x) => <li key={x}><label className="check"><input type="checkbox" /> <Rich text={x.replace(/^I can\s*/i, '')} as="span" /></label></li>)}</ul>
      </div>
      <p className="muted small">Made by the AI from your course outline, past papers and books; shared with your class. <button type="button" className="btn plain" disabled={busy} onClick={remake}>Make it again</button></p>
    </div>
  );
}

export default function Learn({ s, unit, go, focus }) {
  const topics = s.data.topics.filter((t) => t.unit === unit);
  const [topicId, setTopicId] = useState('');
  const [path, setPath] = useState(null);
  const [err, setErr] = useState('');
  const [guideBusy, setGuideBusy] = useState(false);
  const makeGuide = async (fresh = false) => {
    setGuideBusy(true); setErr('');
    try {
      const g = await api('POST', 'learn/guide', { unit, topicId, fresh });
      if (g.needAi) throw new Error(g.message);
      setPath((p) => ({ ...p, guide: g }));
    } catch (e) { setErr(e.message); }
    setGuideBusy(false);
  };
  useEffect(() => { if (focus?.section === 'learn' && focus.topicId) setTopicId(focus.topicId); }, [focus]);
  useEffect(() => { if (!topics.some((t) => t.id === topicId)) setTopicId(topics[0]?.id || ''); }, [unit, topics.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPath(null); setErr('');
    if (unit && topicId) api('GET', `learn?unit=${encodeURIComponent(unit)}&topicId=${encodeURIComponent(topicId)}`).then(setPath).catch((e) => setErr(e.message));
  }, [unit, topicId, s.data.paperq.length, s.data.topics.length]);

  const topic = topics.find((t) => t.id === topicId);
  const then = (x) => (x.kind === 'teach' ? go('teach', { unit, topic: topic?.name })
    : x.kind === 'kit' ? go('kit', { unit, kit: 'ladder', topicId })
      : x.kind === 'prompt' ? go('prompt', { unit, topicId }) : null);
  if (!topics.length) return null; // the Topics list above already says how to add some
  return (
    <section id="learn" className="card stack" aria-labelledby="learn-title">
      <div className="card-head">
        <h2 className="card-title" id="learn-title">Study this topic</h2>
      </div>
      <p className="muted small">Your own files first, with the pages to open. Questions come after, when you're ready.</p>
      <label className="field">Topic
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          {topics.map((t, n) => <option key={t.id} value={t.id}>{n + 1}. {t.name}</option>)}
        </select>
      </label>
      {err && <p className="notice bad" role="alert">{err}</p>}
      {!path && !err && <div className="skeleton" style={{ height: 120 }} />}
      {path && (
        <>
          <div className="stack-s">
            <h3 className="sub-title">Study guide</h3>
            {guideBusy ? <><AiWait on kind="guide" /><div className="skeleton" style={{ height: 140 }} /></>
              : path.guide ? <Guide g={path.guide} books={path.books} busy={guideBusy} remake={() => makeGuide(true)} />
                : (
                  <div className="stack-s">
                    <p className="muted small">What the course expects on “{path.topic.name}”, the formulas, and exactly where in your books to read (and what to skip), so you don't search a 500-page book.</p>
                    <div><button type="button" className="btn primary" onClick={() => makeGuide()}>Make a study guide</button></div>
                  </div>
                )}
          </div>
          <div className="stack-s">
            <h3 className="sub-title">Read</h3>
            {path.read.length
              ? <ol className="refs">{path.read.map((r, i) => <Ref key={`${r.fileId}-${i}`} r={r} i={i + 1} />)}</ol>
              : <p className="muted small">None of your files cover “{path.topic.name}” yet. Read the unit's files from its Notes tab, or import your own notes in Settings.</p>}
          </div>
          <div className="stack-s">
            <h3 className="sub-title">Worked examples</h3>
            {path.examples.length
              ? <ol className="refs">{path.examples.map((r, i) => <Ref key={`${r.fileId}-e${i}`} r={r} i={i + 1} />)}</ol>
              : <p className="muted small">No worked example on it in your files. A ladder on the Sheet tab makes one: a worked example, then the same method for you to finish.</p>}
          </div>
          <div className="stack-s">
            <h3 className="sub-title">Explain it</h3>
            <div className="toolbar">
              {path.then.map((x) => (x.kind === 'next'
                ? <p key={x.text} className="muted small">{x.text}.</p>
                : <button key={x.kind + x.text} type="button" className="btn" onClick={() => then(x)}>{x.text}</button>))}
            </div>
          </div>
          <details className="disclosure">
            <summary>Test yourself <span className="muted num">({path.attempt.length})</span></summary>
            {path.attempt.length ? (
              <div className="list flat">
                {path.attempt.map((q) => (
                  <div key={q.id} className="list-item">
                  <button type="button" className="list-row" onClick={() => go('practice', { unit, questionId: q.id })}>
                    <span className="row-main">
                      <span>{q.source} · {q.label || `Q${q.number}`}{q.marks ? ` · ${q.marks} marks` : ''}{q.hasKey && <span className="chip good">Answer on file</span>}</span>
                      <Rich text={layoutParts(q.text)} as="span" className="row-sub qtext" />
                    </span>
                  </button>
                  <OpenAt fileId={q.fileId} page={q.page} book={q.type === 'Book'} />
                  </div>
                ))}
              </div>
            ) : <p className="muted small">No past-paper or tutorial questions are tagged with this topic yet. They're tagged as papers are read.</p>}
          </details>
        </>
      )}
    </section>
  );
}
