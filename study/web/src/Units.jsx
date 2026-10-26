import { useEffect, useState } from 'react';
import { api, daysUntil } from './api.js';

const CYCLE = [null, 'green', 'amber', 'red']; // manual override: auto → green → amber → red → auto

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

const snippet = (text, q) => {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 200);
  return `${i > 60 ? '…' : ''}${text.slice(Math.max(0, i - 60), i + 180)}${i + 180 < text.length ? '…' : ''}`;
};

function Library({ code, go }) {
  const [lib, setLib] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const load = () => api('GET', `library?unit=${encodeURIComponent(code)}`).then(setLib).catch((e) => setLib({ files: [], note: e.message }));
  useEffect(() => { load(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async () => {
    setBusy(true);
    try { await api('POST', 'library/ingest', { unit: code }); await load(); }
    catch (e) { setLib((x) => ({ ...(x || { files: [] }), note: e.message })); }
    setBusy(false);
  };

  if (!lib) return <p className="muted small">Checking the server library…</p>;
  const synced = lib.files.filter((f) => f.synced).length;
  const papers = lib.files.filter((f) => f.paper);
  const rest = lib.files.filter((f) => !papers.includes(f));
  const withText = lib.files.filter((f) => f.synced && f.text);
  const hits = q.trim() ? withText.filter((f) => f.text.toLowerCase().includes(q.toLowerCase())) : [];

  const item = (f) => (
    <li key={f.id}>
      <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
      {papers.includes(f) && <button className="link" onClick={() => go('papers', { unit: code, label: f.name.replace(/\.[a-z0-9]+$/i, ''), fileId: f.id })}>log score</button>}
      <span className={`muted small ${f.synced ? '' : 'hot'}`}>{f.synced ? (f.chars ? `${f.chars} chars` : 'no text (scanned)') : 'not synced'}</span>
      {f.synced && f.text && <details className="preview"><summary>preview</summary><p>{f.text.slice(0, 500)}{f.text.length > 500 ? '…' : ''}</p></details>}
    </li>
  );

  return (
    <div className="library">
      <div className="row">
        <button className="ghost" onClick={sync} disabled={busy || !lib.files.length}>{busy ? 'Syncing…' : `Sync files (${synced}/${lib.files.length})`}</button>
        <input className="grow" placeholder="Search synced material…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {lib.note && <p className="muted small">{lib.note}</p>}
      {!lib.files.length && <p className="muted small">Nothing in the server library for this unit yet.</p>}
      {papers.length > 0 && <><h4>Past papers and CATs</h4><ul>{papers.map(item)}</ul></>}
      {rest.length > 0 && <details><summary>Notes and other files ({rest.length})</summary><ul>{rest.map(item)}</ul></details>}
      {q.trim() && (
        <div className="searchresults">
          <h4>Matches ({hits.length})</h4>
          {hits.length === 0 && <p className="muted small">No synced material contains that.</p>}
          {hits.map((f) => (
            <div key={f.id} className="hit">
              <b>{f.name}</b>
              <p className="small">{snippet(f.text, q)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Unit({ u, s, refresh, go }) {
  const [topic, setTopic] = useState('');
  const [open, setOpen] = useState(false);
  const topics = s.data.topics.filter((t) => t.unit === u.code);
  const due = s.data.cards.filter((c) => c.unit === u.code && c.due <= s.today).length;
  const cat = u.catDate || s.next?.start;
  const rated = topics.map((t) => ({ t, m: s.mastery?.[t.id] || { status: 'red', manual: false, why: '', next: '' } }));
  const green = rated.filter((x) => x.m.status === 'green').length;
  const amber = rated.filter((x) => x.m.status === 'amber').length;
  const covered = topics.length ? Math.round(((green + amber * 0.5) / topics.length) * 100) : 0;
  const pending = rated.find((x) => x.m.status !== 'green');
  const set = (body) => api('PATCH', `units?code=${encodeURIComponent(u.code)}`, body).then(refresh);
  const addTopic = async (e) => {
    e.preventDefault();
    for (const name of topic.split(',').map((x) => x.trim()).filter(Boolean)) await api('POST', 'topics', { unit: u.code, name });
    setTopic('');
    refresh();
  };
  const nextManual = (t, m) => CYCLE[(CYCLE.indexOf(t.manual ?? null) + 1) % CYCLE.length];
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
        {rated.map(({ t, m }) => (
          <span key={t.id} className={`chip ${m.status}`}>
            <button onClick={() => api('PATCH', `topics/${t.id}`, { manual: nextManual(t, m) }).then(refresh)} title={`${m.why}\nNext: ${m.next}`}>
              {t.name}{t.taughtAt ? ' ✓' : ''}{m.manual ? ' · you' : ''}
            </button>
            <button className="x" aria-label={`remove ${t.name}`} onClick={() => api('DELETE', `topics/${t.id}`).then(refresh)}>×</button>
          </span>
        ))}
        <form onSubmit={addTopic}><input data-tour="topics" placeholder={topics.length ? 'Add topic' : 'CAT topics, comma separated'} value={topic} onChange={(e) => setTopic(e.target.value)} /></form>
      </div>
      {topics.length > 0 && (
        <div className="cover" role="img" aria-label={`${u.code}: ${covered}% covered`}>
          <span className="muted small">{covered}%</span>
          <span className="track">
            <i className="seg-g" style={{ width: `${green / topics.length * 100}%` }} />
            <i className="seg-a" style={{ width: `${amber / topics.length * 100}%` }} />
            <i className="seg-r" style={{ width: `${(topics.length - green - amber) / topics.length * 100}%` }} />
          </span>
          <span className="muted small">{green}/{topics.length} mastered</span>
        </div>
      )}
      {pending && <p className="muted small next">Next to turn green: <b>{pending.t.name}</b> — {pending.m.next}.</p>}
      <div className="row small">
        <button className="link" onClick={() => go('recall', { unit: u.code })}>{due} due cards</button>
        <button className="link" onClick={() => go('teach', { unit: u.code })}>teach a topic</button>
        <button className="link" data-tour="sync" onClick={() => setOpen(!open)}>{open ? 'hide' : 'show'} server files</button>
      </div>
      {open && <Library code={u.code} go={go} />}
    </article>
  );
}

export default function Units(props) {
  const { s } = props;
  const [picking, setPicking] = useState(!s.data.units.length);
  return (
    <section id="units" className="reveal" data-tour="units">
      <div className="head"><h2>Units</h2>{!picking && <button className="ghost" onClick={() => setPicking(true)}>Edit units</button>}</div>
      {picking ? <Picker {...props} close={() => setPicking(false)} /> : (
        <>
          <p className="muted small">A topic's colour now follows the evidence (teach-back score, recall reviews, solved questions), not a tick. Hover a chip to see why, and what's missing. Click a chip to force a colour yourself — it shows "· you". ✓ means you've done a teach-back.</p>
          {s.data.units.map((u) => <Unit key={u.code} u={u} {...props} />)}
        </>
      )}
    </section>
  );
}
