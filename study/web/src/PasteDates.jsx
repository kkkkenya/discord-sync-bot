import { useMemo, useState } from 'react';
import { api } from './api.js';
import { readDates } from './paste-dates.js';

const dateText = (iso) => new Date(`${iso}T12:00:00+03:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' });

// "Paste dates" on Today: a class rep's WhatsApp message in, each unit's next paper date out. Nothing is saved until
// you tick what's right and press Save. One date per unit, the same one the Units page pencil sets.
export default function PasteDates({ s, refresh, notify }) {
  const [text, setText] = useState('');
  const [skip, setSkip] = useState(new Set()); // codes you unticked
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const found = useMemo(() => readDates(text, s.data.units, s.today), [text, s.data.units, s.today]);
  const mine = found.filter((x) => x.mine);
  const others = found.filter((x) => !x.mine);
  const current = Object.fromEntries(s.data.units.map((u) => [u.code, u]));
  const chosen = mine.filter((x) => !skip.has(x.code));
  const save = async () => {
    setBusy(true); setProblem('');
    try {
      for (const x of chosen) await api('PATCH', `units?code=${encodeURIComponent(x.code)}`, { catDate: x.date });
      notify(`${chosen.length} date${chosen.length === 1 ? '' : 's'} saved.`);
      setText(''); setSkip(new Set());
      await refresh();
    } catch (e) { setProblem(e.message); }
    setBusy(false);
  };
  return (
    <details className="card pastedates">
      <summary><b>Paste CAT or exam dates</b> <span className="row-sub">from WhatsApp or any message</span></summary>
      <div className="stack-s">
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message with dates"
          placeholder={'CAT 1 EMM 302 November 16th\nEMM 305 - 18/11\nMetrology CAT on Friday'} />
        {text.trim() && !found.length && <p className="muted small">No unit and date found yet. Write the unit code (EMM 302) or its name, and a date (16/11, 16th Nov, Friday).</p>}
        {mine.length > 0 && (
          <ul className="pd-list">
            {mine.map((x) => {
              const was = current[x.code]?.catDate;
              return (
                <li key={x.code}>
                  <label className="check">
                    <input type="checkbox" checked={!skip.has(x.code)} onChange={() => setSkip((k) => { const n = new Set(k); if (n.has(x.code)) n.delete(x.code); else n.add(x.code); return n; })} />
                    <span className="row-main">
                      <span><b className="num">{x.code}</b> {x.kind && <span className="chip">{x.kind}</span>} <b className="num">{dateText(x.date)}</b></span>
                      <span className="row-sub">{current[x.code]?.title}{was && was !== x.date ? ` · was ${was === 'TBA' ? 'TBA' : dateText(was)}` : ''}{x.date < s.today ? ' · already past' : ''}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {others.length > 0 && <p className="muted small">Not your units, left alone: {others.map((x) => x.code).join(', ')}.</p>}
        {problem && <p className="notice bad" role="alert">{problem}</p>}
        <div className="actions start">
          <button type="button" className="btn primary" disabled={!chosen.length || busy} onClick={save}>{busy ? 'Saving…' : `Save ${chosen.length || ''} date${chosen.length === 1 ? '' : 's'}`}</button>
        </div>
        <p className="muted small">One unit at a time: the pencil next to each unit on the Units page.</p>
      </div>
    </details>
  );
}
