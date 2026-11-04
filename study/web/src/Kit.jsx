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
  if (!edit) return <Rich text={value} as={Tag === 'span' ? 'span' : 'div'} className={`kfield ${className}`} />;
  return (
    <Tag className={`kfield ${className}`} contentEditable={edit} suppressContentEditableWarning spellCheck={false}
      onBlur={(e) => { const v = e.currentTarget.innerText.trim(); if (edit && v !== value) save(path, v); }}>{value}</Tag>
  );
}

// A hidden answer or step: tap to show it, tap again to hide. Always open while editing or with "Show all answers".
function Reveal({ label = 'Show answer', open, children }) {
  const [shown, setShown] = useState(false);
  if (open || shown) {
    return (
      <div className="reveal">
        {children}
        {!open && <button type="button" className="btn plain reveal-hide" onClick={() => setShown(false)}>Hide</button>}
      </div>
    );
  }
  return <button type="button" className="reveal-btn" onClick={() => setShown(true)}>{label}</button>;
}

// a problem in its own box and an answer in its own box, editable in place
const Problem = ({ children, label = 'Problem' }) => <div className="qbox"><span className="qbox-label">{label}</span>{children}</div>;
const Answer = ({ children, label = 'Answer' }) => <div className="abox key"><span className="qbox-label">{label}</span>{children}</div>;
const Part = ({ n, title, children }) => <section className="kit-part"><p className="kit-n num">Part {n}</p><h4>{title}</h4>{children}</section>;

function Ladder({ c, edit, save, reveal }) {
  const f = (path, as = 'div', className) => <Field value={path.reduce((o, k) => o?.[k], c) || ''} path={path} edit={edit} save={save} as={as} className={className} />;
  const open = reveal || edit;
  return (
    <>
      <Part n={1} title="Worked example">
        <Problem>{f(['worked', 'problem'])}</Problem>
        <ol className="kit-steps">{c.worked.steps.map((_, i) => <li key={i}>{f(['worked', 'steps', i])}</li>)}</ol>
        <Answer>{f(['worked', 'answer'])}</Answer>
      </Part>
      <Part n={2} title="Your turn, with help">
        <Problem>{f(['faded', 'problem'])}</Problem>
        <ol className="kit-steps">
          {c.faded.steps.map((st, i) => (
            <li key={i} className={st.blank ? 'blank' : ''}>
              {st.blank ? <>{f(['faded', 'steps', i, 'hint'])}<Reveal label="Show this step" open={open}>{f(['faded', 'steps', i, 'text'])}</Reveal></> : f(['faded', 'steps', i, 'text'])}
            </li>
          ))}
        </ol>
        <Reveal open={open}><Answer>{f(['faded', 'answer'])}</Answer></Reveal>
      </Part>
      <Part n={3} title="On your own">
        <Problem>{f(['solo', 'problem'])}</Problem>
        <Reveal open={open}><Answer>{f(['solo', 'answer'])}</Answer></Reveal>
      </Part>
      <section className="kit-part">
        <h4>Teach it back</h4>
        <ul className="kit-steps">{c.teachPrompts.map((_, i) => <li key={i}>{f(['teachPrompts', i])}</li>)}</ul>
      </section>
    </>
  );
}

function Recipes({ c, edit, save, reveal }) {
  return c.recipes.map((r, i) => {
    const f = (k, as = 'div') => <Field value={r[k]} path={['recipes', i, k]} edit={edit} save={save} as={as} />;
    return (
      <section key={i} className="kit-part recipe">
        <p className="kit-n num">Recipe {i + 1}</p>
        <h4>{f('name', 'span')}</h4>
        <div className="kit-line"><b className="md-label">Spot it:</b> {f('when', 'span')}</div>
        <ol className="kit-steps">{r.steps.map((_, j) => <li key={j}><Field value={r.steps[j]} path={['recipes', i, 'steps', j]} edit={edit} save={save} as="div" /></li>)}</ol>
        <div className="rich"><div className="md-note tip"><b className="md-label">Shortcut:</b> {f('shortcut', 'span')}</div></div>
        <div className="rich"><div className="md-note warn"><b className="md-label">Trap:</b> {f('trap', 'span')}</div></div>
        {r.tryIt && <Problem label="Try it">{f('tryIt')}</Problem>}
      </section>
    );
  });
}

function Sheet({ c, edit, save }) {
  const list = (key, label) => c[key].length > 0 && (
    <div><h4>{label}</h4><ul>{c[key].map((_, i) => <li key={i}><Field value={c[key][i]} path={[key, i]} edit={edit} save={save} /></li>)}</ul></div>
  );
  // by topic (older sheets have none: one group), the question-specific ones after each topic's core ones
  const topics = [...new Set(c.formulas.map((fm) => fm.topic || ''))];
  const row = (fm) => {
    const i = c.formulas.indexOf(fm);
    return (
      <tr key={i} className={fm.special ? 'special' : undefined}>
        <td><b><Field value={fm.name} path={['formulas', i, 'name']} edit={edit} save={save} /></b>{fm.special && <span className="chip warn">Specific questions</span>}<br /><Field value={fm.formula} path={['formulas', i, 'formula']} edit={edit} save={save} className="eq" /></td>
        <td><Field value={fm.symbols} path={['formulas', i, 'symbols']} edit={edit} save={save} /></td>
        <td><Field value={fm.notWhen} path={['formulas', i, 'notWhen']} edit={edit} save={save} />{fm.usedIn?.length > 0 && <p className="used-in small">Used in {fm.usedIn.join(', ')}</p>}</td>
      </tr>
    );
  };
  return (
    <>
      <table className="formulas">
        <thead><tr><th>Formula</th><th>Symbols and units</th><th>Not when · used in</th></tr></thead>
        {topics.map((t) => (
          <tbody key={t}>
            {t && <tr className="formulas-topic"><th colSpan={3}>{t}</th></tr>}
            {c.formulas.filter((fm) => (fm.topic || '') === t).sort((a, b) => Number(Boolean(a.special)) - Number(Boolean(b.special))).map(row)}
          </tbody>
        ))}
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
.eq{font-family:'IBM Plex Mono',monospace}.formulas-topic th{padding-top:5px;font:700 8.5pt 'IBM Plex Sans Condensed',sans-serif;text-transform:none}.used-in{margin:1px 0 0;color:#444;font-size:7pt}.chip{margin-left:4px;font-size:6.5pt;border:.5pt solid #999;border-radius:3px;padding:0 3px}.sheetcols{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.recipe{break-inside:avoid;border-top:.5pt solid #999;padding-top:3px}
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
        <div className="toolbar"><button className="btn primary" type="button" onClick={() => make()} disabled={busy || !unit}><Busy on={busy} kind="kit" idle="Make it" /></button></div>
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
            {shown.kind !== 'sheet' && <button type="button" className="btn" onClick={() => setReveal(!reveal)}>{reveal ? 'Hide all answers' : 'Show all answers'}</button>}
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
