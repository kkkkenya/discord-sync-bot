import { useState } from 'react';
import { api } from './api.js';
import { readNotes } from './notes-parse.js';

// Settings → Import notes: Obsidian (.md files, a vault folder or its .zip) or a Notion export (.zip).
// Parsed here in the browser; only the text goes to Crux. JSZip loads only when there's a zip.
export default function ImportNotes({ s, unit, refresh, notify, onProblem }) {
  const [fallback, setFallback] = useState(unit);
  const [busy, setBusy] = useState(false);
  const take = async (list) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const files = [...list];
      const entries = await Promise.all(files.map(async (f) => ({ path: f.webkitRelativePath || f.name, data: new Uint8Array(await f.arrayBuffer()) })));
      const JSZip = files.some((f) => /\.zip$/i.test(f.name)) ? (await import('jszip')).default : null;
      const notes = await readNotes(entries, { JSZip, fallbackUnit: fallback });
      if (!notes.length) throw new Error('No notes found. Crux reads .md and .txt files, and .zip exports of them.');
      const r = await api('POST', 'notes/import', { notes });
      notify(`Imported ${r.imported} note${r.imported === 1 ? '' : 's'}${r.replaced ? `, ${r.replaced} replaced` : ''}.`);
      await refresh();
    } catch (e) { onProblem(e.message); }
    setBusy(false);
  };
  return (
    <div className="card">
      <h2>Import notes</h2>
      <p className="row-sub">From Obsidian or Notion. A note goes to the unit its name or folder mentions (like EMM 302), otherwise to this one:</p>
      <label className="field">Unit
        <select value={fallback} onChange={(e) => setFallback(e.target.value)}>
          {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
        </select>
      </label>
      <div className="actions start">
        <label className={`btn primary${busy ? ' is-disabled' : ''}`}>
          {busy ? 'Importing…' : 'Choose files or a .zip'}
          <input type="file" multiple accept=".md,.markdown,.txt,.zip" className="visually-hidden" disabled={busy} onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
        </label>
        <label className={`btn folder-pick${busy ? ' is-disabled' : ''}`}>
          Choose a folder
          <input type="file" webkitdirectory="" className="visually-hidden" disabled={busy} onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
    </div>
  );
}
