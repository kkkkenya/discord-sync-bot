import { useEffect, useState } from 'react';
import { api } from './api.js';
import Busy from './Busy.jsx';
import LimitNote from './LimitNote.jsx';

// Paste lecture notes / a textbook section / slide text. The AI turns it into CAT-style questions that land in
// your mock-exam bank.
export default function Notes({ s, unit, setUnit, refresh, focus, go }) {
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
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
      <div className="head"><h2>Notes → questions</h2></div>
      <p className="muted small">Paste your own notes, a textbook section or slide text. The AI turns it into CAT-style questions (derivations, numericals, explain-why) with model answers, for your mock-exam bank.</p>
      <p className="muted small">
        {Object.values(s.library || {}).filter((e) => e.unit === unit && e.chars > 0).length
          ? `${Object.values(s.library || {}).filter((e) => e.unit === unit && e.chars > 0).length} file(s) synced for ${unit}. The questions will be grounded in them.`
          : `No files synced for ${unit} yet. Sync them in Units to ground the questions in your material.`}
      </p>
      {!s.ai && <p className="banner bad">No AI key for the selected provider. Pick another provider in the top bar, or run <code>setup.bat</code> to add one.</p>}
      <form onSubmit={send}>
        <div className="row wrap">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
            {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
          </select>
          <input className="grow" placeholder="Topic (e.g. Mohr's circle, beam deflection)" aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <textarea rows={12} placeholder="Paste notes here: definitions, derivations, worked examples…" aria-label="Notes" value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={busy || !s.ai || !unit || !topic.trim() || text.trim().length < 60}><Busy on={busy} label="Writing questions…" idle="Generate questions" /></button>
      </form>
      <LimitNote s={s} unit={unit} topic={topic} go={go} what="model answers with long working" />
      {result?.error && <p className="banner bad">{result.error}</p>}
      {result?.questions != null && (
        <p className="banner good" role="status">Added <b>{result.questions}</b> CAT question{result.questions === 1 ? '' : 's'} to your mock bank. Try a timed mock on them.</p>
      )}
    </section>
  );
}
