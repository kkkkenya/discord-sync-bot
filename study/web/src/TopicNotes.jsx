import { useEffect, useState } from 'react';
import { api } from './api.js';
import OpenAt from './OpenAt.jsx';
import Rich from './Rich.jsx';

const wordsOf = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const overlap = (a, b) => [...wordsOf(a)].filter((w) => [...wordsOf(b)].some((x) => x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))).length;
const bookName = (s) => s.replace(/\.[a-z0-9]+$/i, '').replace(/\(?z-?library\)?/gi, '').replace(/_/g, ' ').trim();

// "Notes on this", inside Practise: the study guide's part on the question's sub-topic (what to know, the formulas,
// where in your books) and the pages of your files on the topic. Files open in the viewer over Practise, so the
// question stays where it was.
export default function TopicNotes({ unit, topicId, subtopics = [], go }) {
  const [path, setPath] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    setPath(null); setProblem('');
    if (unit && topicId) api('GET', `learn?unit=${encodeURIComponent(unit)}&topicId=${encodeURIComponent(topicId)}`).then(setPath).catch((e) => setProblem(e.message));
  }, [unit, topicId]);
  if (!topicId) return <p className="muted small">This question isn't tagged with a topic yet, so there are no notes to show. Tag the paper's questions from Insights.</p>;
  if (problem) return <p className="notice bad" role="alert">{problem}</p>;
  if (!path) return <div className="skeleton" style={{ height: 120 }} />;
  const g = path.guide;
  const fileOf = (name) => path.books?.find((b) => b.name === name)?.id;
  // the guide's parts on this question's sub-topics, else all of it
  const parts = g ? (subtopics.length ? g.outline.filter((o) => subtopics.some((s) => overlap(o.name, s) > 0)) : []) : [];
  const shown = parts.length ? parts : g?.outline || [];
  return (
    <div className="stack-s topic-notes">
      {subtopics.length > 0 && <p className="small"><span className="muted">Tests</span> <b>{subtopics.join(', ')}</b></p>}
      {g ? shown.map((o) => (
        <div key={o.name} className="tn-part">
          <h3 className="sub-title">{o.name}</h3>
          <p className="small"><span className="guide-k">You should be able to</span> <Rich text={o.expect} as="span" /></p>
          {o.formulas.length > 0 && <ul className="guide-formulas">{o.formulas.map((f) => <li key={f}><Rich text={f} as="span" /></li>)}</ul>}
          {o.read.map((r) => (
            <p key={r.book + r.where} className="small"><b>{bookName(r.book)}</b> · <span className="num">{r.where}</span>
              <OpenAt fileId={fileOf(r.book)} page={r.page || null} book label={r.page ? `Open at page ${r.page}` : 'Open the book'} /></p>
          ))}
        </div>
      )) : <p className="muted small">No study guide for “{path.topic.name}” yet. Make one in the topic's study page.</p>}
      {path.read.length > 0 && (
        <div className="stack-s">
          <h3 className="sub-title">In your files</h3>
          <ul className="tn-refs">
            {path.read.slice(0, 4).map((r, i) => (
              <li key={`${r.fileId}-${i}`} className="small">
                <b>{bookName(r.name)}</b>{r.pages && <span className="num muted"> · p. {r.pages[0]}{r.pages[1] !== r.pages[0] ? `–${r.pages[1]}` : ''}</span>}
                <span className="muted"> {r.snippet}</span>
                <OpenAt fileId={r.fileId} page={r.pages?.[0]} book label={r.pages ? `Open at page ${r.pages[0]}` : 'Open'} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div><button type="button" className="btn plain" onClick={() => go('learn', { unit, topicId })}>The whole topic</button></div>
    </div>
  );
}
