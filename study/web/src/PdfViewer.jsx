import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjs from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from './api.js';
import { Icon } from './icons.jsx';

// Hub PDFs inside Crux, read-only, each in a tab, opened at a page. It never downloads a whole file: pdf.js asks for
// the byte ranges it needs through /api/files/bytes (Discord's links can't be read by the app directly), and pages
// are drawn as you reach them. Text can be selected: "Pin to notes" (the notes bar) and "Highlight" (saved in your
// account as data.marks, drawn back on the page). Collapsed, the tabs wait in a dock. Loaded only when a file is opened.
pdfjs.GlobalWorkerOptions.workerSrc = worker;
const CHUNK = 256 * 1024;

async function part(url, from, to) {
  const r = await fetch(`/api/files/bytes?url=${encodeURIComponent(url)}&from=${from}&to=${to}`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Couldn't load the file (${r.status}).`);
  return { bytes: new Uint8Array(await r.arrayBuffer()), total: Number(r.headers.get('content-range')?.split('/')[1]) };
}
const isPdf = (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

// One loaded document per open file, shared by the full viewer and the mini reader in the notes bar, so switching
// between them never fetches it again. → { doc, ratio (page 1's height / width) } or { notPdf: true }
const docs = new Map();
export function loadDoc(url) {
  if (!docs.has(url)) {
    docs.set(url, (async () => {
      const first = await part(url, 0, CHUNK - 1);
      if (!isPdf(first.bytes)) return { notPdf: true };
      const transport = new pdfjs.PDFDataRangeTransport(first.total || first.bytes.length, first.bytes);
      transport.requestDataRange = (begin, end) => part(url, begin, end - 1).then(({ bytes }) => transport.onDataRange(begin, bytes)).catch(() => {});
      const doc = await pdfjs.getDocument({ range: transport, rangeChunkSize: CHUNK, disableAutoFetch: true, disableStream: true }).promise;
      const p1 = (await doc.getPage(1)).getViewport({ scale: 1 });
      return { doc, ratio: p1.height / p1.width };
    })().catch((e) => { docs.delete(url); throw e; }));
  }
  return docs.get(url);
}
const dropDoc = (url) => { const d = docs.get(url); docs.delete(url); d?.then((r) => r.doc?.destroy()).catch(() => {}); };
const short = (name) => String(name || 'File').replace(/\.[a-z0-9]+$/i, '').replace(/\(?z-?library\)?/gi, '').replace(/_/g, ' ').trim();

function Page({ doc, n, width, ratio, onSeen, marks, onMark }) {
  const box = useRef(null);
  const canvas = useRef(null);
  const text = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { rootMargin: '1200px 0px' });
    const seen = new IntersectionObserver(([e]) => { if (e.isIntersecting) onSeen(n); }, { threshold: 0.5 });
    io.observe(box.current); seen.observe(box.current);
    return () => { io.disconnect(); seen.disconnect(); };
  }, [n, onSeen]);
  useEffect(() => {
    if (!near || !width) return undefined;
    let task;
    let layer;
    let gone = false;
    doc.getPage(n).then((p) => {
      if (gone) return;
      const scale = width / p.getViewport({ scale: 1 }).width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: scale * dpr });
      const c = canvas.current;
      c.width = vp.width; c.height = vp.height;
      task = p.render({ canvasContext: c.getContext('2d'), viewport: vp });
      task.promise.catch((e) => { if (e?.name !== 'RenderingCancelledException') c.dataset.error = e?.message || String(e); });
      // the text, invisible over the picture, so it can be selected
      const t = text.current;
      t.replaceChildren();
      t.style.setProperty('--scale-factor', scale);
      layer = new pdfjs.TextLayer({ textContentSource: p.streamTextContent(), container: t, viewport: p.getViewport({ scale }) });
      layer.render().catch(() => {});
    });
    return () => { gone = true; task?.cancel(); layer?.cancel(); };
  }, [near, width, doc, n]);
  return (
    <div ref={box} className="pdf-page" data-page={n} style={{ width, height: width * ratio }}>
      <canvas ref={canvas} aria-label={`Page ${n}`} />
      <div ref={text} className="textLayer" />
      {marks.map((m) => m.rects.map((r, i) => (
        <button key={`${m.id}-${i}`} type="button" className="pdf-mark" aria-label={`Highlight: ${m.text}`} title={m.text}
          style={{ left: `${r[0] * 100}%`, top: `${r[1] * 100}%`, width: `${r[2] * 100}%`, height: `${r[3] * 100}%` }}
          onClick={(e) => onMark(m, e.currentTarget.getBoundingClientRect())} />
      )))}
    </div>
  );
}

