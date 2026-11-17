// Ask about a passage (fixplan-e E4): select text anywhere in Crux (a PDF page, a solution, a guide), tap Ask, and ask
// the tutor about it. The thread is kept while the page is open, by file and page (or by where it came from), not
// saved. Each question is one AI action.
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { AiWait } from './Busy.jsx';
import { Icon } from './icons.jsx';
import Rich from './Rich.jsx';
import { AnswersLeft } from './Allowance.jsx';

const STARTERS = ['Explain this in simpler words', 'Why is this true?', 'Show a small example'];
const threads = new Map(); // where → messages, for as long as the page is open

/** Open the sheet: window.dispatchEvent(new CustomEvent('crux-ask', { detail: { text, label, fileId, page } })) */
export const askAbout = (detail) => window.dispatchEvent(new CustomEvent('crux-ask', { detail }));

export default function AskPassage({ unit, ai }) {
  const [at, setAt] = useState(null); // { text, label, fileId, page }
  const [chat, setChat] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [full, setFull] = useState(false);
  const input = useRef(null);
  const key = at ? `${at.fileId || at.label}|${at.page || ''}|${at.text.slice(0, 80)}` : '';

  useEffect(() => {
    const open = (e) => { setAt(e.detail); setChat(threads.get(`${e.detail.fileId || e.detail.label}|${e.detail.page || ''}|${e.detail.text.slice(0, 80)}`) || []); setText(''); setProblem(''); setFull(false); setTimeout(() => input.current?.focus(), 50); };
    window.addEventListener('crux-ask', open);
    return () => window.removeEventListener('crux-ask', open);
  }, []);
  useEffect(() => {
    if (!at) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setAt(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [at]);
  if (!at) return null;

  const send = async (q) => {
    const ask = String(q || '').trim();
    if (!ask || busy) return;
    const messages = [...chat, { role: 'student', text: ask }];
    setChat(messages); setText(''); setBusy(true); setProblem('');
    try {
      const r = await api('POST', 'ask/passage', { unit, passage: at.text, where: { fileId: at.fileId || null, page: at.page || null, label: at.label || '' }, messages });
      if (r.needAi) throw new Error(r.message);
      const done = [...messages, { role: 'tutor', text: r.reply }];
      setChat(done); threads.set(key, done);
    } catch (e) { setProblem(e.message); setChat(chat); setText(ask); }
    setBusy(false);
  };
  const lines = at.text.split('\n');
  const long = lines.length > 3 || at.text.length > 280;
  return (
    <section className="ask-sheet glass" role="dialog" aria-modal="false" aria-labelledby="ask-passage-title">
      <header className="ask-sheet-head">
        <h2 className="card-title" id="ask-passage-title">Ask about this</h2>
        <button type="button" className="iconbtn" aria-label="Close" onClick={() => setAt(null)}><Icon name="close" /></button>
      </header>
      <blockquote className={`ask-quote${long && !full ? ' is-short' : ''}`}>{at.text}</blockquote>
      <p className="row-sub">{at.label}{at.page ? ` · p. ${at.page}` : ''}{long && <> · <button type="button" className="btn plain" onClick={() => setFull((f) => !f)}>{full ? 'Show less' : 'Show all'}</button></>}</p>
      {chat.length > 0 && (
        <ol className="ask-list">
          {chat.map((m, i) => <li key={i} className={`ask-msg ${m.role}`}>{m.role === 'tutor' ? <Rich text={m.text} /> : <p>{m.text}</p>}</li>)}
        </ol>
      )}
      <AiWait on={busy} kind="ask" />
      {problem && <p className="notice bad" role="alert">{problem}</p>}
      {!chat.length && (
        <div className="chips">
          {STARTERS.map((x) => <button key={x} type="button" className="chip" disabled={busy || !ai} onClick={() => send(x)}>{x}</button>)}
        </div>
      )}
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder={ai ? 'Your question. Maths in $…$' : 'Needs the built-in AI'}
          aria-label="Your question about this passage" disabled={!ai}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
        <button className="btn primary" disabled={busy || !text.trim() || !ai}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
      <p className="row-sub">Each question is one AI action. <AnswersLeft /></p>
    </section>
  );
}
