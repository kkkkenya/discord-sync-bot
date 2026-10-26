import { useEffect, useState } from 'react';
import { api, daysUntil } from './api.js';

const NEXT = { red: 'amber', amber: 'green', green: 'red' };

function Picker({ s, refresh, close }) {
  const [cat, setCat] = useState(null);
  const [picked, setPicked] = useState(() => new Set(s.data.units.map((u) => u.code)));
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => { api('GET', 'catalog').then(setCat).catch((e) => setStatus(e.message)); }, []);
  if (!cat) return <p className="muted">{status || 'Loading units…'}</p>;
  const list = q.trim() ? cat.all.filter((u) => `${u.codes.join(' ')} ${u.title}`.toLowerCase().includes(q.toLowerCase())) : cat.year3;
  const toggle = (code) => setPicked((p) => { const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const saveIt = async () => {
    setStatus('Saving…');
    try {
      await api('PUT', 'units', cat.all.filter((u) => picked.has(u.code)).map((u) => ({ code: u.code, title: u.title })));
      await refresh();
      close();
    } catch (e) { setStatus(e.message); }
  };
  return (
    <div className="picker">
      <p className="muted small">Tick the units you're taking in 3.1. These are the 3rd-year Mechanical units the Study Hub knows; search to add any other.</p>
      <input placeholder="Search all units (code or title)" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul>
        {list.map((u) => (
          <li key={u.code}><label><input type="checkbox" checked={picked.has(u.code)} onChange={() => toggle(u.code)} /> <span className="code">{u.codes.join(' / ')}</span> {u.title}</label></li>
        ))}
      </ul>
      <div className="row">
        <button onClick={saveIt} disabled={status === 'Saving…'}>Save {picked.size} unit{picked.size === 1 ? '' : 's'}</button>
        {s.data.units.length > 0 && <button className="ghost" onClick={close}>Cancel</button>}
        {status && <span className={status === 'Saving…' ? 'muted small' : 'hot small'} role="status">{status}</span>}
      </div>
    </div>
  );
}

function Library({ code, go }) {
  const [lib, setLib] = useState(null);
  useEffect(() => { api('GET', `library?unit=${encodeURIComponent(code)}`).then(setLib).catch((e) => setLib({ files: [], note: e.message })); }, [code]);
  if (!lib) return <p className="muted small">Checking the server library…</p>;
  if (!lib.files.length) return <p className="muted small">{lib.note || 'Nothing in the server library for this unit yet.'}</p>;
  const papers = lib.files.filter((f) => f.paper);
  const rest = lib.files.filter((f) => !papers.includes(f));
  const item = (f) => (
    <li key={f.id}>
      <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
      {papers.includes(f) && <button className="link" onClick={() => go('papers', { unit: code, label: f.name.replace(/\.[a-z0-9]+$/i, ''), fileId: f.id })}>log score</button>}
    </li>
  );
  return (
    <div className="library">
      {papers.length > 0 && <><h4>Past papers and CATs</h4><ul>{papers.map(item)}</ul></>}
      {rest.length > 0 && <details><summary>Notes and other files ({rest.length})</summary><ul>{rest.map(item)}</ul></details>}
    </div>
  );
}

function Unit({ u, s, refresh, go }) {
  const [topic, setTopic] = useState('');
  const [open, setOpen] = useState(false);
  const topics = s.data.topics.filter((t) => t.unit === u.code);
  const due = s.data.cards.filter((c) => c.unit === u.code && c.due <= s.today).length;
  const cat = u.catDate || s.next?.start;
  const set = (body) => api('PATCH', `units?code=${encodeURIComponent(u.code)}`, body).then(refresh);
  const addTopic = async (e) => {
    e.preventDefault();
    for (const name of topic.split(',').map((x) => x.trim()).filter(Boolean)) await api('POST', 'topics', { unit: u.code, name, status: 'red' });
    setTopic('');
    refresh();
  };
  return (
    <article className="unit">
      <header>
        <div><span className="code">{u.code}</span> <span className="title">{u.title}</span></div>
        <div className="meta">
          <label>CAT <input type="date" value={u.catDate || ''} onChange={(e) => set({ catDate: e.target.value || null })} /></label>
          {cat && <span className={`when ${daysUntil(s.today, cat) <= 3 ? 'hot' : ''}`}>{Math.max(0, daysUntil(s.today, cat))}d</span>}
          <span className="conf" title="How ready do you feel?">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`confidence ${n}`} className={n <= (u.confidence || 0) ? 'on' : ''} onClick={() => set({ confidence: n })} />)}
          </span>
        </div>
      </header>
      <div className="topics">
        {topics.map((t) => (
          <span key={t.id} className={`chip ${t.status}`}>
            <button onClick={() => api('PATCH', `topics/${t.id}`, { status: NEXT[t.status] }).then(refresh)} title="Click: red → amber → green">{t.name}{t.taughtAt ? ' ✓' : ''}</button>
            <button className="x" aria-label={`remove ${t.name}`} onClick={() => api('DELETE', `topics/${t.id}`).then(refresh)}>×</button>
          </span>
        ))}
        <form onSubmit={addTopic}><input placeholder={topics.length ? 'Add topic' : 'CAT topics, comma separated'} value={topic} onChange={(e) => setTopic(e.target.value)} /></form>
      </div>
      <div className="row small">
        <button className="link" onClick={() => go('recall', { unit: u.code })}>{due} due cards</button>
        <button className="link" onClick={() => go('teach', { unit: u.code })}>teach a topic</button>
        <button className="link" onClick={() => setOpen(!open)}>{open ? 'hide' : 'show'} server files</button>
      </div>
      {open && <Library code={u.code} go={go} />}
    </article>
  );
}

export default function Units(props) {
  const { s } = props;
  const [picking, setPicking] = useState(!s.data.units.length);
  return (
    <section id="units" className="reveal">
      <div className="head"><h2>Units</h2>{!picking && <button className="ghost" onClick={() => setPicking(true)}>Edit units</button>}</div>
      {picking ? <Picker {...props} close={() => setPicking(false)} /> : (
        <>
          <p className="muted small">Topics start red. Click to move them red → amber → green as you can recall and teach them. ✓ means you've done a teach-back.</p>
          {s.data.units.map((u) => <Unit key={u.code} u={u} {...props} />)}
        </>
      )}
    </section>
  );
}