function Reader({ tab, onPage, marks, setMarks, onProblem }) {
  const [doc, setDoc] = useState(null);
  const [ratio, setRatio] = useState(1.414);
  const [problem, setProblem] = useState('');
  const [notPdf, setNotPdf] = useState(false);
  const [at, setAt] = useState(tab.page || 1);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(0);
  const [open, setOpen] = useState(null); // the highlight tapped: { m, x, y }
  const scroller = useRef(null);
  const jumped = useRef(false);

  useEffect(() => {
    let gone = false;
    loadDoc(tab.url).then((r) => {
      if (gone) return;
      if (r.notPdf) setNotPdf(true); else { setRatio(r.ratio); setDoc(r.doc); }
    }).catch((e) => { if (!gone) setProblem(e.message); });
    return () => { gone = true; };
  }, [tab.url]);
  useEffect(() => {
    const size = () => setFit(Math.min(scroller.current?.clientWidth || 800, 900) - 16);
    size();
    window.addEventListener('resize', size);
    return () => window.removeEventListener('resize', size);
  }, []);
  const go = (n) => scroller.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: 'start' });
  useEffect(() => {
    if (doc && fit && !jumped.current) { jumped.current = true; requestAnimationFrame(() => go(Math.min(tab.page || 1, doc.numPages))); }
  }, [doc, fit, tab.page]);
  useEffect(() => { onPage(at); }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Highlight" from the selection toolbar (StickyBar's PinButton): the selected lines, as fractions of the page
  useEffect(() => {
    const mark = async (e) => {
      const range = e.detail.range;
      const pageEl = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.closest('.pdf-page');
      if (!pageEl || !scroller.current?.contains(pageEl)) return;
      const box = pageEl.getBoundingClientRect();
      const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1 && r.bottom > box.top && r.top < box.bottom)
        .map((r) => [(r.left - box.left) / box.width, (r.top - box.top) / box.height, r.width / box.width, r.height / box.height]);
      if (!rects.length) return;
      const draft = { id: `new-${Date.now()}`, file: tab.fileId, page: Number(pageEl.dataset.page), rects, text: range.toString().trim().slice(0, 1000) };
      setMarks((ms) => [...ms, draft]);
      try {
        const made = await api('POST', 'marks', draft);
        if (!made.queued) setMarks((ms) => ms.map((x) => (x.id === draft.id ? made : x)));
      } catch (err) { onProblem(err.message); }
    };
    window.addEventListener('crux-highlight', mark);
    return () => window.removeEventListener('crux-highlight', mark);
  }, [tab.fileId, setMarks, onProblem]);
  const removeMark = (m) => {
    setMarks((ms) => ms.filter((x) => x.id !== m.id));
    setOpen(null);
    if (!m.id.startsWith('new-')) api('DELETE', `marks/${m.id}`).catch((e) => onProblem(e.message));
  };
  const pinMark = (m) => {
    window.dispatchEvent(new CustomEvent('crux-pin', { detail: { text: m.text, from: `${short(tab.name)} · p. ${m.page}` } }));
    setOpen(null);
  };

  const width = Math.round(fit * zoom);
  const mine = marks.filter((m) => m.file === tab.fileId);
  return (
    <>
      {doc && (
        <div className="pdf-tools">
          <button type="button" className="iconbtn" aria-label="Previous page" disabled={at <= 1} onClick={() => go(at - 1)}><Icon name="down" /></button>
          <span className="num pdf-at">{at} / {doc.numPages}</span>
          <button type="button" className="iconbtn" aria-label="Next page" disabled={at >= doc.numPages} onClick={() => go(at + 1)}><Icon name="down" /></button>
          <button type="button" className="btn plain" aria-label="Smaller" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>−</button>
          <button type="button" className="btn plain" aria-label="Larger" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>+</button>
        </div>
      )}
      <div className="pdf-scroll" ref={scroller} onScroll={() => setOpen(null)}>
        {problem && <p className="notice bad" role="alert">{problem}</p>}
        {notPdf && <p className="notice">This file isn't a PDF, so Crux can't show it here. Open it in Discord instead.</p>}
        {!doc && !problem && !notPdf && <div className="pdf-loading"><div className="skeleton" style={{ height: 420, width: Math.min(fit || 600, 600) }} /><p className="small">Opening{tab.page ? ` at page ${tab.page}` : ''}…</p></div>}
        {doc && Array.from({ length: doc.numPages }, (_, i) => (
          <Page key={i + 1} doc={doc} n={i + 1} width={width} ratio={ratio} onSeen={setAt}
            marks={mine.filter((m) => m.page === i + 1)} onMark={(m, r) => setOpen({ m, x: r.left + r.width / 2, y: r.bottom + 6 })} />
        ))}
      </div>
      {open && (
        <div className="pdf-markmenu glass" style={{ left: Math.min(Math.max(open.x, 110), window.innerWidth - 110), top: Math.min(open.y, window.innerHeight - 60) }}>
          <button type="button" className="btn plain" onClick={() => pinMark(open.m)}><Icon name="pin" /> Pin to notes</button>
          <button type="button" className="btn plain" onClick={() => removeMark(open.m)}><Icon name="trash" /> Remove</button>
        </div>
      )}
    </>
  );
}

