import { useEffect, useState } from 'react';
import { api } from './api.js';

// Paste lecture notes / a textbook section / slide text. Claude turns it into recall cards (due now in Recall)
// and CAT-style questions that land in your mock-exam bank.
export default function Notes({ s, refresh, focus }) {
  const [unit, setUnit] = useState(s.data.units[0]?.code || '');
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (focus?.section === 'notes' && focus.unit) setUnit(focus.unit);
    if (focus?.section === 'notes' && focus.topic) setTopic(focus.topic);
  }, [focus]);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setResult(null);
    try {
      const r = await api('POST', 'notes', { unit, topic, text });
      setText('');
      setResult(r);
      refresh();
    } catch (err) { setResult({ error: err.message }); }
    setBusy(false);
  };

  return (
    <section id="notes" className="reveal">
      <div className="head"><h2>Notes → cards</h2></div>
      <p className="muted small">Paste your own notes, a textbook section or slide text. Claude turns it into recall cards (they're due in Recall right away) and CAT-style questions for your mock-exam bank.</p>
      {!s.ai && <p className="banner bad">This needs an Anthropic key. Run <code>setup.bat</code> in the study folder to add one.</p>}
      <form onSubmit={send}>
        <div className="row">
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
          </select>
          <input className="grow" placeholder="Topic (e.g. Mohr's circle, beam deflection)" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <textarea rows={12} placeholder="Paste notes here — definitions, derivations, worked examples…" value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={busy || !s.ai || !unit || !topic.trim() || text.trim().length < 60}>{busy ? 'Turning into cards…' : 'Generate cards & questions'}</button>
      </form>
      {result?.error && <p className="banner bad">{result.error}</p>}
      {result?.cards != null && (
        <p className="banner good" role="status">Added <b>{result.cards}</b> recall card{result.cards === 1 ? '' : 's'} and <b>{result.questions}</b> CAT question{result.questions === 1 ? '' : 's'} to your mock bank. Cards are due now — go to Recall, or try a mock.</p>
      )}
    </section>
  );
}
