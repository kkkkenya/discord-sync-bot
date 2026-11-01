import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';
import Learn from './Learn.jsx';

const AUDITS = [{ id: 'solid', label: 'Solid' }, { id: 'shaky', label: 'Shaky' }, { id: 'stuck', label: 'Stuck' }, { id: 'untested', label: 'Untested' }];
const MASTERY = { green: ['good', 'Strong'], amber: ['warn', 'Getting there'], red: ['bad', 'Weak'] };

// Suggested names, ticked by default; nothing is saved until "Add".
function Picks({ items, onAdd, onCancel, busy }) {
  const [on, setOn] = useState(() => new Set(items.map((x) => x.name)));
  return (
    <div className="card">
      <fieldset className="checks">
        <legend className="visually-hidden">Suggestions</legend>
        {items.map((x) => (
          <label key={x.name} className="check">
            <input type="checkbox" checked={on.has(x.name)} onChange={(e) => { const n = new Set(on); if (e.target.checked) n.add(x.name); else n.delete(x.name); setOn(n); }} />
            {x.name}{x.from === 'general' && <span className="chip">Expected</span>}
          </label>
        ))}
      </fieldset>
      <div className="actions">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={busy || !on.size} onClick={() => onAdd([...on])}>Add {on.size}</button>
      </div>
    </div>
  );
}

function Topic({ t, s, refresh, go, unit, onProblem }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [picks, setPicks] = useState(null);
  const [busy, setBusy] = useState(false);
  const subs = s.data.subtopics.filter((x) => x.topicId === t.id).sort((a, b) => (a.order || 0) - (b.order || 0));
  const m = MASTERY[s.mastery?.[t.id]?.status];
  const rated = subs.filter((x) => x.audit && x.audit !== 'untested').length;
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { onProblem(e.message); } setBusy(false); };
  const rate = (id, audit) => run(async () => { await api('POST', 'subtopics/audit', { ratings: { [id]: audit } }); await refresh(); });
  const addNames = (names) => run(async () => { await api('POST', 'subtopics', { topicId: t.id, names }); setName(''); setPicks(null); await refresh(); });
  const suggest = () => run(async () => { const r = await api('POST', 'subtopics/suggest', { topicId: t.id }); setPicks(r.suggestions.length ? r.suggestions : []); });

  return (
    <div className="topic">
      <button className="list-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="row-main"><span>{t.name}</span><span className="row-sub">{subs.length ? `${rated} of ${subs.length} rated` : 'No sub-topics yet'}</span></span>
        {m && <span className={`chip ${m[0]}`}>{m[1]}</span>}
        <span className={`chev${open ? ' open' : ''}`}><Icon name="chevron" /></span>
      </button>
      {open && (
        <div className="topic-body">
          {subs.map((x) => (
            <div key={x.id} className="sub">
              <span className="sub-name">{x.name}</span>
              <div className="segmented small" role="group" aria-label={`How well you know ${x.name}`}>
                {AUDITS.map((a) => <button key={a.id} className={`audit ${a.id}`} aria-pressed={(x.audit || 'untested') === a.id} disabled={busy} onClick={() => rate(x.id, a.id)}>{a.label}</button>)}
              </div>
            </div>
          ))}
          <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (name.trim()) addNames([name.trim()]); }}>
            <label className="field grow">
              <span className="visually-hidden">New sub-topic of {t.name}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a sub-topic" />
            </label>
            <button className="btn" disabled={busy || !name.trim()}>Add</button>
            <button type="button" className="btn" disabled={busy || !s.ai} onClick={suggest}>{busy && picks === null ? 'Thinking…' : 'Suggest'}</button>
          </form>
          {picks?.length === 0 && <p className="row-sub">No new suggestions. Add them by hand.</p>}
          {picks?.length > 0 && noOutline && <p className="notice" role="status">No course outline for {unit} on the hub yet. These come from past papers first; the ones marked expected are what a course like this usually covers. Add the outline to the hub and suggest again for the exact list.</p>}
      {picks?.length > 0 && <Picks items={picks} busy={busy} onAdd={addNames} onCancel={() => setPicks(null)} />}
          <button className="btn plain" onClick={() => go('learn', { unit, topic: t.name })}>Study this topic</button>
        </div>
      )}
    </div>
  );
}

