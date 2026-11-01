import { useEffect, useState } from 'react';
import { api } from './api.js';

const KINDS = [{ id: 'focus', label: 'Focus' }, { id: 'exclude', label: 'Skip' }, { id: 'note', label: 'Note' }];

// Predictions with their numbers, the lecturer's hints, past-paper questions by topic, and paper scores.
export default function UnitPapers({ s, unit, refresh, go, notify }) {
  const [p, setP] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState({ text: '', kind: 'focus', topicIds: [] });
  const [paste, setPaste] = useState({ label: '', text: '' });
  const [score, setScore] = useState({ label: '', score: '', outOf: '' });
  const load = () => api('GET', `predict?unit=${encodeURIComponent(unit)}`).then(setP).catch((e) => setProblem(e.message));
  useEffect(() => { load(); }, [unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn) => { setBusy(true); setProblem(''); try { await fn(); } catch (e) { setProblem(e.message); } setBusy(false); };

  const topics = s.data.topics.filter((t) => t.unit === unit);
  const toggleTopic = (id) => setHint((h) => ({ ...h, topicIds: h.topicIds.includes(id) ? h.topicIds.filter((x) => x !== id) : [...h.topicIds, id] }));
  const saveHint = (e) => { e.preventDefault(); run(async () => { await api('POST', 'hints', { unit, ...hint }); setHint({ text: '', kind: 'focus', topicIds: [] }); await load(); }); };
  const savePaste = (e) => { e.preventDefault(); run(async () => { const rows = await api('POST', 'predict/paste', { unit, ...paste }); notify(`${rows.length} question${rows.length === 1 ? '' : 's'} added.`); setPaste({ label: '', text: '' }); await load(); }); };
  const saveScore = (e) => { e.preventDefault(); run(async () => { await api('POST', 'papers', { unit, label: score.label, score: Number(score.score), outOf: Number(score.outOf) }); setScore({ label: '', score: '', outOf: '' }); notify('Score saved.'); await refresh(); }); };

  if (!p) return problem ? <p className="notice bad">{problem}</p> : <div className="skeleton" style={{ height: 200 }} />;
  const byTopic = new Map();
  for (const q of p.questions) {
    const key = topics.find((t) => t.id === q.topicId)?.name || 'No topic yet';
    byTopic.set(key, [...(byTopic.get(key) || []), q]);
  }
  const papers = s.data.papers.filter((x) => x.unit === unit);

  return (
    <>
      {problem && <p className="notice bad" role="alert">{problem}</p>}
      <div>
        <h2 className="list-title">Most likely to come</h2>
        {p.ranked.length ? (
          <ol className="list ranked">
            {p.ranked.map((r) => (
              <li key={r.topicId} className="list-row">
                <span className="row-main">
                  <span>{r.name} {r.pinned && <span className="chip one-week">Focus</span>}{r.muted && <span className="chip">Skip</span>}</span>
                  <span className="row-sub">{r.questions ? `${r.appeared} of ${r.papers} papers × ${r.avgMarks} marks${r.mult !== 1 ? ` × ${r.mult}` : ''} = ${r.weight}` : `No past-paper questions yet${r.mult !== 1 ? ` · × ${r.mult}` : ''}`}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="row-sub">Add the unit's topics first, then the ranking fills in.</p>}
      </div>

      <form className="card" onSubmit={saveHint}>
        <h2>What the lecturer said</h2>
        <label className="field">Hint<input value={hint.text} onChange={(e) => setHint({ ...hint, text: e.target.value })} placeholder="The exam will focus on beta functions" /></label>
        <div className="segmented" role="group" aria-label="Kind of hint">
          {KINDS.map((k) => <button type="button" key={k.id} aria-pressed={hint.kind === k.id} onClick={() => setHint({ ...hint, kind: k.id })}>{k.label}</button>)}
        </div>
        {topics.length > 0 && (
          <div className="chips" role="group" aria-label="Topics it's about (Crux guesses from the words if you leave these)">
            {topics.map((t) => <button type="button" key={t.id} className="chip" aria-pressed={hint.topicIds.includes(t.id)} onClick={() => toggleTopic(t.id)}>{t.name}</button>)}
          </div>
        )}
        <button className="btn primary" disabled={busy || !hint.text.trim()}>Save hint</button>
        {p.hints.length > 0 && <ul className="plain-list">{p.hints.map((h) => <li key={h.id}><span className="chip">{KINDS.find((k) => k.id === h.kind)?.label}</span> {h.text}</li>)}</ul>}
      </form>

      <div>
        <h2 className="list-title">Past-paper questions</h2>
        {!p.questions.length && <p className="row-sub">None yet. Prepare the unit in Notes, or paste a paper below.</p>}
        {[...byTopic].map(([name, qs]) => (
          <details key={name} className="list qgroup" open={byTopic.size <= 3}>
            <summary className="list-row"><span className="row-main"><span>{name}</span><span className="row-sub">{qs.length} question{qs.length === 1 ? '' : 's'}</span></span></summary>
            {qs.map((q) => (
              <div key={q.id} className="list-row q">
                <span className="row-main">
                  <span className="row-sub">{[q.source, q.year, q.type, q.marks && `${q.marks} marks`].filter(Boolean).join(' · ')}</span>
                  <span className="qtext">{q.text}</span>
                </span>
                <button className="btn" onClick={() => go('practice', { unit, questionId: q.id })}>Practise</button>
              </div>
            ))}
          </details>
        ))}
      </div>

      <details className="card">
        <summary><h2>Paste a paper</h2></summary>
        <form className="stack" onSubmit={savePaste}>
          <label className="field">Which paper<input value={paste.label} onChange={(e) => setPaste({ ...paste, label: e.target.value })} placeholder="2024 CAT 1" /></label>
          <label className="field">Questions<textarea value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} /></label>
          <button className="btn" disabled={busy || paste.text.trim().length < 10}>Add questions</button>
        </form>
      </details>

      <form className="card" onSubmit={saveScore}>
        <h2>Log a score</h2>
        <label className="field">Which paper<input value={score.label} onChange={(e) => setScore({ ...score, label: e.target.value })} placeholder="2023 CAT 1" /></label>
        <div className="pair">
          <label className="field">Score<input inputMode="decimal" value={score.score} onChange={(e) => setScore({ ...score, score: e.target.value })} /></label>
          <label className="field">Out of<input inputMode="decimal" value={score.outOf} onChange={(e) => setScore({ ...score, outOf: e.target.value })} /></label>
        </div>
        <button className="btn" disabled={busy || !score.label.trim() || !(Number(score.outOf) > 0) || score.score === ''}>Save score</button>
        {papers.length > 0 && <ul className="plain-list">{papers.map((x) => <li key={x.id}>{x.label}: {x.score}/{x.outOf}</li>)}</ul>}
      </form>
    </>
  );
}
