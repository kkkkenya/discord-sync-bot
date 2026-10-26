import { useEffect, useState } from 'react';
import { api } from './api.js';

function Feedback({ f, unit, topic, refresh }) {
  const [added, setAdded] = useState(false);
  const addAll = async () => {
    for (const c of f.cards) await api('POST', 'cards', { unit, topic, q: c.q, a: c.a, from: 'teach' });
    setAdded(true);
    refresh();
  };
  return (
    <div className="feedback">
      <p className="score">{f.score}/5</p>
      <p>✓ {f.good}</p>
      <ul>{f.gaps.map((g) => <li key={g}>✗ {g}</li>)}</ul>
      <p><b>Answer this next, from memory:</b> {f.followUp}</p>
      {f.cards.length > 0 && <button onClick={addAll} disabled={added}>{added ? 'Added to Recall' : `Add ${f.cards.length} cards for the gaps`}</button>}
    </div>
  );
}

export default function Teach({ s, refresh, focus }) {
  const [unit, setUnit] = useState(s.data.units[0]?.code || '');
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (focus?.section !== 'teach') return;
    if (focus.unit) setUnit(focus.unit);
    if (focus.topic) setTopic(focus.topic);
  }, [focus]);

  const topics = s.data.topics.filter((t) => t.unit === unit);
  const past = s.data.teach.filter((t) => t.unit === unit).slice(-5).reverse();

  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setResult(null);
    try { setResult(await api('POST', 'teach', { unit, topic, text })); setText(''); refresh(); }
    catch (err) { setResult({ error: err.message }); }
    setBusy(false);
  };

  return (
    <section id="teach" className="reveal">
      <h2>Teach it back</h2>
      <p className="muted small">Explain a topic as if a classmate missed the lecture: what it is, the key equation and what each term means, when it applies, one worked example. If you get stuck, that's the gap to study.{s.coach ? ' The AI marks it and turns the gaps into recall cards.' : ''}</p>
      <form onSubmit={send}>
        <div className="row">
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
          </select>
          <input list="topics" placeholder="Topic (e.g. Mohr's circle)" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <datalist id="topics">{topics.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        </div>
        <textarea rows={8} placeholder="Start with: 'Imagine you have…'" value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={busy || !unit || !topic.trim() || text.trim().length < 40}>{busy ? 'Marking…' : s.coach ? 'Get it marked' : 'Save teach-back'}</button>
      </form>
      {result?.error && <p className="banner bad">{result.error}</p>}
      {result?.item?.feedback && <Feedback f={result.item.feedback} unit={result.item.unit} topic={result.item.topic} refresh={refresh} />}
      {result?.item && !result.item.feedback && <p className="muted">Saved.</p>}
      {past.length > 0 && (
        <details className="past">
          <summary>Earlier teach-backs for {unit} ({past.length})</summary>
          {past.map((t) => <div key={t.id}><b>{t.topic}</b>{t.feedback && ` · ${t.feedback.score}/5`} <span className="muted small">{t.at.slice(0, 10)}</span><p className="small">{t.text}</p></div>)}
        </details>
      )}
    </section>
  );
}
