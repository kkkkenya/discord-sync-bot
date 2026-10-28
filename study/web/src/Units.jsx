import { useEffect, useState } from 'react';
import { api, daysUntil, markUndatedTba } from './api.js';
import Busy from './Busy.jsx';


const YEARS = [1, 2, 3, 4, 5];
// the Breakpoint model's three links (server/understanding.js)
const LAYER = [['why', 'Why it works'], ['how', 'Setting it up'], ['do', 'Carrying it through']];
const FROM = { outline: 'outline', papers: 'past papers', both: 'outline and papers', general: 'general' }; // where a suggested topic came from

// Setup and "Edit units": Course → Year → Semester loads that cohort's units from the Study Hub catalogue. The Hub
// doesn't record semesters, so the whole year is listed: untick what you aren't sitting. Units you already picked
// from elsewhere (retakes, electives) stay ticked under their own heading; nothing is dropped unless you untick it.
function Picker({ s, refresh, close }) {
  const saved = s.settings.cohort || { course: 'EMM', year: 3, sem: 1 };
  const [cohort, setCohort] = useState(saved);
  const [stage, setStage] = useState(s.settings.stage || '');
  const [cat, setCat] = useState(null);
  const [picked, setPicked] = useState(() => new Set(s.data.units.map((u) => u.code)));
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    api('GET', `catalog?course=${cohort.course}&year=${cohort.year}`).then(setCat).catch((e) => setStatus(e.message));
  }, [cohort.course, cohort.year]);
  if (!cat) return <p className="muted small">{status || 'Loading units…'}</p>;

  const titles = new Map(cat.all.flatMap((u) => u.codes.map((c) => [c, u.title])));
  for (const u of s.data.units) if (u.title) titles.set(u.code, u.title);
  const inCohort = new Set([...cat.core, ...cat.shared].map((u) => u.code));
  const others = [...picked].filter((c) => !inCohort.has(c)).sort();
  const found = q.trim() ? cat.all.filter((u) => `${u.codes.join(' ')} ${u.title}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30) : [];
  const toggle = (code) => setPicked((p) => { const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const tickAll = (list, on) => setPicked((p) => { const n = new Set(p); for (const u of list) on ? n.add(u.code) : n.delete(u.code); return n; });
  const set = (k, v) => setCohort((c) => ({ ...c, [k]: v }));
  const courseName = cat.courses.find((c) => c.code === cohort.course)?.name || cohort.course;

  const saveIt = async () => {
    setStatus('Saving…');
    try {
      await api('POST', 'settings', { cohort, stage: stage || null });
      await api('PUT', 'units', [...picked].sort().map((code) => ({ code, title: titles.get(code) || '' })));
      await refresh();
      close();
    } catch (e) { setStatus(e.message); }
  };
  const item = (u) => (
    <li key={u.code}><label><input type="checkbox" checked={picked.has(u.code)} onChange={() => toggle(u.code)} /> <span className="code">{u.code}</span> {u.title || <span className="muted small">(no title in the Hub yet)</span>}</label></li>
  );

  return (
    <div className="picker">
      <div className="row wrap">
        <label className="small">Course{' '}
          <select value={cohort.course} onChange={(e) => set('course', e.target.value)}>
            {cat.courses.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
          </select>
        </label>
        <label className="small">Year{' '}
          <select value={cohort.year} onChange={(e) => set('year', Number(e.target.value))}>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </label>
        <label className="small">Semester{' '}
          <select value={cohort.sem} onChange={(e) => set('sem', Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option></select>
        </label>
        <label className="small">Study stage{' '}
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">Auto: from each unit's date (recommended)</option>
            {s.stages.map((st) => <option key={st.id} value={st.id}>{st.name} ({st.window})</option>)}
          </select>
        </label>
      </div>
      <p className="muted small">
        {courseName} {cohort.year}.{cohort.sem}: {cat.core.length} unit{cat.core.length === 1 ? '' : 's'} from the Study Hub{cat.shared.length ? `, plus ${cat.shared.length} shared maths/common unit${cat.shared.length === 1 ? '' : 's'}` : ''}.
        The Hub doesn't know which semester each unit is in yet, so the whole year is listed: tick the ones you're sitting this semester.
      </p>
      {cat.core.length > 0 ? (
        <>
          <div className="row"><h4>Your course</h4><button className="link" onClick={() => tickAll(cat.core, true)}>tick all</button><button className="link" onClick={() => tickAll(cat.core, false)}>none</button></div>
          <ul>{cat.core.map(item)}</ul>
        </>
      ) : <p className="muted small">No {cohort.course} year {cohort.year} units in the Study Hub yet. Search below to add yours.</p>}
      {cat.shared.length > 0 && <><h4>Shared units</h4><ul>{cat.shared.map(item)}</ul></>}
      {others.length > 0 && <><h4>Retakes and electives</h4><ul>{others.map((code) => item({ code, title: titles.get(code) }))}</ul></>}
      <input placeholder="Add a retake or elective: search all units (code or title)" aria-label="Search all units" value={q} onChange={(e) => setQ(e.target.value)} />
      {found.length > 0 && <ul>{found.map((u) => item({ code: inCohort.has(u.code) ? u.code : (u.codes.find((c) => c.startsWith(cohort.course)) || u.code), title: u.title }))}</ul>}
      <div className="row">
        <button onClick={saveIt} disabled={status === 'Saving…'}>Save {picked.size} unit{picked.size === 1 ? '' : 's'}</button>
        {s.data.units.length > 0 && <button className="ghost" onClick={close}>Cancel</button>}
        {status && <span className={status === 'Saving…' ? 'muted small' : 'hot small'} role="status">{status}</span>}
      </div>
    </div>
  );
}

// Pull every unit's server files into the context library in one go, one unit at a time, with a running summary.
function SyncAll({ s }) {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState([]);
  const run = async () => {
    setBusy(true);
    const out = [];
    for (const [i, u] of s.data.units.entries()) {
      setLines([...out, `Syncing ${u.code} (${i + 1}/${s.data.units.length})…`]);
      try {
        const r = await api('POST', 'library/ingest', { unit: u.code });
        if (r.note) { out.push(`${u.code}: ${r.note}`); continue; }
        const text = r.files.filter((f) => f.chars > 0).length;
        const failed = r.files.filter((f) => f.error && !/scanned/.test(f.error)).length;
        out.push(`${u.code}: ${r.files.length} file${r.files.length === 1 ? '' : 's'}, ${text} with text${r.files.length - text - failed ? `, ${r.files.length - text - failed} scanned (no text)` : ''}${failed ? `, ${failed} failed` : ''}${r.parsed?.questions ? `, ${r.parsed.questions} past-paper question${r.parsed.questions === 1 ? '' : 's'} read` : ''}`);
      } catch (e) { out.push(`${u.code}: ${e.message}`); }
    }
    setLines(out);
    setBusy(false);
  };
  return (
    <>
      <button className="ghost" onClick={run} disabled={busy || !s.data.units.length} data-tour="sync">{busy ? 'Syncing…' : 'Sync all files'}</button>
      {lines.length > 0 && <ul className="synclog muted small" role="status">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
    </>
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

  const [read, setRead] = useState(null); // past-paper questions read after the last sync
  const sync = async () => {
    setBusy(true);
    try { const r = await api('POST', 'library/ingest', { unit: code }); setRead(r.parsed?.questions ?? null); await load(); }
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
        <input className="grow" placeholder="Search synced material…" aria-label={`Search ${code} synced material`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {lib.note && <p className="muted small">{lib.note}</p>}
      {read != null && <p className="muted small" role="status">{read} past-paper question{read === 1 ? '' : 's'} read for Predict.</p>}
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

function Unit({ u, s, refresh, go, notify }) {
  const [topic, setTopic] = useState('');
  const [open, setOpen] = useState(false);
  const [ideas, setIdeas] = useState(null); // { suggestions, sources } from "Suggest topics"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [chip, setChip] = useState(null); // the topic whose why-panel is open
  const topics = s.data.topics.filter((t) => t.unit === u.code);
  const tba = u.catDate === 'TBA';
  const st = s.units[u.code]?.stage;
  const auto = st && st.source !== 'unit' ? st.name : s.stages.find((x) => x.id === (s.settings.stage || 'adequate'))?.name;
  const cat = tba ? null : u.catDate || s.next?.start;
  const rated = topics.map((t) => ({ t, m: s.mastery?.[t.id] || { status: 'red', manual: false, why: '', next: '' } }));
  const green = rated.filter((x) => x.m.status === 'green').length;
  const amber = rated.filter((x) => x.m.status === 'amber').length;
  const covered = topics.length ? Math.round(((green + amber * 0.5) / topics.length) * 100) : 0;
  const pending = rated.find((x) => x.m.status !== 'green');
  const set = (body) => api('PATCH', `units?code=${encodeURIComponent(u.code)}`, body).then(refresh);
  // new topics re-tag the unit's past-paper questions straight away (by wording, no AI), so Predict can rank them
  const addTopics = async (names) => {
    for (const name of names) await api('POST', 'topics', { unit: u.code, name });
    await api('POST', 'predict/parse', { unit: u.code }).catch(() => {});
    refresh();
  };
  const addTopic = async (e) => {
    e.preventDefault();
    await addTopics(topic.split(',').map((x) => x.trim()).filter(Boolean));
    setTopic('');
  };
  const suggest = async () => {
    setBusy(true); setError('');
    try { setIdeas(await api('POST', 'topics/suggest', { unit: u.code })); } catch (x) { setError(x.message); }
    setBusy(false);
  };
  const addIdeas = async (list) => {
    await addTopics(list.map((i) => i.name));
    setIdeas((x) => ({ ...x, suggestions: x.suggestions.filter((i) => !list.includes(i)) }));
  };
  const shown = rated.find((x) => x.t.id === chip);
  return (
    <article className="unit">
      <header>
        <div><span className="code">{u.code}</span> <span className="title">{u.title}</span></div>
        <div className="meta">
          <label>CAT/exam <input type="date" value={tba ? '' : u.catDate || ''} disabled={tba} onChange={(e) => set({ catDate: e.target.value || null })} /></label>
          <label className="small"><input type="checkbox" checked={tba} onChange={(e) => set({ catDate: e.target.checked ? 'TBA' : null })} /> TBA</label>
          {tba ? <span className="when">TBA</span> : cat && (
            <span className={`when ${daysUntil(s.today, cat) <= 3 ? 'hot' : ''}`} title={u.catDate ? '' : 'No date set: using the KU calendar'}>
              {Math.max(0, daysUntil(s.today, cat))}d{u.catDate ? '' : ' (KU calendar)'}
            </span>
          )}
          <select value={u.stage || ''} onChange={(e) => set({ stage: e.target.value || null })} aria-label={`${u.code} study stage`}>
            <option value="">Stage: auto ({auto})</option>
            {s.stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
          <span className="conf" title="How ready do you feel?">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`confidence ${n}`} className={n <= (u.confidence || 0) ? 'on' : ''} onClick={() => set({ confidence: n })} />)}
          </span>
        </div>
      </header>
      <div className="topics">
        {rated.map(({ t, m }) => (
          <span key={t.id} className={`chip ${m.status}`}>
            <button onClick={() => setChip(chip === t.id ? null : t.id)} aria-expanded={chip === t.id}>
              {t.name}{t.taughtAt ? ' ✓' : ''}{m.manual ? ' · you' : ''}
            </button>
            <button className="x" aria-label={`remove ${t.name}`} onClick={() => api('DELETE', `topics/${t.id}`).then(() => { notify(`Removed "${t.name}"`, () => api('POST', 'topics', t)); refresh(); })}>×</button>
          </span>
        ))}
        <form onSubmit={addTopic}><input data-tour="topics" placeholder={topics.length ? 'Add topic' : 'CAT topics, comma separated'} aria-label={`Add topics to ${u.code}, comma separated`} value={topic} onChange={(e) => setTopic(e.target.value)} /></form>
        {s.ai && <button className="ghost small" onClick={suggest} disabled={busy}><Busy on={busy} label="Reading your outline and papers…" idle="Suggest topics" /></button>}
      </div>
      {shown && (
        <div className="chippanel small" role="region" aria-label={`Why ${shown.t.name} is ${shown.m.status}`}>
          <p><b>{shown.t.name}</b> is <span className={shown.m.status === 'green' ? 'ok' : shown.m.status === 'amber' ? 'warm' : 'hot'}>{shown.m.status}</span>{shown.m.why ? `: ${shown.m.why}` : ''}.</p>
          {shown.m.layers && shown.m.tried && (
            <div className="layers" role="img" aria-label={LAYER.map(([l, name]) => `${name} ${Math.round(shown.m.layers[l].p * 100)}`).join(', ')}>
              {LAYER.map(([l, name]) => (
                <div key={l} className={`layer${shown.m.bottleneck === l && shown.m.status !== 'green' ? ' weak' : ''}`}>
                  <span>{name}</span>
                  <span className="lbar" title="bar: best estimate · line: what it is surely above"><i style={{ width: `${shown.m.layers[l].p * 100}%` }} /><b style={{ left: `${shown.m.layers[l].lo * 100}%` }} /></span>
                  <span className="num">{Math.round(shown.m.layers[l].p * 100)}</span>
                </div>
              ))}
            </div>
          )}
          {shown.m.lastsDays && <p className="muted">Lasts about {shown.m.lastsDays} days without practice.</p>}
          {!shown.m.manual && shown.m.next && <p>Next: {shown.m.next}.</p>}
          <div className="row wrap">
            <label>Colour{' '}
              <select value={shown.t.manual || ''} onChange={(e) => api('PATCH', `topics/${shown.t.id}`, { manual: e.target.value || null }).then(refresh)}>
                <option value="">From the evidence (recommended)</option>
                <option value="green">Green: I can teach it</option>
                <option value="amber">Amber: getting there</option>
                <option value="red">Red: not yet</option>
              </select>
            </label>
            <button className="link small" onClick={() => go('teach', { unit: u.code, topic: shown.t.name })}>teach it back</button>
            <button className="link small" onClick={() => setChip(null)}>close</button>
          </div>
        </div>
      )}
      {error && <p className="hot small" role="alert">{error}</p>}
      {ideas && (
        <div className="suggest" aria-label={`Suggested topics for ${u.code}`}>
          {ideas.suggestions.length
            ? ideas.suggestions.map((i) => <button key={i.name} className="ghost small" onClick={() => addIdeas([i])}>+ {i.name} <span className="muted">({FROM[i.from] || i.from})</span></button>)
            : <span className="muted small">Nothing new to suggest.</span>}
          {ideas.suggestions.length > 1 && <button className="link small" onClick={() => addIdeas(ideas.suggestions)}>add all</button>}
          <p className="muted small">
            {ideas.sources.length ? `Read: ${ideas.sources.join(', ')}.` : 'Nothing is synced for this unit, so these are general guesses from its title. Sync its files for topics from your own outline.'}
            {' '}AI suggestions can be off: keep only what your course actually covers.
          </p>
        </div>
      )}
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
      {pending && <p className="muted small next">Next to turn green: <b>{pending.t.name}</b>. {pending.m.next}.</p>}
      <div className="row small">
        <button className="link" onClick={() => go('mock', { unit: u.code })}>timed mock</button>
        <button className="link" onClick={() => go('prompt', { unit: u.code })}>prompt pack</button>
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
  // units still counting down to the KU calendar (no date of their own, not TBA)
  const undated = s.data.units.filter((u) => !u.catDate);
  const allTba = () => markUndatedTba(s.data.units).then(props.refresh);
  return (
    <section id="units" className="reveal" data-tour="units">
      <div className="head"><h2>Units</h2>{!picking && <button className="ghost" onClick={() => setPicking(true)}>Edit units</button>}</div>
      {picking ? <Picker {...props} close={() => setPicking(false)} /> : (
        <>
          <div className="row wrap">
            <SyncAll s={s} />
            {undated.length > 0 && (
              <button className="link small" onClick={allTba} title="CAT and exam dates are uncertain (the strike): stop counting down to the KU calendar">
                Mark {undated.length} calendar date{undated.length === 1 ? '' : 's'} TBA
              </button>
            )}
          </div>
          <p className="muted small">A topic's colour follows the evidence (a teach-back scored 4/5+ and 2 exam questions solved at 70%+), not a tick. Click a chip to see why it has its colour and what's missing; you can override the colour there (it then shows "· you"). ✓ means you've done a teach-back.</p>
          <div className="unitgrid">{s.data.units.map((u) => <Unit key={u.code} u={u} {...props} />)}</div>
        </>
      )}
    </section>
  );
}
