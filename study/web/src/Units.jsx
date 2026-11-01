import { useEffect, useState } from 'react';
import { api, markUndatedTba, prepareUnit } from './api.js';
import { Icon } from './icons.jsx';
import { href, unitSlug } from './route.js';

const YEARS = [1, 2, 3, 4, 5];
const daysText = (d) => (d == null ? 'No date' : d < 0 ? 'Passed' : d === 0 ? 'Today' : `${d} day${d === 1 ? '' : 's'}`);

// "Edit units": Course → Year → Semester loads that cohort's units from the Study Hub catalogue. The Hub doesn't
// record semesters, so the whole year is listed: untick what you aren't sitting. Units you already picked from
// elsewhere (retakes, electives) stay ticked under their own heading; nothing is dropped unless you untick it.
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
  if (!cat) return status ? <p className="notice bad" role="alert">{status}</p> : <div className="skeleton" style={{ height: 240 }} />;

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
    <label key={u.code} className="list-row check-row">
      <input type="checkbox" checked={picked.has(u.code)} onChange={() => toggle(u.code)} />
      <span className="row-main"><b className="num">{u.code}</b><span className="row-sub">{u.title || 'No title in the Hub yet'}</span></span>
    </label>
  );
  const group = (title, list, bulk) => list.length > 0 && (
    <div className="stack-s">
      <div className="card-head">
        <h3 className="sub-title">{title}</h3>
        {bulk && <span className="toolbar"><button type="button" className="btn plain" onClick={() => tickAll(list, true)}>Tick all</button><button type="button" className="btn plain" onClick={() => tickAll(list, false)}>None</button></span>}
      </div>
      <div className="list flat">{list.map(item)}</div>
    </div>
  );

  return (
    <section className="card stack" aria-labelledby="picker-title">
      <h2 className="card-title" id="picker-title">Your units</h2>
      <div className="pair">
        <label className="field">Course
          <select value={cohort.course} onChange={(e) => set('course', e.target.value)}>
            {cat.courses.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
          </select>
        </label>
        <label className="field">Year
          <select value={cohort.year} onChange={(e) => set('year', Number(e.target.value))}>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </label>
        <label className="field">Semester
          <select value={cohort.sem} onChange={(e) => set('sem', Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option></select>
        </label>
        <label className="field">Study stage
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">Automatic, from each unit's date</option>
            {s.stages.map((st) => <option key={st.id} value={st.id}>{st.name} ({st.window})</option>)}
          </select>
        </label>
      </div>
      <p className="muted small">
        {courseName} {cohort.year}.{cohort.sem}: <span className="num">{cat.core.length}</span> unit{cat.core.length === 1 ? '' : 's'} from the Study Hub{cat.shared.length ? `, plus ${cat.shared.length} shared` : ''}.
        The Hub doesn't know each unit's semester yet, so the whole year is listed. Tick the ones you're sitting.
      </p>
      {cat.core.length > 0 ? group('Your course', cat.core, true) : <p className="muted small">No {cohort.course} year {cohort.year} units in the Study Hub yet. Search below to add yours.</p>}
      {group('Shared units', cat.shared)}
      {group('Retakes and electives', others.map((code) => ({ code, title: titles.get(code) })))}
      <label className="field">Add a retake or elective
        <input type="search" placeholder="Search by code or title" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {found.length > 0 && <div className="list flat">{found.map((u) => item({ code: inCohort.has(u.code) ? u.code : (u.codes.find((c) => c.startsWith(cohort.course)) || u.code), title: u.title }))}</div>}
      <div className="toolbar">
        <button type="button" className="btn primary" onClick={saveIt} disabled={status === 'Saving…'}>Save <span className="num">{picked.size}</span> unit{picked.size === 1 ? '' : 's'}</button>
        {s.data.units.length > 0 && <button type="button" className="btn" onClick={close}>Cancel</button>}
        {status && <span className={status === 'Saving…' ? 'muted small' : 'bad-text small'} role="status">{status}</span>}
      </div>
    </section>
  );
}

// Read every unit's hub files in one go, one unit at a time, with a running summary.
function ReadAll({ s }) {
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState([]);
  const run = async () => {
    setBusy(true);
    const out = [];
    for (const [i, u] of s.data.units.entries()) {
      setLines([...out, `Reading ${u.code} (${i + 1} of ${s.data.units.length})…`]);
      try {
        const r = await prepareUnit(u.code, (p) => setLines([...out, `Reading ${u.code} (${i + 1} of ${s.data.units.length}): ${p.done ?? 0} of ${p.total ?? '?'} files`]));
        if (r.note) { out.push(`${u.code}: ${r.note}`); continue; }
        const text = r.files.filter((f) => f.chars > 0).length;
        const failed = r.files.filter((f) => f.error && !/scanned/.test(f.error)).length;
        out.push(`${u.code}: ${r.files.length} file${r.files.length === 1 ? '' : 's'}, ${text} with text${r.files.length - text - failed ? `, ${r.files.length - text - failed} scanned` : ''}${failed ? `, ${failed} failed` : ''}${r.parsed?.questions ? `, ${r.parsed.questions} past-paper question${r.parsed.questions === 1 ? '' : 's'}` : ''}`);
      } catch (e) { out.push(`${u.code}: ${e.message}`); }
    }
    setLines(out);
    setBusy(false);
  };
  return (
    <>
      <button type="button" className="btn" onClick={run} disabled={busy || !s.data.units.length}>{busy ? 'Reading…' : 'Read all files'}</button>
      {lines.length > 0 && <ul className="plain-list muted small readlog" role="status">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
    </>
  );
}

// One unit: a row that opens the unit, and a pencil that opens its date and stage.
function UnitRow({ u, s, refresh }) {
  const [open, setOpen] = useState(false);
  const tba = u.catDate === 'TBA';
  const info = s.units[u.code] || {};
  const st = info.stage;
  const auto = st && st.source !== 'unit' ? st.name : s.stages.find((x) => x.id === (s.settings.stage || 'adequate'))?.name;
  const topics = s.data.topics.filter((t) => t.unit === u.code);
  const solid = topics.filter((t) => s.mastery?.[t.id]?.status === 'green').length;
  const set = (body) => api('PATCH', `units?code=${encodeURIComponent(u.code)}`, body).then(refresh);
  const id = u.code.replace(/\W+/g, '-');
  return (
    <div className="urow">
      <div className="urow-line">
        <a className="urow-main" href={href('unit', unitSlug(u.code), 'topics')}>
          <span className={`dot ${st?.id || ''}`} aria-hidden="true" />
          <span className="row-main"><b className="num">{u.code}</b><span className="row-sub">{u.title}</span></span>
          {topics.length
            ? <span className="meter-wrap" title={`${solid} of ${topics.length} topics solid`}><span className="meter"><span style={{ width: `${Math.round((solid / topics.length) * 100)}%` }} /></span><span className="row-sub num">{solid}/{topics.length}</span></span>
            : <span className="meter-wrap row-sub">No topics</span>}
          <span className={`chip num ${st?.id || ''}`} title={u.catDate ? undefined : 'From the KU calendar'}>{tba ? 'TBA' : daysText(info.days)}</span>
        </a>
        <button type="button" className="iconbtn" aria-expanded={open} aria-controls={`edit-${id}`} aria-label={`${u.code} date and stage`} onClick={() => setOpen(!open)}><Icon name="edit" /></button>
      </div>
      {open && (
        <div className="urow-edit" id={`edit-${id}`}>
          <label className="field">CAT or exam date
            <input type="date" value={tba ? '' : u.catDate || ''} disabled={tba} onChange={(e) => set({ catDate: e.target.value || null })} />
          </label>
          <label className="field">Study stage
            <select value={u.stage || ''} onChange={(e) => set({ stage: e.target.value || null })}>
              <option value="">Automatic ({auto})</option>
              {s.stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={tba} onChange={(e) => set({ catDate: e.target.checked ? 'TBA' : null })} /> Date not announced</label>
          <a className="btn plain" href={href('unit', unitSlug(u.code), 'notes')}>Files and notes</a>
        </div>
      )}
    </div>
  );
}

// Units: every unit grouped by when its paper is. Topics, files and practice live on each unit's own page.
export default function Units(props) {
  const { s } = props;
  const [picking, setPicking] = useState(!s.data.units.length);
  const undated = s.data.units.filter((u) => !u.catDate); // still counting down to the KU calendar
  const allTba = () => markUndatedTba(s.data.units).then(props.refresh);
  const withDays = s.data.units.map((u) => ({ u, d: u.catDate === 'TBA' ? null : s.units[u.code]?.days })).sort((a, b) => (a.d ?? 999) - (b.d ?? 999));
  const groups = [
    ['This week', withDays.filter((x) => x.d != null && x.d >= 0 && x.d <= 7)],
    ['Later', withDays.filter((x) => x.d != null && x.d > 7)],
    ['Date not announced', withDays.filter((x) => x.d == null)],
    ['Already sat', withDays.filter((x) => x.d != null && x.d < 0)],
  ].filter(([, list]) => list.length);
  const next = withDays.find((x) => x.d != null && x.d >= 0);
  return (
    <>
      <header className="page-head units-head">
        <div>
          <h1>Units</h1>
          <p><span className="num">{s.data.units.length}</span> units{next ? <>. Next paper: <b className="num">{next.u.code}</b>, {next.d === 0 ? 'today' : <>in <span className="num">{daysText(next.d).toLowerCase()}</span></>}</> : ''}</p>
        </div>
        {!picking && <button type="button" className="btn" onClick={() => setPicking(true)}>Edit units</button>}
      </header>
      {picking ? <Picker {...props} close={() => setPicking(false)} /> : (
        <>
          <div className="toolbar">
            <ReadAll s={s} />
            {undated.length > 0 && <button type="button" className="btn plain" onClick={allTba}>Mark {undated.length} calendar date{undated.length === 1 ? '' : 's'} TBA</button>}
          </div>
          {groups.map(([title, list]) => (
            <div key={title}>
              <h2 className="list-title">{title}</h2>
              <div className="list">{list.map(({ u }) => <UnitRow key={u.code} u={u} {...props} />)}</div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
