import { useEffect, useState } from 'react';
import { api, prepareUnit } from './api.js';
import Notes from './Notes.jsx';

const status = (f) => (f.chars > 0 ? ['good', 'Read'] : f.synced ? ['warn', 'No text'] : [null, 'Not read']);

// The unit's files from the hub: what Crux has read, a link to each in Discord, and Prepare to read the rest.
export default function UnitNotes(props) {
  const { unit } = props;
  const [lib, setLib] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } while reading
  const [problem, setProblem] = useState('');
  const load = () => api('GET', `library?unit=${encodeURIComponent(unit)}`).then(setLib).catch((e) => setProblem(e.message));
  useEffect(() => { load(); }, [unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const prepare = async () => {
    setBusy(true); setProblem('');
    try {
      const r = await prepareUnit(unit, (x) => setProgress(x.total ? { done: x.done, total: x.total } : null));
      if (r.note) setProblem(r.note);
      await load();
      await props.refresh();
    } catch (e) { setProblem(e.message); }
    setBusy(false); setProgress(null);
  };

  const files = lib?.files || [];
  const unread = files.filter((f) => !f.synced).length;
  return (
    <>
      {problem && <p className="notice bad" role="alert">{problem}</p>}
      <div className="card">
        <div className="card-head">
          <span className="row-main"><h2>Hub files</h2><span className="row-sub">{lib ? `${files.length - unread} of ${files.length} read` : 'Loading…'}</span></span>
          <button className="btn primary" onClick={prepare} disabled={busy || !lib || !files.length}>{busy ? (progress ? `${progress.done} of ${progress.total} read` : 'Reading…') : unread ? 'Prepare' : 'Check again'}</button>
        </div>
        {busy && <div className="progress" aria-hidden="true"><span style={{ width: `${progress ? (100 * progress.done) / progress.total : 5}%` }} /></div>}
        {lib?.note && <p className="row-sub">{lib.note}</p>}
      </div>
      {files.length > 0 && (
        <div className="list">
          {files.map((f) => {
            const [tone, label] = status(f);
            return (
              <div key={f.id} className="list-row">
                <span className="row-main"><span className="filename">{f.name}</span><span className="row-sub">{f.paper ? 'Paper' : 'Notes'}{f.pages ? ` · ${f.pages} pages` : ''}</span></span>
                <span className={`chip ${tone || ''}`}>{label}</span>
                {f.url && <a className="btn" href={f.url} target="_blank" rel="noreferrer">Open in Discord</a>}
              </div>
            );
          })}
        </div>
      )}
      <div className="legacy"><Notes {...props} /></div>
    </>
  );
}
