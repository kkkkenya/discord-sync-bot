import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';

// "Add files for the hub" on a unit's Notes tab: drag in or pick past papers, notes, slides or photos of a paper.
// Each goes straight to the hub's file storage (hub-uploads.js); the hub PC turns photos and slides into PDFs and
// posts them to the unit, credited to you. Photos sent together become one PDF.
const OK = /\.(pdf|jpe?g|png|pptx?|docx?)$/i;
const MAX = 50 * 1024 * 1024;
const STATUS = {
  new: 'Waiting for the hub PC', received: 'On the hub PC: being posted', posted: 'Posted to the unit · 1 credit',
  merged: 'Joined with your other photos into one PDF', duplicate: 'The hub already had this one · no credit', failed: "Couldn't be posted",
};
const day = (iso) => new Date(`${iso}T12:00:00+03:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' });
const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

async function sendOne(file, unit, batch, scheme, onProgress) {
  const { id, uploadUrl } = await api('POST', 'uploads/start', { unit, name: file.name, size: file.size, batch, ...(scheme && { scheme }) });
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
  const [credits, setCredits] = useState(null); // { count, goal, until, premium, earned }
  const [over, setOver] = useState(false);
  // consent first: the file goes on the Study Hub Discord with the student's name
  const [consent, setConsent] = useState(false);
  const input = useRef(null);
  // a marking scheme is sent for one paper, so Crux can solve that paper's questions the way the scheme does
  const [isScheme, setIsScheme] = useState(false);
  const [papers, setPapers] = useState([]);
  const [paper, setPaper] = useState('');
  const [other, setOther] = useState({ type: 'Exam', year: '', sheet: '' });
  const load = () => api('GET', `uploads?unit=${encodeURIComponent(unit)}`).then((r) => { setMine(r.files || []); setCredits(r.credits || null); }).catch(() => {});
  useEffect(() => { load(); setPaper(''); }, [unit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isScheme) api('GET', `uploads/papers?unit=${encodeURIComponent(unit)}`).then((r) => setPapers(r.papers || [])).catch(() => {}); }, [isScheme, unit]);
  const scheme = !isScheme ? null : paper === 'other' ? other : paper ? { paper } : undefined;

  const send = async (list) => {
    if (!consent) { notify('Tick the box to agree to share the files first.'); return; }
    if (scheme === undefined) { notify('Pick the paper this marking scheme is for first.'); return; }
    const files = [...list];
    const bad = files.filter((f) => !OK.test(f.name) || f.size > MAX);
    const good = files.filter((f) => !bad.includes(f));
    setSending([...good.map((f) => ({ name: f.name, size: f.size, done: 0 })), ...bad.map((f) => ({ name: f.name, size: f.size, error: OK.test(f.name) ? 'Over 50 MB' : 'Not a PDF, photo, PowerPoint or Word file' }))]);
    const batch = `${Date.now()}`;
    let sent = 0;
    for (const [i, f] of good.entries()) {
      try {
        await sendOne(f, unit, batch, scheme, (p) => setSending((s) => s.map((x, j) => (j === i ? { ...x, done: p } : x))));
        setSending((s) => s.map((x, j) => (j === i ? { ...x, done: 1 } : x)));
        sent++;
      } catch (e) {
        setSending((s) => s.map((x, j) => (j === i ? { ...x, error: e.message } : x)));
      }
    }
    if (sent) { notify(`${isScheme ? 'Marking scheme' : `${sent} file${sent === 1 ? '' : 's'}`} sent to the hub. Thank you!`); load(); }
  };

  return (
    <div className="card stack-s">
      <div className="card-head"><span className="row-main"><h2>Add files for the hub</h2><span className="row-sub">Past papers, marking schemes, notes, slides or photos of a paper the hub doesn't have yet</span></span></div>
      {credits && (
        <div className="credits">
          <span className="credits-n num"><b>{credits.count}</b> / {credits.goal}</span>
          <span className="row-main">
            <span>{credits.earned ? <b>You've earned Mimosa until {day(credits.until)} and a contributor medal. Thank you!</b> : credits.premium ? 'Your files help the whole class.' : <>Add <b className="num">{Math.max(0, credits.goal - credits.count)}</b> more file{credits.goal - credits.count === 1 ? '' : 's'} the hub doesn't have and get <b>Mimosa until {day(credits.until)}</b> and a contributor medal.</>}</span>
            <span className="row-sub">Each file the hub posts is one credit this semester. Files it already has don't count.</span>
          </span>
          <span className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (100 * credits.count) / credits.goal)}%` }} /></span>
        </div>
      )}
      <div className="scheme-pick">
        <label className="check"><input type="checkbox" checked={isScheme} onChange={(e) => setIsScheme(e.target.checked)} /> I'm sending a marking scheme</label>
        {isScheme && (
          <div className="scheme-fields">
            <label className="field">Which paper is it for?
              <select value={paper} onChange={(e) => setPaper(e.target.value)}>
                <option value="">Pick the paper</option>
                {papers.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
                <option value="other">A paper that isn't listed</option>
              </select>
            </label>
            {paper === 'other' && (
              <>
                <label className="field">Kind
                  <select value={other.type} onChange={(e) => setOther({ ...other, type: e.target.value })}>
                    {['Exam', 'CAT 1', 'CAT 2', 'Tutorial'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                {other.type === 'Tutorial'
                  ? <label className="field">Tutorial number<input inputMode="numeric" value={other.sheet} onChange={(e) => setOther({ ...other, sheet: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="3" /></label>
                  : <label className="field">Year<input inputMode="numeric" value={other.year} onChange={(e) => setOther({ ...other, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="2023" /></label>}
              </>
            )}
            <p className="muted small">Crux uses it to solve this paper's questions the way your lecturer marks them. It earns a credit like any file.</p>
          </div>
        )}
      </div>
      <label className="check consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I agree to share these files on the Study Hub Discord for {unit}, credited to me. They are mine to share (my notes, or papers given to the class).</span>
      </label>
      <label className={`dropzone${over ? ' is-over' : ''}${consent ? '' : ' is-off'}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}>
        <Icon name="file" />
        <span><b>Drop files here</b> or tap to choose</span>
        <span className="muted small">PDF, JPG, PNG, PowerPoint or Word, up to 50 MB each. Photos sent together become one PDF.</span>
        <input ref={input} type="file" multiple disabled={!consent} accept=".pdf,.jpg,.jpeg,.png,.ppt,.pptx,.doc,.docx,image/*" className="visually-hidden" onChange={(e) => { send(e.target.files); e.target.value = ''; }} />
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
      <p className="muted small">The hub posts them to this unit with your name, for your whole class.</p>
    </div>
  );
}
