import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const AUDIT = [['solid', 'Solid', 'can solve it blind'], ['shaky', 'Shaky', 'need the formula / slow'], ['stuck', 'Stuck', "don't get the concept or steps"], ['untested', 'Untested', 'not tried yet']];
const KINDS = ['concept', 'derivation', 'method', 'assumption'];
const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || a.at.localeCompare(b.at);

// One sub-topic: rename in place, kind, the 4-way audit, reorder, delete (with undo). The row itself takes the
// audit keys: 1 solid · 2 shaky · 3 stuck · 4 untested, and ↑/↓ move between rows.
function SubRow({ sub, prev, next, refresh, notify }) {
  const [name, setName] = useState(sub.name);
  useEffect(() => setName(sub.name), [sub.name]);
  const patch = (body) => api('PATCH', `subtopics/${sub.id}`, body).then(refresh);
  const rate = (audit) => api('POST', 'subtopics/audit', { ratings: { [sub.id]: audit } }).then(refresh);
  const swap = (other) => Promise.all([
    api('PATCH', `subtopics/${sub.id}`, { order: other.order || 0 }),
    api('PATCH', `subtopics/${other.id}`, { order: sub.order || 0 }),
  ]).then(refresh);
  const del = async () => {
    await api('DELETE', `subtopics/${sub.id}`);
    notify(`Deleted "${sub.name}"`, () => api('POST', 'subtopics', { restore: sub }));
    refresh();
  };
  const onKey = (e) => {
    if (e.target !== e.currentTarget) return;
    const rows = [...document.querySelectorAll('.subrow')];
    const i = rows.indexOf(e.currentTarget);
    if (/^[1-4]$/.test(e.key)) { e.preventDefault(); rate(AUDIT[Number(e.key) - 1][0]); rows[i + 1]?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); rows[i + 1]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); rows[i - 1]?.focus(); }
  };
  return (
    <li className="subrow" tabIndex={0} onKeyDown={onKey} aria-label={`${sub.name}: ${sub.audit}. Press 1 solid, 2 shaky, 3 stuck, 4 untested`}>
      <input
        className="name" value={name} aria-label="Sub-topic name"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== sub.name && patch({ name: name.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <select value={sub.kind} onChange={(e) => patch({ kind: e.target.value })} aria-label={`${sub.name}: kind`}>
        {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <span className="audit" role="radiogroup" aria-label={`${sub.name}: self-audit`}>
        {AUDIT.map(([id, label, hint], n) => (
          <button key={id} role="radio" aria-checked={sub.audit === id} className={`${id}${sub.audit === id ? ' on' : ''}`} title={`${n + 1}: ${hint}`} onClick={() => rate(id)}>{label}</button>
        ))}
      </span>
      {sub.auditFrom === 'teach' && <span className="muted small" title="Flagged by a teach-back gap">from teach-back</span>}
      <span>
        <button className="x" aria-label={`Move ${sub.name} up`} disabled={!prev} onClick={() => swap(prev)}>↑</button>
        <button className="x" aria-label={`Move ${sub.name} down`} disabled={!next} onClick={() => swap(next)}>↓</button>
        <button className="x" aria-label={`Delete ${sub.name}`} onClick={del}>×</button>
      </span>
    </li>
  );
}

function TopicBlock({ topic, subs, s, refresh, notify }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('concept');
  const [ideas, setIdeas] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const m = s.mastery?.[topic.id];
  const add = async (names, k = kind) => {
    setError('');
    try { await api('POST', 'subtopics', { topicId: topic.id, names, kind: k }); refresh(); } catch (e) { setError(e.message); }
  };
  const suggest = async () => {
    setBusy(true); setError('');
    try { setIdeas((await api('POST', 'subtopics/suggest', { topicId: topic.id })).suggestions); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const addIdea = async (i) => { await add([i.name], i.kind); setIdeas((x) => x.filter((y) => y !== i)); };
  return (
    <div className="topicblock">
      <header>
        <h3><span className={`chip solo ${m?.status || 'red'}`} title={m ? `${m.why}\nNext: ${m.next}` : ''}>{topic.name}</span></h3>
        {s.ai
          ? <button className="ghost small" onClick={suggest} disabled={busy}>{busy ? 'Reading your notes…' : 'Suggest sub-topics'}</button>
          : <span className="muted small">No AI key: add sub-topics by hand</span>}
      </header>
      {ideas && (
        <div className="suggest" aria-label="Suggested sub-topics">
          {ideas.length ? ideas.map((i) => <button key={i.name} className="ghost small" onClick={() => addIdea(i)}>+ {i.name} <span className="muted">({i.kind})</span></button>) : <span className="muted small">Nothing new to suggest.</span>}
          {ideas.length > 1 && <button className="link small" onClick={async () => { for (const k of ['concept', 'derivation', 'method', 'assumption']) { const n = ideas.filter((i) => i.kind === k).map((i) => i.name); if (n.length) await api('POST', 'subtopics', { topicId: topic.id, names: n, kind: k }); } setIdeas([]); refresh(); }}>add all</button>}
          <p className="muted small">AI suggestions can be off: keep only what your course actually covers.</p>
        </div>
      )}
      {subs.length > 0 && (
        <ul className="subtopics">
          {subs.map((sub, i) => <SubRow key={sub.id} sub={sub} prev={subs[i - 1]} next={subs[i + 1]} refresh={refresh} notify={notify} />)}
        </ul>
      )}
      <form className="row wrap" onSubmit={(e) => { e.preventDefault(); const n = text.split(',').map((x) => x.trim()).filter(Boolean); if (n.length) { add(n); setText(''); } }}>
        <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={subs.length ? 'Add sub-topics, comma separated' : 'e.g. Sign convention, Principal stresses, Max in-plane shear'} aria-label={`Add sub-topics to ${topic.name}`} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind of the new sub-topics">{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        <button className="ghost" disabled={!text.trim()}>Add</button>
      </form>
      {error && <p className="hot small" role="alert">{error}</p>}
    </div>
  );
}

// Weakspots: break each topic into sub-topics and concepts, then audit them in a minute.
export default function Analysis({ s, refresh, focus, notify }) {
  const [unit, setUnit] = useState(s.data.units[0]?.code || '');
  const ref = useRef(null);
  useEffect(() => { if (focus?.section === 'analysis' && focus.unit) setUnit(focus.unit); }, [focus]);
  useEffect(() => { if (!s.data.units.some((u) => u.code === unit)) setUnit(s.data.units[0]?.code || ''); }, [s.data.units, unit]);
  const topics = s.data.topics.filter((t) => t.unit === unit);
  const subsOf = (t) => s.data.subtopics.filter((x) => x.topicId === t.id).sort(byOrder);
  const all = topics.flatMap(subsOf);
  const count = (a) => all.filter((x) => x.audit === a).length;
  const startAudit = () => ref.current?.querySelector('.subrow')?.focus();

  return (
    <section id="analysis" className="reveal" ref={ref}>
      <div className="head"><h2>Weakspots</h2></div>
      <p className="muted small">Break each topic into the sub-topics, derivations, methods and assumptions an exam tests, then rate each one honestly. Teach-back gaps mark the matching sub-topic shaky for you.</p>
      {!s.data.units.length ? <p className="muted">Pick your units first.</p> : (
        <>
          <div className="row wrap">
            <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
              {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
            </select>
            {all.length > 0 && <button className="ghost" onClick={startAudit}>Start the 60-second audit</button>}
            {all.length > 0 && (
              <span className="muted small">{count('solid')} solid · {count('shaky')} shaky · {count('stuck')} stuck · {count('untested')} untested</span>
            )}
          </div>
          {all.length > 0 && <p className="muted small">Audit with the keyboard: focus a row, then <kbd>1</kbd> solid · <kbd>2</kbd> shaky · <kbd>3</kbd> stuck · <kbd>4</kbd> untested; it moves to the next row.</p>}
          {!topics.length && <p className="muted small">No topics for {unit} yet. Add them in Units first.</p>}
          {topics.map((t) => <TopicBlock key={t.id} topic={t} subs={subsOf(t)} s={s} refresh={refresh} notify={notify} />)}
        </>
      )}
    </section>
  );
}
