import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';
import Rich from './Rich.jsx';

// The notes bar: clips pinned from anywhere in Crux and notes you write, kept in your account (data.stickies).
// Laptop: a column fixed on the right that folds into a slim rail (remembered), giving the page its width back.
// Phone and tablet: a strip above the bottom nav with the newest note, pulled up to see them all. Each unit has its own notes; "All units" notes show everywhere.
const FOLD = 'crux-notes-folded';
const ordered = (list) => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(b.at).localeCompare(String(a.at)));

// The selected text as plain text, with typeset maths turned back into $…$ so it pastes into any AI.
function selectionText(range) {
  const r = range.cloneRange();
  const edge = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest('[data-tex]');
  const a = edge(r.startContainer); if (a) r.setStartBefore(a);
  const b = edge(r.endContainer); if (b) r.setEndAfter(b);
  const box = document.createElement('div');
  box.append(r.cloneContents());
  box.querySelectorAll('[data-tex]').forEach((m) => m.replaceWith(m.classList.contains('mathblock') ? `$$${m.dataset.tex}$$` : `$${m.dataset.tex}$`));
  box.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap';
  document.body.append(box);
  const text = box.innerText;
  box.remove();
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
// Where a clip came from: the box or card it sits in.
function sourceOf(node, unit) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  const page = el?.closest('.pdf-page'); // a book in the viewer: its name and the page
  if (page) return `${el.closest('.pdfview')?.getAttribute('aria-label') || 'File'} · p. ${page.dataset.page}`.slice(0, 120);
  const box = el?.closest('[aria-label], section, .card');
  const label = box?.getAttribute('aria-label') || box?.querySelector('h2, h3, .qbox-label')?.textContent || document.querySelector('h1')?.textContent || '';
  return [unit, label.trim()].filter(Boolean).join(' · ').slice(0, 120);
}

// "Pin" next to any text selected outside the bar.
function PinButton({ onPin }) {
  const [at, setAt] = useState(null);
  useEffect(() => {
    let t;
    const check = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return setAt(null);
        const range = sel.getRangeAt(0);
        const host = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
        if (!host || host.closest('.notesbar, input, textarea, [contenteditable]') || sel.toString().trim().length < 2) return setAt(null);
        const box = range.getBoundingClientRect();
        setAt({ range, x: Math.min(Math.max(box.left + box.width / 2, 48), window.innerWidth - 48), y: box.bottom + 8 > window.innerHeight - 60 ? box.top - 44 : box.bottom + 8 });
      }, 180);
    };
    document.addEventListener('selectionchange', check);
    window.addEventListener('scroll', () => setAt(null), { passive: true });
    return () => { clearTimeout(t); document.removeEventListener('selectionchange', check); };
  }, []);
  if (!at) return null;
  const done = () => { window.getSelection()?.removeAllRanges(); setAt(null); };
  const inPdf = (at.range.commonAncestorContainer.nodeType === 1 ? at.range.commonAncestorContainer : at.range.commonAncestorContainer.parentElement)?.closest('.pdf-page');
  return (
    <span className="pinbtn glass" style={{ left: at.x, top: at.y }} onMouseDown={(e) => e.preventDefault()}>
      <button type="button" onClick={() => { onPin(at.range); done(); }}><Icon name="pin" /> Pin to notes</button>
      {inPdf && <button type="button" onClick={() => { window.dispatchEvent(new CustomEvent('crux-highlight', { detail: { range: at.range.cloneRange() } })); done(); }}><Icon name="edit" /> Highlight</button>}
    </span>
  );
}

function Note({ n, unit, change, remove, onDragStart, onDrop }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.text);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(n.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the text is selectable too */ }
  };
  return (
    <li className="note" draggable={!editing} onDragStart={onDragStart} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {editing ? (
        <form className="stack-s" onSubmit={(e) => { e.preventDefault(); change({ text }); setEditing(false); }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} aria-label="Edit note" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form.requestSubmit(); if (e.key === 'Escape') setEditing(false); }} />
          <div className="note-tools"><button className="btn plain">Save</button><button type="button" className="btn plain" onClick={() => { setText(n.text); setEditing(false); }}>Cancel</button></div>
        </form>
      ) : (
        <>
          <Rich text={n.text} className="note-text" />
          <div className="note-foot">
            <span className="note-from">{n.unit ? n.from || '' : `All units${n.from ? ` · ${n.from}` : ''}`}</span>
            <span className="note-tools">
              <button type="button" className="iconbtn" aria-label={copied ? 'Copied' : 'Copy note'} title={copied ? 'Copied' : 'Copy'} onClick={copy}><Icon name={copied ? 'check' : 'copy'} /></button>
              <button type="button" className="iconbtn" aria-pressed={!n.unit} aria-label={n.unit ? 'Show on all units' : `Only on ${unit}`} title={n.unit ? 'Show on all units' : `Only on ${unit}`} onClick={() => change({ unit: n.unit ? null : unit })}><Icon name="globe" /></button>
              <button type="button" className="iconbtn" aria-label="Edit note" title="Edit" onClick={() => setEditing(true)}><Icon name="edit" /></button>
              <button type="button" className="iconbtn" aria-label="Delete note" title="Delete" onClick={remove}><Icon name="trash" /></button>
            </span>
          </div>
        </>
      )}
    </li>
  );
}

