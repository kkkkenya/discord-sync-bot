import { useEffect, useState } from 'react';
import { api } from './api.js';
import OpenAt from './OpenAt.jsx';

const KEY = 'crux-schemes-asked';
const stem = (name) => String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' ').trim();
const askedList = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

// A unit's marking schemes, each beside the paper it marks, and the papers that have none yet (server/schemes.js).
// Opening a scheme never uses a daily download.
export default function UnitSchemes({ unit, notify }) {
  const [list, setList] = useState(null);
  const [problem, setProblem] = useState('');
  const [asked, setAsked] = useState(askedList);
  const [asking, setAsking] = useState('');
  useEffect(() => {
    setList(null); setProblem('');
    api('GET', `schemes?unit=${encodeURIComponent(unit)}`).then(setList).catch((e) => setProblem(e.message));
  }, [unit]);
  const ask = async (p) => {
    setAsking(p.id); setProblem('');
    try {
      await api('POST', 'schemes/ask', { unit, paperId: p.id });
      const next = [...new Set([...askedList(), `${unit}|${p.id}`])].slice(-200);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not kept on this device */ }
      setAsked(next);
      notify?.('Asked. It shows here when the scheme is on the hub.');
    } catch (e) { setProblem(e.message); }
    setAsking('');
  };

  if (!list) return problem ? <p className="notice bad" role="alert">{problem}</p> : <div className="skeleton" style={{ height: 160 }} />;
  return (
    <>
      {problem && <p className="notice bad" role="alert">{problem}</p>}
      <div>
        <h2 className="list-title">Marking schemes</h2>
        {!list.schemes.length ? (
          <div className="card"><p className="row-sub">No marking schemes for {unit} on the hub yet. Ask for one below.</p></div>
        ) : (
          <div className="list">
            {list.schemes.map((s) => (
              <div key={s.id} className="list-row">
                <span className="row-main"><span className="filename">{stem(s.name)}</span>{s.paper && <span className="row-sub">For {stem(s.paper)}</span>}</span>
                <OpenAt fileId={s.id} label="Open" />
              </div>
            ))}
          </div>
        )}
      </div>
      {list.missing.length > 0 && (
        <div>
          <h2 className="list-title">Papers without a scheme yet</h2>
          <div className="list">
            {list.missing.map((p) => {
              const done = asked.includes(`${unit}|${p.id}`);
              return (
                <div key={p.id} className="list-row">
                  <span className="row-main"><span className="filename">{stem(p.name)}</span></span>
                  <OpenAt fileId={p.id} label="Paper" />
                  <button type="button" className="btn" disabled={done || asking === p.id} onClick={() => ask(p)}>{done ? 'Asked' : asking === p.id ? 'Asking…' : 'Ask for the scheme'}</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {list.note && <p className="row-sub">{list.note}</p>}
    </>
  );
}
