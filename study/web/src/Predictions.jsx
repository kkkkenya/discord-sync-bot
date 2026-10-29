import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Busy from './Busy.jsx';

const KIND = { focus: 'Focus', exclude: 'Skip', note: 'Note' };

// One lecturer hint: their words, the kind, and the topics it's about (tap a topic to tag/untag it).
function Hint({ h, topics, reload, notify }) {
  const patch = (body) => api('PATCH', `hints/${h.id}`, body).then(reload);
  const toggle = (id) => patch({ topicIds: h.topicIds.includes(id) ? h.topicIds.filter((x) => x !== id) : [...h.topicIds, id] });
  const del = async () => { await api('DELETE', `hints/${h.id}`); notify('Hint deleted', () => api('POST', 'hints', { restore: h }).then(reload)); reload(); };
  return (
    <li className="hint">
      <div className="row wrap">
        <q>{h.text}</q>
        <select value={h.kind} onChange={(e) => patch({ kind: e.target.value })} aria-label="What kind of hint">
          {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="x" aria-label="Delete hint" onClick={del}>×</button>
      </div>
      {h.kind !== 'note' && (
        <div className="tags" role="group" aria-label="Topics this hint is about">
          {topics.map((t) => <button key={t.id} className={`tag${h.topicIds.includes(t.id) ? ' on' : ''}`} aria-pressed={h.topicIds.includes(t.id)} onClick={() => toggle(t.id)}>{t.name}</button>)}
          {!h.topicIds.length && <span className="hot small">Tag the topic(s) it's about, or it changes nothing.</span>}
        </div>
      )}
    </li>
  );
}

function Paste({ unit, reload }) {
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const send = async (e) => {
    e.preventDefault();
    try { const { added } = await api('POST', 'predict/paste', { unit, label, text }); setMsg(`Added ${added.length} question${added.length === 1 ? '' : 's'}.`); setText(''); setLabel(''); reload(); } catch (err) { setMsg(err.message); }
  };
  return (
    <details className="past">
      <summary>Paste a paper's questions (scanned, or not on the server)</summary>
      <form onSubmit={send}>
        <input placeholder="Which paper, e.g. 2022 CAT 1" aria-label="Which paper" value={label} onChange={(e) => setLabel(e.target.value)} />
        <textarea rows={5} placeholder="Paste the questions. Start each with QUESTION ONE / QUESTION TWO … and keep the (x marks)." aria-label="Question text" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="ghost" disabled={!label.trim() || !text.trim()}>Add questions</button> {msg && <span className="muted small" role="status">{msg}</span>}
      </form>
    </details>
  );
}

// Predictions: past-paper questions mapped to topics + lecturer hints → topics ranked by exam weight.
export default function Predictions({ s, unit, setUnit, focus, go, notify }) {
  const [p, setP] = useState(null);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(null);
  const reload = useCallback(() => (unit ? api('GET', `predict?unit=${encodeURIComponent(unit)}`).then(setP).catch((e) => setMsg(e.message)) : null), [unit]);
  // reload on unit change, and whenever the store changes elsewhere (topics added, a hint from the bot…)
  useEffect(() => { reload(); }, [reload, s]);

  const topics = s.data.topics.filter((t) => t.unit === unit);
  const run = async (what, fn) => { setBusy(what); setMsg(''); try { setMsg(await fn()); } catch (e) { setMsg(e.message); } setBusy(''); reload(); };
  const parse = () => run('parse', async () => { const r = await api('POST', 'predict/parse', { unit }); return `Read ${r.questions} question${r.questions === 1 ? '' : 's'} from ${r.papers} synced paper${r.papers === 1 ? '' : 's'}.${r.papers ? '' : ' Sync the unit\'s files in Units first.'}`; });
  const map = () => run('map', async () => { const r = await api('POST', 'predict/map', { unit }); return `The AI placed ${r.mapped} of ${r.of ?? r.mapped} questions. Check them below; your picks always win.`; });
  const addHint = async (e) => {
    e.preventDefault();
    try { await api('POST', 'hints', { unit, text: hint }); setHint(''); reload(); } catch (err) { setMsg(err.message); }
  };
  const setTopic = (q, topicId) => api('PATCH', `paperq/${q.id}`, { topicId: topicId || null }).then(reload);
  const unmapped = p?.questions.filter((q) => !q.topicId) || [];
  const stage = s.units?.[unit]?.stage;

  const qrow = (q) => (
    <li key={q.id}>
      <span className="muted small">{q.source} · Q{q.number}{q.marks ? ` · ${q.marks} marks` : ''}</span>
      <p className="small qtext">{q.text.length > 280 ? `${q.text.slice(0, 280)}…` : q.text}</p>
      <label className="small">Topic{' '}
        <select value={q.topicId || ''} onChange={(e) => setTopic(q, e.target.value)}>
          <option value="">(none)</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      {q.topicFrom && q.topicId && <span className="muted small"> {q.topicFrom === 'you' ? 'set by you' : q.topicFrom === 'ai' ? 'AI guess' : 'matched by name'}</span>}
      {' '}<button className="link small" onClick={() => go('practice', { unit, questionId: q.id })}>Check my answer</button>
      {' '}<button className="link small" onClick={() => go('prompt', { unit, questionId: q.id })}>Solve in Prompt Builder</button>
    </li>
  );

  return (
    <section id="predictions" className="reveal">
      <div className="head"><h2>Predictions</h2></div>
      <p className="muted small">What's likely to come: each topic's exam weight is how often it appears in past papers × its average marks, times what the lecturer said (focus 2.5×, skip ½× with time to spare, 0× near the paper). Lecturer focus is pinned to the top.</p>
      {!s.data.units.length ? <p className="muted">Pick your units first.</p> : (
        <>
          <div className="row wrap">
            <select value={unit} onChange={(e) => { setUnit(e.target.value); setOpen(null); setMsg(''); }} aria-label="Unit">
              {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
            </select>
            {stage && <span className={`stage ${stage.id}`}>{stage.name}</span>}
          </div>

          <h4>What did the lecturer say?</h4>
          <form className="row wrap" onSubmit={addHint}>
            <input className="grow" value={hint} onChange={(e) => setHint(e.target.value)} placeholder='e.g. "the exam will mainly focus on beta functions"' aria-label="Lecturer hint, in their words" />
            <button className="ghost" disabled={!hint.trim()}>Save hint</button>
          </form>
          {p?.hints.length > 0 && <ul className="hints">{[...p.hints].reverse().map((h) => <Hint key={h.id} h={h} topics={topics} reload={reload} notify={notify} />)}</ul>}

          <h4>Past papers</h4>
          <div className="row wrap">
            <button className="ghost" onClick={parse} disabled={!!busy}>{busy === 'parse' ? 'Reading…' : 'Read synced past papers'}</button>
            {s.ai && p?.questions.length > 0 && <button className="ghost" onClick={map} disabled={!!busy}><Busy on={busy === 'map'} label="Mapping…" idle="Map topics with AI" /></button>}
            {p && <span className="muted small">{p.questions.length} question{p.questions.length === 1 ? '' : 's'} from {new Set(p.questions.map((q) => q.fileId)).size} paper{new Set(p.questions.map((q) => q.fileId)).size === 1 ? '' : 's'}</span>}
          </div>
          {msg && <p className="muted small" role="status">{msg}</p>}
          {p?.scanned.length > 0 && (
            <p className="small warm">Scanned, no text: {p.scanned.map((f) => f.name).join(', ')}. Paste their questions below, or attach them when you use the Prompt Builder.</p>
          )}
          <Paste unit={unit} reload={reload} />

          {p && (
            <>
              <h4>Most likely topics</h4>
              {!topics.length && <p className="muted small">Add the unit's topics in Units first.</p>}
              <ol className="ranked">
                {p.ranked.map((r) => {
                  const qs = p.questions.filter((q) => q.topicId === r.topicId);
                  return (
                    <li key={r.topicId} className={r.muted ? 'muted' : ''}>
                      <div className="row wrap">
                        <b>{r.name}</b>
                        {r.pinned && <span className="badge pin" title={r.hint || ''}>📌 Pinned by lecturer</span>}
                        {r.muted && <span className="badge" title={r.hint || ''}>Muted by lecturer</span>}
                        <span className="muted small">weight {r.weight}{r.mult !== 1 ? ` (${r.base} × ${r.mult})` : ''} · {r.evidence}</span>
                        <button className="link small" onClick={() => go('prompt', { unit, topicId: r.topicId })}>Prompt Builder</button>
                        {qs.length > 0 && <button className="link small" onClick={() => setOpen(open === r.topicId ? null : r.topicId)} aria-expanded={open === r.topicId}>{open === r.topicId ? 'hide' : 'show'} questions</button>}
                      </div>
                      {open === r.topicId && <ul className="qlist">{qs.map(qrow)}</ul>}
                    </li>
                  );
                })}
              </ol>
              {unmapped.length > 0 && (
                <details className="past" open={unmapped.length <= 5}>
                  <summary>{unmapped.length} question{unmapped.length === 1 ? '' : 's'} with no topic yet</summary>
                  <ul className="qlist">{unmapped.map(qrow)}</ul>
                </details>
              )}
              <div className="row">
                <button onClick={() => go('mock', { unit, predicted: true })} disabled={!p.questions.some((q) => q.topicId)}>Predicted mock →</button>
                <span className="muted small">One recent question from each top topic, until they cover ~65% of the predicted marks.</span>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
