import { useEffect, useState } from 'react';
import { api, prepareUnit } from './api.js';
import AddToHub from './AddToHub.jsx';
import OpenAt from './OpenAt.jsx';

const status = (f) => (f.chars > 0 ? ['good', 'Read'] : f.synced ? ['warn', 'No text'] : [null, 'Not read']);

// The unit's files from the hub: what Crux has read, a link to each in Discord, and Prepare to read the rest.
export default function UnitNotes(props) {
  const { unit } = props;
  const [lib, setLib] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } while reading
  const [problem, setProblem] = useState('');
  const [mine, setMine] = useState([]);
  const [making, setMaking] = useState('');
  const load = () => api('GET', `library?unit=${encodeURIComponent(unit)}`).then(setLib).catch((e) => setProblem(e.message));
  const loadMine = () => api('GET', `notes?unit=${encodeURIComponent(unit)}`).then(setMine).catch(() => setMine([]));
  useEffect(() => { load(); loadMine(); }, [unit, props.s]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dl, setDl] = useState(null); // { used, limit } downloads today; limit null = no limit
  useEffect(() => { api('GET', 'usage').then((u) => setDl(u.download)).catch(() => {}); }, []);
  const download = async (f) => {
    setProblem('');
    try {
      const r = await api('GET', `files/${f.id}/download`);
      window.location.href = r.url;
      if (dl?.limit) setDl({ ...dl, used: dl.limit - r.left });
    } catch (e) {
      setProblem(e.message === 'download-limit' ? "Today's downloads are used. More tomorrow, or open the file in Discord." : e.message);
    }
  };
  const remove = (n) => api('DELETE', `notes/${n.id}`).then(loadMine).catch((e) => setProblem(e.message));
  // questions for the mock bank from one of your notes (needs the AI)
  const makeQuestions = async (n) => {
    setMaking(n.id); setProblem('');
    try {
      const r = await api('POST', 'notes', { unit, topic: n.title, noteId: n.id });
      props.notify(`${r.questions} question${r.questions === 1 ? '' : 's'} added to the bank for timed papers.`);
    } catch (e) { setProblem(e.message); }
    setMaking('');
  };

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
          <span className="row-main"><h2>Hub files</h2><span className="row-sub">{lib ? `${files.length - unread} of ${files.length} read` : 'Loading…'}{dl?.limit ? ` · ${Math.max(0, dl.limit - dl.used)} download${dl.limit - dl.used === 1 ? '' : 's'} left today` : ''}</span></span>
          <button className="btn primary" onClick={prepare} disabled={busy || !lib || !files.length}>{busy ? (progress ? `${progress.done} of ${progress.total} read` : 'Reading…') : unread ? 'Prepare' : 'Check again'}</button>
        </div>
        {busy && <div className="progress" aria-hidden="true"><span style={{ width: `${progress ? (100 * progress.done) / progress.total : 5}%` }} /></div>}
        {lib?.note && <p className="row-sub">{lib.note}</p>}
      </div>
      <AddToHub unit={unit} notify={props.notify} />
      {files.length > 0 && (
        <div className="list">
          {files.map((f) => {
            const [tone, label] = status(f);
            return (
              <div key={f.id} className="list-row">
                <span className="row-main"><span className="filename">{f.name}</span><span className="row-sub">{f.paper ? 'Paper' : 'Notes'}{f.pages ? ` · ${f.pages} pages` : ''}</span></span>
                <span className={`chip ${tone || ''}`}>{label}</span>
                {f.url && <a className="btn" href={f.url} target="_blank" rel="noreferrer">Open in Discord</a>}
                <OpenAt fileId={f.id} label="Open" />
                {f.url && /^\d+$/.test(f.id) && <button className="btn plain" onClick={() => download(f)}>Download</button>}
              </div>
            );
          })}
        </div>
      )}
      <div>
        <h2 className="list-title">Your notes</h2>
        {!mine.length ? <div className="card"><p className="row-sub">None for {unit} yet. Import them from Obsidian or Notion in Settings.</p></div> : (
          <div className="list">
            {mine.map((n) => (
              <div key={n.id} className="list-row">
                <span className="row-main"><span className="filename">{n.title}</span><span className="row-sub">{Math.max(1, Math.round(n.chars / 1000))}k characters · {n.source === 'notion' ? 'Notion' : n.source === 'obsidian' ? 'Obsidian' : 'File'}</span></span>
                <button className="btn" disabled={Boolean(making) || !props.s.ai} onClick={() => makeQuestions(n)}>{making === n.id ? 'Writing…' : 'Make questions'}</button>
                <button className="btn plain" onClick={() => remove(n)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