// The collapsed viewer in the notes bar: the page you were on, live and small, with page arrows, a chip per open
// file, and Continue reading. Same loaded document as the full viewer (loadDoc), so nothing is fetched twice.
function Mini({ tabs, tab, marks, onActivate, onCloseTab, onPage }) {
  const canvas = useRef(null);
  const box = useRef(null);
  const [info, setInfo] = useState(null); // { pages }
  const [problem, setProblem] = useState('');
  const [turn, setTurn] = useState(''); // 'next' | 'prev': which way the page slides in
  const page = tab.page || 1;
  useEffect(() => {
    let gone = false;
    let task;
    setProblem('');
    loadDoc(tab.url).then(async (r) => {
      if (gone) return;
      if (r.notPdf) { setProblem("Not a PDF: open it in Discord."); return; }
      setInfo({ pages: r.doc.numPages });
      const p = await r.doc.getPage(Math.min(page, r.doc.numPages));
      if (gone) return;
      const width = box.current?.clientWidth || 260;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: (width / p.getViewport({ scale: 1 }).width) * dpr });
      const c = canvas.current;
      c.width = vp.width; c.height = vp.height;
      task = p.render({ canvasContext: c.getContext('2d'), viewport: vp });
      await task.promise.catch(() => {});
    }).catch((e) => { if (!gone) setProblem(e.message); });
    return () => { gone = true; task?.cancel(); };
  }, [tab.url, page]);
  const go = (n) => { if (!info || n < 1 || n > info.pages) return; setTurn(n > page ? 'next' : 'prev'); onPage(tab.fileId, n); };
  const lit = marks.filter((m) => m.file === tab.fileId && m.page === page).length;
  return (
    <section className="mini-reader" aria-label={`Reading ${short(tab.name)}`}>
      <div className="mini-head">
        <span className="mini-live" aria-hidden="true" />
        <span className="mini-name" title={short(tab.name)}>{short(tab.name)}</span>
        <button type="button" className="iconbtn" aria-label={`Close ${short(tab.name)}`} onClick={() => onCloseTab(tab.fileId)}><Icon name="close" /></button>
      </div>
      <button type="button" ref={box} className={`mini-page ${turn}`} key={`${tab.fileId}:${page}`} onClick={() => onActivate(tab.fileId)} aria-label={`Continue reading at page ${page}`}>
        <canvas ref={canvas} />
        {problem && <span className="mini-problem">{problem}</span>}
        <span className="mini-go"><Icon name="file" /> Continue reading</span>
        {lit > 0 && <span className="mini-lit">{lit} highlight{lit === 1 ? '' : 's'}</span>}
      </button>
      <div className="mini-foot">
        <button type="button" className="iconbtn" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}><Icon name="chevron" /></button>
        <span className="num mini-at">p. {page}{info ? ` / ${info.pages}` : ''}</span>
        <button type="button" className="iconbtn" aria-label="Next page" disabled={!info || page >= info.pages} onClick={() => go(page + 1)}><Icon name="chevron" /></button>
      </div>
      {tabs.length > 1 && (
        <div className="mini-tabs">
          {tabs.filter((t) => t.fileId !== tab.fileId).map((t) => (
            <button key={t.fileId} type="button" className="chip" onClick={() => onActivate(t.fileId, true)} title={short(t.name)}>{short(t.name)} · p. {t.page || 1}</button>
          ))}
        </div>
      )}
    </section>
  );
}