export default function StickyBar({ s, unit, onProblem }) {
  const [notes, setNotes] = useState(s.data.stickies);
  useEffect(() => { setNotes(s.data.stickies); }, [s.data.stickies]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false); // the phone strip pulled up
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem(FOLD) === '1'; } catch { return false; } }); // the laptop column
  const fold = (f) => { setFolded(f); try { localStorage.setItem(FOLD, f ? '1' : '0'); } catch { /* private window */ } };
  const dragged = useRef(null);
  const swipe = useRef(null); // where a touch on the phone strip started: swipe up opens, down closes
  const shown = useMemo(() => ordered(notes.filter((n) => !n.unit || n.unit === unit)), [notes, unit]);

  const save = (fn) => fn().catch((e) => onProblem(e.message));
  const create = (text, from = '') => {
    const t = text.trim().slice(0, 2000);
    if (!t) return;
    const order = Math.min(0, ...shown.map((n) => n.order ?? 0)) - 1; // newest at the top
    const temp = { id: `new-${Date.now()}`, text: t, unit: unit || null, from, order, at: new Date().toISOString() };
    setNotes((x) => [...x, temp]);
    save(async () => {
      const made = await api('POST', 'stickies', { text: t, unit: unit || null, from, order });
      if (!made.queued) setNotes((x) => x.map((n) => (n.id === temp.id ? made : n)));
    });
  };
  const change = (n, fields) => {
    setNotes((x) => x.map((y) => (y.id === n.id ? { ...y, ...fields } : y)));
    if (!n.id.startsWith('new-')) save(() => api('PATCH', `stickies/${n.id}`, fields));
  };
  const remove = (n) => {
    setNotes((x) => x.filter((y) => y.id !== n.id));
    if (!n.id.startsWith('new-')) save(() => api('DELETE', `stickies/${n.id}`));
  };
  // drop a note on another: it takes that place, between its new neighbours
  const drop = (target) => {
    const n = dragged.current;
    dragged.current = null;
    if (!n || n.id === target.id) return;
    const rest = shown.filter((x) => x.id !== n.id);
    const i = rest.findIndex((x) => x.id === target.id);
    const before = rest[i - 1]?.order ?? (target.order ?? 0) - 2;
    change(n, { order: (before + (target.order ?? 0)) / 2 });
  };

  // "Pin to notes" from a highlight in the PDF viewer
  useEffect(() => {
    const pin = (e) => create(e.detail.text, e.detail.from);
    window.addEventListener('crux-pin', pin);
    return () => window.removeEventListener('crux-pin', pin);
  });
  const newest = shown[0];
  return (
    <>
      <PinButton onPin={(range) => create(selectionText(range), sourceOf(range.startContainer, unit))} />
      <aside className={`notesbar glass${open ? ' is-open' : ''}${folded ? ' is-folded' : ''}`} aria-label="Notes">
        <button type="button" className="notes-rail" aria-expanded="false" aria-label={`Show notes (${shown.length})`} title="Show notes" onClick={() => fold(false)}>
          <Icon name="notes" /><span className="chip num">{shown.length}</span><span className="notes-rail-word">Notes</span>
        </button>
        <button type="button" className="notes-strip" aria-expanded={open} onClick={() => setOpen((o) => !o)}
          onTouchStart={(e) => { swipe.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => { const dy = e.changedTouches[0].clientY - (swipe.current ?? e.changedTouches[0].clientY); if (Math.abs(dy) > 30) { e.preventDefault(); setOpen(dy < 0); } }}>
          <span className="notes-grip" aria-hidden="true" />
          <Icon name="notes" />
          <span className="notes-peek">{newest ? <Rich text={newest.text.split('\n').find((l) => l.trim()) || ''} as="span" /> : 'Notes: select text anywhere and pin it here'}</span>
          <span className="chip num">{shown.length}</span>
        </button>
        <div className="notes-body">
          <div id="notes-reading" /> {/* the PDF you're reading, small (PdfViewer.jsx Mini) */}
          <div className="notes-head">
            <h2><Icon name="notes" /> Notes{unit ? <span className="muted"> · {unit}</span> : null}</h2>
            <button type="button" className="iconbtn notes-fold" aria-expanded="true" aria-label="Hide notes" title="Hide notes" onClick={() => fold(true)}><Icon name="chevron" /></button>
          </div>
          <form className="notes-add" onSubmit={(e) => { e.preventDefault(); create(draft); setDraft(''); }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={2000} placeholder="Write or paste a note. Maths in $…$"
              aria-label="New note" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form.requestSubmit(); }} />
            <button className="btn" disabled={!draft.trim()}>Add</button>
          </form>
          {shown.length ? (
            <ul className="notes-list">
              {shown.map((n) => (
                <Note key={n.id} n={n} unit={unit} change={(f) => change(n, f)} remove={() => remove(n)}
                  onDragStart={() => { dragged.current = n; }} onDrop={() => drop(n)} />
              ))}
            </ul>
          ) : <p className="muted small notes-empty">Select a formula, a step or a definition anywhere in Crux and tap <b>Pin to notes</b>. It stays here while you work, ready to copy.</p>}
        </div>
      </aside>
    </>
  );
}