// Topics in outline order. Open one to rate its sub-topics (one tap each) or add more.
export default function UnitTopics(props) {
  const { s, unit, refresh, notify, user } = props;
  const [noOutline, setNoOutline] = useState(false);
  const [picks, setPicks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const topics = s.data.topics.filter((t) => t.unit === unit);
  const run = async (fn) => { setBusy(true); setProblem(''); try { await fn(); } catch (e) { setProblem(e.message); } setBusy(false); };
  const suggest = () => run(async () => { const r = await api('POST', 'topics/suggest', { unit }); setPicks(r.suggestions); setNoOutline(r.outline === false); if (!r.suggestions.length) notify('No new topics found in the outline or past papers.'); });
  // the class's list for this unit (shared unit library); opening the tab also shares yours if the class has none
  const [cls, setCls] = useState(null);
  useEffect(() => { setCls(null); api('GET', `class?unit=${encodeURIComponent(unit)}`).then(setCls).catch(() => {}); }, [unit, topics.length]);
  const subCount = cls?.list?.topics.reduce((n, t) => n + (t.subtopics?.length || 0), 0) || 0;
  const useClass = () => run(async () => { await api('POST', 'class/use', { unit }); await refresh(); notify('Added the class list. Your changes to it stay yours.'); });
  const addTopics = (names) => run(async () => { for (const n of names) await api('POST', 'topics', { unit, name: n, status: 'red' }); setPicks(null); setName(''); await refresh(); });

  return (
    <>
      {problem && <p className="notice bad" role="alert">{problem}</p>}
      {!topics.length && !picks && cls?.list && (
        <section className="card stack" aria-labelledby="class-title">
          <h2 className="card-title" id="class-title">Your class already listed {unit}</h2>
          <p className="muted small"><span className="num">{cls.list.topics.length}</span> topics{subCount > 0 && <> and <span className="num">{subCount}</span> sub-topics</>} from the outline and past papers. Your ratings stay private, and anything you change is yours.</p>
          <ol className="plain-list small">{cls.list.topics.slice(0, 6).map((t) => <li key={t.name}>{t.name}</li>)}{cls.list.topics.length > 6 && <li className="muted">and <span className="num">{cls.list.topics.length - 6}</span> more</li>}</ol>
          <div className="toolbar"><button type="button" className="btn primary" onClick={useClass} disabled={busy}>{busy ? 'Adding…' : 'Use the class list'}</button><button type="button" className="btn plain" onClick={suggest} disabled={busy || !s.ai}>Suggest my own</button></div>
        </section>
      )}
      {!topics.length && !picks && !cls?.list && (
        <div className="empty">
          <h2>No topics yet</h2>
          <p>Crux can list them from the course outline and past papers.</p>
          <button className="btn primary" onClick={suggest} disabled={busy || !s.ai}>{busy ? 'Reading…' : 'Suggest topics'}</button>
        </div>
      )}
      {picks?.length > 0 && <Picks items={picks} busy={busy} onAdd={addTopics} onCancel={() => setPicks(null)} />}
      {topics.length > 0 && (
        <div className="list">
          {topics.map((t) => <Topic key={t.id} t={t} {...props} onProblem={setProblem} />)}
        </div>
      )}
      <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (name.trim()) addTopics([name.trim()]); }}>
        <label className="field grow"><span className="visually-hidden">New topic</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a topic" /></label>
        <button className="btn" disabled={busy || !name.trim()}>Add</button>
        {topics.length > 0 && <button type="button" className="btn" onClick={suggest} disabled={busy || !s.ai}>Suggest</button>}
      </form>
      {user?.tier === 'owner' && topics.length >= 3 && <div className="toolbar"><button type="button" className="btn plain" disabled={busy} onClick={() => run(async () => { await api('POST', 'class/share', { unit }); notify(`Your ${unit} list is now the class list.`); })}>Make this the class list</button></div>}
      <Learn {...props} />
    </>
  );
}
