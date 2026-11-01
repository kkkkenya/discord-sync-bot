import { useEffect, useState } from 'react';
import { api } from './api.js';
import Busy from './Busy.jsx';
import Rich from './Rich.jsx';

// Study kit (Phase 10): practice material made for how close the unit's paper is. Adequate Prep gets a ladder (a worked
// example, the same method with steps to fill in, then one to solve alone), 1-Week Mode gets solving recipes for the
// likely topics, Last-Minute and Exam-Eve get a one-page formula and shortcut sheet with your own traps on it.
// Everything made is saved, can be edited in place, and prints.

// a copy of obj with the value at path ['faded', 'steps', 2, 'text'] replaced
const setIn = (obj, [k, ...rest], value) => {
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  copy[k] = rest.length ? setIn(obj[k], rest, value) : value;
  return copy;
};

// text you can correct in place while editing (saved when you click away)
// text you can correct in place while editing (saved when you click away); typeset maths when not editing
function Field({ value, path, edit, save, as: Tag = 'span', className = '' }) {
  if (!edit) return <Tag className={`kfield ${className}`}><Rich text={value} as="span" /></Tag>;
  return (
    <Tag className={`kfield ${className}`} contentEditable={edit} suppressContentEditableWarning spellCheck={false}
      onBlur={(e) => { const v = e.currentTarget.innerText.trim(); if (edit && v !== value) save(path, v); }}>{value}</Tag>
  );
}

function Ladder({ c, edit, save, reveal }) {
  const f = (path, as, className) => <Field value={path.reduce((o, k) => o?.[k], c) || ''} path={path} edit={edit} save={save} as={as} className={className} />;
  return (
    <>
      <h4>1 · Worked example</h4>
      {f(['worked', 'problem'], 'p')}
      <ol>{c.worked.steps.map((_, i) => <li key={i}>{f(['worked', 'steps', i])}</li>)}</ol>
      <p><b>Answer:</b> {f(['worked', 'answer'])}</p>
      <h4>2 · Your turn, with help</h4>
      {f(['faded', 'problem'], 'p')}
      <ol>{c.faded.steps.map((st, i) => <li key={i} className={st.blank && !reveal ? 'blank' : ''}>{st.blank && !reveal ? <>{f(['faded', 'steps', i, 'hint'])} <span className="gap">fill this in</span></> : f(['faded', 'steps', i, 'text'])}</li>)}</ol>
      {reveal && <p><b>Answer:</b> {f(['faded', 'answer'])}</p>}
      <h4>3 · On your own</h4>
      {f(['solo', 'problem'], 'p')}
      {reveal && <p><b>Answer:</b> {f(['solo', 'answer'])}</p>}
      <h4>Teach it back</h4>
      <ul>{c.teachPrompts.map((_, i) => <li key={i}>{f(['teachPrompts', i])}</li>)}</ul>
    </>
  );
}

function Recipes({ c, edit, save, reveal }) {
  return c.recipes.map((r, i) => {
    const f = (k, as) => <Field value={r[k]} path={['recipes', i, k]} edit={edit} save={save} as={as} />;
    return (
      <div key={i} className="recipe">
        <h4>{f('name')}</h4>
        <p className="small"><b>Spot it:</b> {f('when')}</p>
        <ol>{r.steps.map((_, j) => <li key={j}><Field value={r.steps[j]} path={['recipes', i, 'steps', j]} edit={edit} save={save} /></li>)}</ol>
        <p className="small"><b>Shortcut:</b> {f('shortcut')}</p>
        <p className="small warm"><b>Trap:</b> {f('trap')}</p>
        {reveal !== null && <p className="small"><b>Try it:</b> {f('tryIt')}</p>}
      </div>
    );
  });
}

