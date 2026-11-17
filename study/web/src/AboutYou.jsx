import { useEffect, useState } from 'react';
import { api } from './api.js';

const NOTE_CHARS = 140;
const NOTES = 5;

// Settings → What Crux knows about you (fixplan-e E5). The lines are built from your own checked answers and mark
// breakdowns; each one shows its evidence and can be hidden. Your notes are yours to add and delete. Nothing here
// is shared, and a hidden line is never used in a prompt.
export default function AboutYou({ notify, onProblem }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const load = () => api('GET', 'learner').then(setFile).catch((e) => onProblem(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // one edit; when Crux is offline the edit waits on this device (api.js outbox) and the list stays as it was
  const change = (body, done) => api('POST', 'learner', body).then((r) => {
    if (r.queued) { notify('Saved on this device. It reaches Crux when you are back online.'); return; }
    setFile(r);
    done?.();
  }).catch((e) => onProblem(e.message));

  if (!file) return <div className="card"><p className="row-sub">Loading what Crux knows about you.</p></div>;
  const lines = file.lines.filter((l) => l.kind !== 'note');
  const full = file.notes.length >= NOTES;
  const addNote = (e) => {
    e.preventDefault();
    const t = note.trim();
    if (!t) return;
    change({ action: 'addNote', text: t }, () => setNote(''));
  };

  return (
    <section className="card about-you" aria-labelledby="about-you-title">
      <h2 id="about-you-title">What Crux knows about you</h2>
      <p className="row-sub">Built only from your own work here: checked answers and where your working broke. Crux uses it to slow down on the step you usually lose, and to pick examples that suit you. It is never shared, and no other student sees it.</p>

      {lines.length === 0 ? (
        <p className="hint">Nothing yet. Crux learns this from checked answers over a few days, and never guesses.</p>
      ) : (
        <ul className="about-list">
          {lines.map((l) => (
            <li key={l.id} className="about-line">
              <div className="about-text">
                <span className={l.hidden ? 'about-off' : undefined}>{l.text}</span>
                <span className="row-sub">{l.evidence}</span>
              </div>
              <button type="button" className="btn" aria-label={`${l.hidden ? 'Show' : 'Hide'}: ${l.text}`}
                onClick={() => change({ action: l.hidden ? 'show' : 'hide', id: l.id })}>
                {l.hidden ? 'Show' : 'Hide'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="about-notes">
        <h3>Your notes</h3>
        <p className="hint">Up to {NOTES} notes, {NOTE_CHARS} characters each. Write what helps you study, such as “I mix up signs in beam questions”. Leave out other people’s names.</p>
        {file.notes.length > 0 && (
          <ul className="about-list">
            {file.notes.map((n) => (
              <li key={n.id} className="about-line">
                <span className="about-text">{n.text}</span>
                <button type="button" className="btn" aria-label={`Delete note: ${n.text}`} onClick={() => change({ action: 'deleteNote', id: n.id })}>Delete</button>
              </li>
            ))}
          </ul>
        )}
        {full ? (
          <p className="hint">That is {NOTES} notes. Delete one to add another.</p>
        ) : (
          <form className="about-add" onSubmit={addNote}>
            <label className="field">Add a note
              <input value={note} maxLength={NOTE_CHARS} onChange={(e) => setNote(e.target.value)} />
              <span className="hint">{note.length} of {NOTE_CHARS}</span>
            </label>
            <div className="actions start"><button type="submit" className="btn" disabled={!note.trim()}>Add note</button></div>
          </form>
        )}
      </div>

      <details className="about-block">
        <summary>The text Crux sends with your questions</summary>
        <p className="hint">{file.block || 'Nothing: every line is hidden, or there is nothing yet.'}</p>
      </details>

      <div className="actions start">
        <button type="button" className="btn" onClick={() => change({ action: 'clear' })}>Clear all</button>
      </div>
      <p className="hint">Clear all deletes your notes and hides every line above. Your practice record stays; it is what the lines come from.</p>
    </section>
  );
}