// tabs [{ fileId, url, name, page }], active (fileId), expanded. A collapsed viewer is just the dock of tabs.
export default function PdfViewer({ tabs, active, expanded, jump, marks: saved, onActivate, onCloseTab, onCollapse, onPage, onProblem }) {
  const [marks, setMarks] = useState(saved);
  useEffect(() => { setMarks(saved); }, [saved]);
  useEffect(() => {
    if (!expanded) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onCollapse(); };
    document.addEventListener('keydown', esc);
    document.body.classList.add('pdf-open');
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('pdf-open'); };
  }, [expanded, onCollapse]);
  // the notes bar's slot for the mini reader exists once the page has drawn: look again after each change
  const [, setDrawn] = useState(0);
  useEffect(() => { setDrawn((n) => n + 1); }, [expanded, tabs.length]);
  const close = (id) => { const t = tabs.find((x) => x.fileId === id); if (t) dropDoc(t.url); onCloseTab(id); };
  const tab = tabs.find((t) => t.fileId === active) || tabs[0];
  if (!tab) return null;
  const strip = (
    <div className="pdf-tabs" role="tablist" aria-label="Open files">
      {tabs.map((t) => (
        <span key={t.fileId} className="pdf-tab" role="presentation">
          <button type="button" role="tab" aria-selected={expanded && t.fileId === tab.fileId} onClick={() => onActivate(t.fileId)} title={short(t.name)}>
            <Icon name="file" /><span className="pdf-tab-name">{short(t.name)}</span><span className="num muted">p. {t.page || 1}</span>
          </button>
          <button type="button" className="pdf-tab-x" aria-label={`Close ${short(t.name)}`} onClick={() => close(t.fileId)}><Icon name="close" /></button>
        </span>
      ))}
    </div>
  );
  if (!expanded) {
    const slot = typeof document !== 'undefined' ? document.getElementById('notes-reading') : null;
    return (
      <>
        <nav className="pdf-dock glass" aria-label="Open files">{strip}</nav>
        {slot && createPortal(<Mini tabs={tabs} tab={tab} marks={marks} onActivate={onActivate} onCloseTab={close} onPage={onPage} />, slot)}
      </>
    );
  }
  return (
    <div className="pdfview" role="dialog" aria-modal="true" aria-label={short(tab.name)}>
      <header className="pdf-bar glass">
        <button type="button" className="iconbtn" aria-label="Collapse the viewer" title="Collapse (Esc)" onClick={onCollapse}><Icon name="down" /></button>
        {strip}
      </header>
      <Reader key={`${tab.fileId}:${jump}`} tab={tab} onPage={(p) => onPage(tab.fileId, p)} marks={marks} setMarks={setMarks} onProblem={onProblem} />
    </div>
  );
}
