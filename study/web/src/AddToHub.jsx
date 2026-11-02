import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';

// "Add files for the hub" on a unit's Notes tab: drag in or pick past papers, notes, slides or photos of a paper.
// Each goes straight to the hub's file storage (hub-uploads.js); the hub PC turns photos and slides into PDFs and
// posts them to the unit, credited to you. Photos sent together become one PDF.
const OK = /\.(pdf|jpe?g|png|pptx?|docx?)$/i;
const MAX = 50 * 1024 * 1024;
const STATUS = { new: 'Waiting for the hub PC', received: 'On the hub: posted to the unit within a few minutes', failed: "Couldn't be posted" };
const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

async function sendOne(file, unit, batch, onProgress) {
  const { id, uploadUrl } = await api('POST', 'uploads/start', { unit, name: file.name, size: file.size, batch });
  await new Promise((ok, fail) => { // XHR for upload progress
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', file);
    const x = new XMLHttpRequest();
    x.open('PUT', uploadUrl);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? ok() : fail(new Error(`Upload failed (${x.status}).`)));
    x.onerror = () => fail(new Error('Upload failed: check your connection.'));
    x.send(form);
  });
  await api('POST', 'uploads/done', { id });
}

export default function AddToHub({ unit, notify }) {
  const [sending, setSending] = useState([]); // [{ name, size, done (0-1), error }]
  const [mine, setMine] = useState([]);
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const load = () => api('GET', `uploads?unit=${encodeURIComponent(unit)}`).then((r) => setMine(r.files || [])).catch(() => {});
  useEffect(() => { load(); }, [unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (list) => {
    const files = [...list];
    const bad = files.filter((f) => !OK.test(f.name) || f.size > MAX);
    const good = files.filter((f) => !bad.includes(f));
    setSending([...good.map((f) => ({ name: f.name, size: f.size, done: 0 })), ...bad.map((f) => ({ name: f.name, size: f.size, error: OK.test(f.name) ? 'Over 50 MB' : 'Not a PDF, photo, PowerPoint or Word file' }))]);
    const batch = `${Date.now()}`;
    let sent = 0;
    for (const [i, f] of good.entries()) {
      try {
        await sendOne(f, unit, batch, (p) => setSending((s) => s.map((x, j) => (j === i ? { ...x, done: p } : x))));
        setSending((s) => s.map((x, j) => (j === i ? { ...x, done: 1 } : x)));
        sent++;
      } catch (e) {
        setSending((s) => s.map((x, j) => (j === i ? { ...x, error: e.message } : x)));
      }
    }
    if (sent) { notify(`${sent} file${sent === 1 ? '' : 's'} sent to the hub. Thank you!`); load(); }
  };

  return (
    <div className="card stack-s">
      <div className="card-head"><span className="row-main"><h2>Add files for the hub</h2><span className="row-sub">Past papers, notes, slides or photos of a paper the hub doesn't have yet</span></span></div>
      <label className={`dropzone${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}>
        <Icon name="file" />
        <span><b>Drop files here</b> or tap to choose</span>
        <span className="muted small">PDF, JPG, PNG, PowerPoint or Word, up to 50 MB each. Photos sent together become one PDF.</span>
        <input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.ppt,.pptx,.doc,.docx,image/*" className="visually-hidden" onChange={(e) => { send(e.target.files); e.target.value = ''; }} />
      </label>
      {sending.length > 0 && (
        <ul className="hub-sending">
          {sending.map((f) => (
            <li key={f.name}>
              <span className="row-main"><span className="filename">{f.name}</span><span className={`row-sub${f.error ? ' bad-text' : ''}`}>{f.error || (f.done >= 1 ? 'Sent' : `Sending… ${Math.round(f.done * 100)}%`)} · {size(f.size)}</span></span>
              {!f.error && <span className="progress" aria-hidden="true"><span style={{ width: `${Math.round(f.done * 100)}%` }} /></span>}
            </li>
          ))}
        </ul>
      )}
      {mine.length > 0 && (
        <details className="disclosure">
          <summary>Files you've sent for {unit} <span className="muted num">({mine.length})</span></summary>
          <ul className="hub-sending">
            {mine.map((f) => <li key={f.id}><span className="row-main"><span className="filename">{f.name}</span><span className="row-sub">{STATUS[f.status] || f.status}{f.note ? ` · ${f.note}` : ''}</span></span></li>)}
          </ul>
        </details>
      )}
      <p className="muted small">The hub posts them to this unit with your name, for your whole class. Only send files you're happy to share.</p>
    </div>
  );
}
