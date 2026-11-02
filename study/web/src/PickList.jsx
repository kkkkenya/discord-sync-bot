// A list of things to tick (questions, files), each with a note on the right, plus All / None.
// items [{ id, label, meta?, sub?, disabled? }], picked: a Set of ids, set(nextSet).
export default function PickList({ items, picked, set, label, max }) {
  const open = items.filter((x) => !x.disabled);
  const toggle = (id) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else if (!max || next.size < max) next.add(id);
    set(next);
  };
  return (
    <div className="picklist" role="group" aria-label={label}>
      <div className="picklist-bar">
        <span className="muted small num">{picked.size} of {open.length} picked{max ? ` (up to ${max})` : ''}</span>
        <span>
          <button type="button" className="btn plain" onClick={() => set(new Set(open.slice(0, max || open.length).map((x) => x.id)))}>All</button>
          <button type="button" className="btn plain" onClick={() => set(new Set())}>None</button>
        </span>
      </div>
      <ul>
        {items.map((x) => (
          <li key={x.id}>
            <label className={`pick${x.disabled ? ' is-off' : ''}`}>
              <input type="checkbox" checked={picked.has(x.id)} disabled={x.disabled} onChange={() => toggle(x.id)} />
              <span className="pick-main">
                <span className="pick-label">{x.label}</span>
                {x.sub && <span className="muted small pick-sub">{x.sub}</span>}
              </span>
              {x.meta && <span className="chip num pick-meta">{x.meta}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 1536000 → "1.5 MB"; 82000 → "80 KB"
export const fileSize = (b) => (!b ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const tokensLabel = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k tokens` : `${n} tokens`);
