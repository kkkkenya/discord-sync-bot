import { useState } from 'react';
import { api } from './api.js';
import { AiWait } from './Busy.jsx';
import Rich from './Rich.jsx';

const STARTERS = ['Why this formula and not another?', 'Explain the method step by step', 'Why this method?', 'What if the question changed a value?'];

// "Ask about this": a follow-up chat on one question and its solution. The chat is kept by the page (chats, by
// question), so going to another question and back keeps it. Each message is one AI action.
export default function AskTutor({ unit, qid, chat = [], setChat, ai }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const send = async (q) => {
    const ask = String(q || '').trim();
    if (!ask || busy) return;
    const messages = [...chat, { role: 'student', text: ask }];
    setChat(messages); setText(''); setBusy(true); setProblem('');
    try {
      const r = await api('POST', 'attempts/ask', { unit, questionId: qid, messages });
      if (r.needAi) throw new Error(r.message);
      setChat([...messages, { role: 'tutor', text: r.reply }]);
    } catch (e) { setProblem(e.message); setChat(chat); setText(ask); }
    setBusy(false);
  };
  return (
    <section className="card stack ask" aria-labelledby={`ask-${qid}`}>
      <h2 className="card-title" id={`ask-${qid}`}>Ask about this question</h2>
      {!chat.length && <p className="muted small">Why this formula, why this method, explain a step again: ask the way you'd ask a lecturer.</p>}
      {chat.length > 0 && (
        <ol className="ask-list">
          {chat.map((m, i) => (
            <li key={i} className={`ask-msg ${m.role}`}>
              {m.role === 'tutor' ? <Rich text={m.text} /> : <p>{m.text}</p>}
            </li>
          ))}
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
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder={ai ? 'Ask a follow-up. Maths in $…$' : 'Needs the built-in AI'}
          aria-label="Your question about this solution" disabled={!ai}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
        <button className="btn primary" disabled={busy || !text.trim() || !ai}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
    </section>
  );
}