function Sheet({ c, edit, save }) {
  const list = (key, label) => c[key].length > 0 && (
    <div><h4>{label}</h4><ul>{c[key].map((_, i) => <li key={i}><Field value={c[key][i]} path={[key, i]} edit={edit} save={save} /></li>)}</ul></div>
  );
  return (
    <>
      <table className="formulas">
        <thead><tr><th>Formula</th><th>Symbols and units</th><th>Not when</th></tr></thead>
        <tbody>
          {c.formulas.map((fm, i) => (
            <tr key={i}>
              <td><b><Field value={fm.name} path={['formulas', i, 'name']} edit={edit} save={save} /></b><br /><Field value={fm.formula} path={['formulas', i, 'formula']} edit={edit} save={save} className="eq" /></td>
              <td><Field value={fm.symbols} path={['formulas', i, 'symbols']} edit={edit} save={save} /></td>
              <td><Field value={fm.notWhen} path={['formulas', i, 'notWhen']} edit={edit} save={save} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sheetcols">{list('traps', 'Your traps')}{list('conventions', 'Conventions and unit checks')}{list('shortcuts', 'Shortcuts')}</div>
    </>
  );
}

const BODY = { ladder: Ladder, recipes: Recipes, sheet: Sheet };

// Print one kit on its own page: a clean copy in a new window, A4, so nothing else on the dashboard prints.
function printKit(id) {
  const el = document.getElementById(`kitdoc-${id}`);
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!el || !w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${el.dataset.title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>@page{size:A4;margin:9mm}*{box-sizing:border-box}body{margin:0;font:8.6pt/1.3 'IBM Plex Sans',sans-serif;color:#000}
h3{font:700 13pt 'IBM Plex Sans Condensed',sans-serif;margin:0 0 4px}h4{font:600 9.5pt 'IBM Plex Sans Condensed',sans-serif;margin:6px 0 2px}
p{margin:2px 0}ol,ul{margin:2px 0;padding-left:16px}li{margin:1px 0}.eyebrow{font:600 7pt 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:#444}
table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:2px 4px;border-bottom:.5pt solid #999}th{font:600 7pt 'IBM Plex Mono',monospace;text-transform:uppercase}
.eq{font-family:'IBM Plex Mono',monospace}.sheetcols{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.recipe{break-inside:avoid;border-top:.5pt solid #999;padding-top:3px}
.recipes-body{columns:2;column-gap:12px}.gap{border-bottom:1px solid #000;display:inline-block;min-width:120px;color:transparent}.warm{color:#000}.kit-tools{display:none}</style>
</head><body>${el.outerHTML}<script>document.fonts.ready.then(()=>{print();});<\/script></body></html>`);
  w.document.close();
}

export default function Kit({ s, unit, refresh, go, focus, notify }) {
  const stage = s.units?.[unit]?.stage;
  const own = s.kits.forStage[stage?.id] || 'ladder';
  const [kind, setKind] = useState('');
  const [topicId, setTopicId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [need, setNeed] = useState(null); // { goal, message } when there is no AI key
  const [openId, setOpenId] = useState(null);
  const [edit, setEdit] = useState(false);
  const [reveal, setReveal] = useState(false);
  useEffect(() => { if (focus?.section === 'kit') { setKind(focus.kit || ''); setTopicId(focus.topicId || ''); } }, [focus]);
  useEffect(() => { setTopicId(''); setNeed(null); setErr(''); }, [unit]);

  const k = kind || own;
  const topics = s.data.topics.filter((t) => t.unit === unit);
  const mine = s.data.materials.filter((m) => m.unit === unit).sort((a, b) => b.at.localeCompare(a.at));
  const shown = mine.find((m) => m.id === openId) || mine[0];
  const topicName = (id) => s.data.topics.find((t) => t.id === id)?.name;
  const what = own === 'sheet' ? 'a one-page formula and trap sheet' : own === 'recipes' ? 'solving recipes for the likely topics' : 'a ladder: a worked example, the same method with gaps, then one on your own';

  const make = async (fresh = false) => {
    setBusy(true); setErr(''); setNeed(null);
    try {
      const out = await api('POST', 'materials/make', { unit, kind: k, topicId: k === 'ladder' && topicId ? topicId : undefined, fresh });
      if (out.needKey) setNeed(out); else { setOpenId(out.id); setEdit(false); setReveal(false); await refresh(); }
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const save = (m) => (path, value) => api('PATCH', `materials/${m.id}`, { content: setIn(m.content, path, value), edited: true }).then(refresh);
  const del = (m) => api('DELETE', `materials/${m.id}`).then(() => { notify(`Deleted the ${s.kits.names[m.kind].name.toLowerCase()}`, () => api('POST', 'materials', m)); setOpenId(null); refresh(); });

  const Body = shown && BODY[shown.kind];
  return (
    <div className="stack">
      <section id="kit" className="card stack kit-make" aria-labelledby="kit-title">
        <div className="card-head">
          <h2 className="card-title" id="kit-title">Make a sheet</h2>
          {stage && <span className={`chip ${stage.id}`}>{stage.name}</span>}
        </div>
        <p className="muted small">{stage ? `${stage.name} gets ` : 'This stage gets '}{what}. Everything you make is saved here, can be edited, and prints.</p>
        <div className="pair">
          <label className="field">Kind
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{s.kits.names[own].name} (for {stage?.name || 'this stage'})</option>
              {Object.entries(s.kits.names).filter(([id]) => id !== own).map(([id, x]) => <option key={id} value={id}>{x.name}</option>)}
            </select>
          </label>
          {k === 'ladder' && (
            <label className="field">Topic
              <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                <option value="">Your top weakspot</option>
                {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="toolbar"><button className="btn primary" type="button" onClick={() => make()} disabled={busy || !unit}><Busy on={busy} label="Making it…" idle="Make it" /></button></div>
        {err && <p className="notice bad" role="alert">{err}</p>}
        {need && (
          <p className="notice" role="status">{need.message}{' '}
            <button type="button" className="btn plain" onClick={() => go('prompt', { unit, goal: need.goal })}>Go deeper</button>
          </p>
        )}
      </section>

      {mine.length > 1 && (
        <div className="chips kit-tabs" role="tablist" aria-label="Saved sheets">
          {mine.slice(0, 8).map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={m.id === shown?.id} aria-pressed={m.id === shown?.id} className="chip" onClick={() => { setOpenId(m.id); setEdit(false); setReveal(false); }}>
              {s.kits.names[m.kind].name.split(' ')[0]}{m.topicId ? `: ${topicName(m.topicId) || ''}` : ''} · <span className="num">{m.at.slice(5, 10)}</span>
            </button>
          ))}
        </div>
      )}

      {shown && (
        <article className={`card kitdoc ${shown.kind}`} id={`kitdoc-${shown.id}`} data-title={`${unit} ${s.kits.names[shown.kind].name}`}>
          <p className="eyebrow num">{unit} · {s.kits.names[shown.kind].name}{shown.topicId ? ` · ${topicName(shown.topicId) || ''}` : ''} · {shown.at.slice(0, 10)}{shown.edited ? ' · edited' : ''}{shown.shared ? ' · from your class' : ''}</p>
          {shown.content.title && <h3><Field value={shown.content.title} path={['title']} edit={edit} save={save(shown)} /></h3>}
          <div className="kit-tools toolbar">
            {shown.kind !== 'sheet' && <button type="button" className="btn" onClick={() => setReveal(!reveal)}>{reveal ? 'Hide answers' : 'Show answers'}</button>}
            <button type="button" className="btn" onClick={() => setEdit(!edit)} aria-pressed={edit}>{edit ? 'Done editing' : 'Edit'}</button>
            <button type="button" className="btn" onClick={() => printKit(shown.id)}>{shown.kind === 'sheet' ? 'Print on one page' : 'Print'}</button>
            {shown.shared && <button type="button" className="btn plain" disabled={busy} onClick={() => make(true)}>Make a fresh one</button>}
            <button type="button" className="btn plain" onClick={() => del(shown)}>Delete</button>
          </div>
          {edit && <p className="muted small kit-tools">Tap any text to correct it. It saves when you tap away.</p>}
          <div className={`${shown.kind}-body`}><Body c={shown.content} edit={edit} save={save(shown)} reveal={reveal} /></div>
        </article>
      )}
      {!shown && !need && <p className="muted small">Nothing made for {unit} yet.</p>}
    </div>
  );
}
