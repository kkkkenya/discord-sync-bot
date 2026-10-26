import { useState } from 'react';
import { api } from './api.js';

const KINDS = [
  ['mock', 'Mock exam questions'],
  ['cards', 'Flashcards from material'],
  ['teach', 'Teach me a topic'],
  ['ladder', 'Worked → faded → alone'],
  ['formula', 'Formula sheet'],
  ['paper', 'Analyse a past paper'],
  ['dump', 'Self-test questions'],
  ['why', '"Why" cards'],
  ['custom', 'Custom instruction'],
];

export default function Prompt({ s }) {
  const [kind, setKind] = useState('mock');
  const [unit, setUnit] = useState(s.data.units[0]?.code || '');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [copied, setCopied] = useState(false);

  const isCustom = kind === 'custom';
  const build = async () => {
    setBusy(true); setCopied(false); setOut(null);
    try {
      setOut(await api('POST', 'prompt', { kind, unit: unit || undefined, topic: topic.trim() || undefined, count, notes }));
    } catch (e) { setOut({ error: e.message }); }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(out.prompt); setCopied(true); } catch (e) { setCopied(false); }
  };

  return (
    <section id="prompt" className="reveal">
      <div className="head"><h2>Prompt builder</h2></div>
      <p className="muted small">Build a prompt to copy into ChatGPT, Gemini, DeepSeek or any other chat. If a unit's files are synced, its material is included so the answer matches your actual course.</p>
      <form className="row wrap" onSubmit={(e) => { e.preventDefault(); build(); }}>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="purpose">
          {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="unit">
          <option value="">All units</option>
          {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
        </select>
        <input className="grow" placeholder="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} />
        {kind === 'mock' && (
          <label className="muted small">Questions
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
        )}
      </form>
      <textarea rows={isCustom ? 6 : 3} placeholder={isCustom ? 'Write your full instruction…' : 'Optional: paste notes or a paper\u2019s text (added as context)'} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button onClick={build} disabled={busy || (isCustom && !notes.trim())}>{busy ? 'Building…' : 'Generate prompt'}</button>
      {out?.error && <p className="banner bad">{out.error}</p>}
      {out?.prompt && (
        <div className="promptout">
          {out.contextChars > 0 && <p className="muted small">{out.contextChars.toLocaleString()} characters of synced material included.</p>}
          <textarea readOnly rows={12} value={out.prompt} onFocus={(e) => e.target.select()} />
          <button className="ghost" onClick={copy}>{copied ? 'Copied ✓' : 'Copy prompt'}</button>
        </div>
      )}
    </section>
  );
}
