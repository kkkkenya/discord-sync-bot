import { useEffect, useState } from 'react';
import { api } from './api.js';
import Rich from './Rich.jsx';

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
      <details className="disclosure small"><summary>Read it here</summary><p className="excerpt">{r.excerpt}</p></details>
    </li>
  );
}

export default function Learn({ s, unit, go, focus }) {
  const topics = s.data.topics.filter((t) => t.unit === unit);
  const [topicId, setTopicId] = useState('');
  const [path, setPath] = useState(null);
  const [err, setErr] = useState('');
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
                  <button key={q.id} type="button" className="list-row" onClick={() => go('practice', { unit, questionId: q.id })}>
                    <span className="row-main">
                      <span>{q.source} · Q{q.number}{q.marks ? ` · ${q.marks} marks` : ''}{q.hasKey && <span className="chip good">Answer on file</span>}</span>
                      <Rich text={`${q.text}${q.text.length >= 200 ? '…' : ''}`} as="span" className="row-sub qtext" />
                    </span>
                  </button>
                ))}
              </div>
            ) : <p className="muted small">No past-paper or tutorial questions are tagged with this topic yet. They're tagged as papers are read.</p>}
          </details>
        </>
      )}
    </section>
  );
}
