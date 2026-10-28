import { useEffect, useState } from 'react';
import { api } from './api.js';

const KINDS = [
  ['mock', 'Mock exam questions'],
  ['teach', 'Teach me a topic'],
  ['ladder', 'Worked → faded → alone'],
  ['formula', 'Formula sheet'],
  ['paper', 'Analyse a past paper'],
  ['dump', 'Self-test questions'],
  ['why', 'Understanding check (why / when-not)'],
  ['custom', 'Custom instruction'],
];

// Today's prompt tasks name a quick template; the pack goal that matches it.
const FROM_KIND = { teach: 'breakdown', formula: 'sheet' };

const download = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Deep Context Pack: a Master Prompt to copy + a <UNIT>-<TOPIC>-context.md to attach in Claude, DeepSeek R1 or
// ChatGPT, built from your hints, weakspots, past papers and synced notes. No AI key needed.
export default function Prompt({ s, focus }) {
  const [unit, setUnit] = useState(s.data.units[0]?.code || '');
  const [topicId, setTopicId] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [goal, setGoal] = useState('');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [questions, setQuestions] = useState([]);
  const topics = s.data.topics.filter((t) => t.unit === unit);
  const stage = s.units?.[unit]?.stage;

  // the unit's past-paper questions, to aim the pack at one
  useEffect(() => { if (unit) api('GET', `predict?unit=${encodeURIComponent(unit)}`).then((p) => setQuestions(p.questions)).catch(() => setQuestions([])); }, [unit]);

  const build = async (body) => {
    setBusy(true); setCopied(false);
    try { setOut(await api('POST', 'pack', body)); } catch (e) { setOut({ error: e.message }); }
    setBusy(false);
  };
  // arriving from a topic, weakspot, question or Today task: preselect and build straight away
  useEffect(() => {
    if (focus?.section !== 'prompt' || !focus.unit) return;
    const t = s.data.topics.find((x) => x.unit === focus.unit && (x.id === focus.topicId || x.name.toLowerCase() === String(focus.topic || '').toLowerCase()));
    const g = focus.goal || FROM_KIND[focus.kind] || '';
    setUnit(focus.unit); setTopicId(t?.id || ''); setQuestionId(focus.questionId || ''); setGoal(g);
    build({ unit: focus.unit, topicId: t?.id, questionId: focus.questionId, goal: g || undefined });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const qs = questions.filter((q) => !topicId || q.topicId === topicId);
  const copy = async () => { try { await navigator.clipboard.writeText(out.prompt); setCopied(true); } catch { setCopied(false); } };

  return (
    <section id="prompt" className="reveal">
      <div className="head"><h2>Prompt builder</h2></div>
      <p className="muted small">
        For heavy work (full derivations, verified step-by-step solutions, deep tutoring on a weakspot) the built-in AI's context and effort limits get in the way.
        Build a <b>Deep Context Pack</b> instead: copy the Master Prompt and attach the <code>.md</code> file in Claude, DeepSeek R1 or ChatGPT. It carries your lecturer's hints, your weakspots, the past-paper questions and your synced notes.
      </p>
      {!s.data.units.length ? <p className="muted">Pick your units first.</p> : (
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); build({ unit, topicId: topicId || undefined, questionId: questionId || undefined, goal: goal || undefined }); }}>
          <select value={unit} onChange={(e) => { setUnit(e.target.value); setTopicId(''); setQuestionId(''); setOut(null); }} aria-label="Unit">
            {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
          </select>
          <select value={topicId} onChange={(e) => { setTopicId(e.target.value); setQuestionId(''); }} aria-label="Topic">
            <option value="">Whole unit</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Goal">
            <option value="">Goal: best for {stage?.name || 'your stage'}</option>
            {s.goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {qs.length > 0 && (
            <select value={questionId} onChange={(e) => setQuestionId(e.target.value)} aria-label="Target past-paper question">
              <option value="">No target question</option>
              {qs.map((q) => <option key={q.id} value={q.id}>{q.source} Q{q.number}{q.marks ? ` (${q.marks})` : ''}</option>)}
            </select>
          )}
          <button disabled={busy}>{busy ? 'Building…' : 'Build pack'}</button>
        </form>
      )}
      {out?.error && <p className="banner bad">{out.error}</p>}
      {out?.prompt && (
        <div className="promptout">
          <p className="muted small">{s.goals.find((g) => g.id === out.goal)?.name} · about {out.tokens.toLocaleString()} tokens{out.cut.length ? ` · ${out.cut.length} file${out.cut.length === 1 ? '' : 's'} left out (over the budget)` : ''}</p>
          <div className="row wrap">
            <button onClick={copy}>{copied ? 'Copied ✓' : '1. Copy Master Prompt'}</button>
            <button className="ghost" onClick={() => download(out.filename, out.md)}>2. Download {out.filename}</button>
          </div>
          <h4>Upload checklist</h4>
          <ol className="checklist-steps">{out.checklist.map((c) => <li key={c}>{c}</li>)}</ol>
          <details><summary>See the prompt</summary><textarea readOnly rows={12} value={out.prompt} onFocus={(e) => e.target.select()} aria-label="Master Prompt" /></details>
          <details><summary>See the pack</summary><textarea readOnly rows={12} value={out.md} aria-label="Context pack" /></details>
        </div>
      )}
      <QuickPrompt s={s} />
    </section>
  );
}

// Quick prompts: short, templated, with a capped slice of the synced material.
function QuickPrompt({ s }) {
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
    <details className="past">
      <summary>Quick prompts (short, no pack)</summary>
      <p className="muted small">A short templated prompt with a capped slice of the unit's synced material, for a quick question in any chat.</p>
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
    </details>
  );
}
