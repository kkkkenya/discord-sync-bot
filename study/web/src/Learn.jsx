import { useEffect, useState } from 'react';
import { api } from './api.js';

// Study this topic: notes and worked examples from your own files first, questions later. Built without AI from the
// pages that cover the topic (server/learn.js); AI-made material is offered only where your files fall short.
function Ref({ r, i }) {
  return (
    <li>
      <b>{i}. </b>
      {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a> : <b>{r.name}</b>}
      {r.pages ? <span className="badge">{r.pages[0] === r.pages[1] ? `page ${r.pages[0]}` : `pages ${r.pages[0]}–${r.pages[1]}`}</span> : r.find && <span className="muted small"> · look for “{r.find}…”</span>}
      {r.local && <span className="muted small"> · on this computer</span>}
      <p className="small muted">{r.snippet}</p>
      <details className="small"><summary>Read it here</summary><p className="excerpt">{r.excerpt}</p></details>
    </li>
  );
}

export default function Learn({ s, unit, setUnit, go, focus }) {
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
  return (
    <section id="learn" className="reveal">
      <div className="head"><h2>Study this topic</h2></div>
      <p className="muted small">Notes and worked examples from your own files first, with the page numbers to open. The questions come after, when you're ready to test yourself.</p>
      {!s.data.units.length ? <p className="muted">Pick your units first.</p> : (
        <div className="row wrap">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
            {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
          </select>
          {topics.length > 0 && (
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} aria-label="Topic">
              {topics.map((t, n) => <option key={t.id} value={t.id}>{n + 1}. {t.name}</option>)}
            </select>
          )}
        </div>
      )}
      {s.data.units.length > 0 && !topics.length && <p className="muted small">{unit} has no topics yet. <button className="link" onClick={() => go('units')}>Suggest them from the course outline in Units →</button></p>}
      {err && <p className="banner bad" role="alert">{err}</p>}
      {path && (
        <div className="learn">
          <h4>1 · Read</h4>
          {path.read.length
            ? <ol className="refs">{path.read.map((r, i) => <Ref key={`${r.fileId}-${i}`} r={r} i={i + 1} />)}</ol>
            : <p className="small muted">None of your synced or added notes cover “{path.topic.name}” yet. Sync the unit’s files, or add your notes in Units.</p>}
          <h4>2 · Worked examples</h4>
          {path.examples.length
            ? <ol className="refs">{path.examples.map((r, i) => <Ref key={`${r.fileId}-e${i}`} r={r} i={i + 1} />)}</ol>
            : <p className="small muted">No worked example on it in your files. A Study kit ladder makes one: a worked example, then the same method for you to finish.</p>}
          <h4>3 · Explain it</h4>
          <ul className="thenlist">
            {path.then.map((x) => (
              <li key={x.kind + x.text}>{x.kind === 'next' ? <span className="small">{x.text}.</span> : <button className="link" onClick={() => then(x)}>{x.text} →</button>}</li>
            ))}
          </ul>
          <details className="past">
            <summary>4 · When you’re ready: test yourself ({path.attempt.length} question{path.attempt.length === 1 ? '' : 's'})</summary>
            {path.attempt.length ? (
              <ol className="refs">
                {path.attempt.map((q) => (
                  <li key={q.id}>
                    <button className="link" onClick={() => go('practice', { unit, questionId: q.id })}>{q.source} · Q{q.number}{q.marks ? ` (${q.marks} marks)` : ''}</button>
                    {q.hasKey && <span className="badge ok">answer on file: checked free</span>}
                    <p className="small muted">{q.text}{q.text.length >= 200 ? '…' : ''}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="small muted">No past-paper or tutorial questions are tagged with this topic yet (Predict tags them as papers are read).</p>}
          </details>
        </div>
      )}
    </section>
  );
}
