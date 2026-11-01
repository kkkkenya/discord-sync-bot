import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Busy from './Busy.jsx';
import LimitNote from './LimitNote.jsx';
import { wavData } from './media.js';
import Rich, { AnswerBox, QuestionBox } from './Rich.jsx';

const MAX_SECS = 240; // 4 minutes of voice is about 7.7 MB as WAV, under the upload limit

function Feedback({ f }) {
  return (
    <section className="card stack" aria-label="Marking">
      <p className="score-big num">{f.score}<span className="muted">/5</span></p>
      <AnswerBox text={f.good} label="What you got right" tone="key" />
      {f.gaps.length > 0 && <AnswerBox label="Gaps" tone="gap"><ul className="plain-list">{f.gaps.map((g) => <li key={g}><Rich text={g} as="span" /></li>)}</ul></AnswerBox>}
      <QuestionBox text={f.followUp} label="Answer this next, from memory" />
    </section>
  );
}

// Gaps that don't match a sub-topic yet: one tap lists each under the topic (as shaky: you just missed it).
function GapsToSubtopics({ topicId, gaps, refresh }) {
  const [done, setDone] = useState([]);
  const addOne = async (gap) => {
    const { added } = await api('POST', 'subtopics', { topicId, name: gap.length > 70 ? `${gap.slice(0, 67)}…` : gap });
    if (added[0]) await api('PATCH', `subtopics/${added[0].id}`, { audit: 'shaky' });
    setDone((d) => [...d, gap]);
    refresh();
  };
  return (
    <div className="stack-s">
      <h3 className="sub-title">Not in your sub-topics yet</h3>
      <div className="list flat">
        {gaps.map((g) => (
          <div key={g} className="list-row static">
            <span className="row-main">{g}</span>
            {done.includes(g) ? <span className="chip good">Added</span> : <button type="button" className="btn plain" onClick={() => addOne(g)}>Add as shaky</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Explain it: teach a topic back as if to a classmate, typed or out loud; the AI marks it and names the gaps.
export default function Teach({ s, unit, refresh, focus, go }) {
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { setTopic(''); setText(''); setResult(null); }, [unit]);
  useEffect(() => {
    if (focus?.section !== 'teach') return;
    if (focus.topic) setTopic(focus.topic);
  }, [focus]);

  const topics = s.data.topics.filter((t) => t.unit === unit);
  const past = s.data.teach.filter((t) => t.unit === unit).slice(-5).reverse();

  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setResult(null);
    try { setResult(await api('POST', 'teach', { unit, topic, text })); setText(''); refresh(); }
    catch (err) { setResult({ error: err.message }); }
    setBusy(false);
  };

  // say it instead of typing it: recorded in the browser, sent as WAV, transcribed and marked the same way
  const [rec, setRec] = useState(null); // the MediaRecorder while recording
  const [secs, setSecs] = useState(0);
  const chunks = useRef([]);
  useEffect(() => {
    if (!rec) return;
    setSecs(0);
    const t = setInterval(() => setSecs((n) => { if (n + 1 >= MAX_SECS) rec.stop(); return n + 1; }), 1000);
    return () => clearInterval(t);
  }, [rec]);
  const speak = async (blob) => {
    setBusy(true);
    try {
      const out = await api('POST', 'teach/audio', { unit, topic, audio: await wavData(blob) });
      if (out.unclear) setResult({ error: out.message, transcript: out.transcript });
      else { setResult(out); refresh(); }
    } catch (err) { setResult({ error: err.message }); }
    setBusy(false);
  };
  const record = async () => {
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => chunks.current.push(e.data);
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setRec(null); speak(new Blob(chunks.current, { type: r.mimeType })); };
      r.start();
      setRec(r);
    } catch { setResult({ error: 'The microphone isn’t available. Allow it for this page in the browser, or type instead.' }); }
  };

  return (
    <div className="stack">
      <form className="card stack" onSubmit={send}>
        <p className="muted small">Explain it as if a classmate missed the lecture: what it is, the key equation and each term, when it applies, one worked example. Where you get stuck is the gap to study.</p>
        <label className="field">Topic
          <input list="teach-topics" placeholder="Mohr's circle" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <datalist id="teach-topics">{topics.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        </label>
        <label className="field">Your explanation
          <textarea rows={8} placeholder="Imagine you have…" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="toolbar">
          <button className="btn primary" disabled={busy || rec || !unit || !topic.trim() || text.trim().length < 40}><Busy on={busy} label="Marking…" idle={s.coach ? 'Get it marked' : 'Save'} /></button>
          {rec
            ? <button type="button" className="btn" onClick={() => rec.stop()}><span className="recdot" />Stop and mark <span className="num">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span></button>
            : <button type="button" className="btn" onClick={record} disabled={busy || !s.media?.audio || !unit || !topic.trim()}>Say it out loud</button>}
        </div>
        {!s.media?.audio && <p className="muted small">Speaking needs Gemini (Settings → AI). Typing works with either.</p>}
        {rec && <p className="muted small" role="status">Recording. Up to 4 minutes, then press Stop.</p>}
      </form>
      {result?.error && <p className="notice bad" role="alert">{result.error}</p>}
      {result?.transcript && <details className="disclosure" open><summary>What you said</summary><p className="muted small">{result.transcript}</p></details>}
      {result?.item && <LimitNote s={s} unit={unit} topic={topic} go={go} what="marking a derivation" />}
      {result?.item?.feedback && <Feedback f={result.item.feedback} />}
      {result?.flags?.flagged?.length > 0 && <p className="muted small" role="status">Marked shaky in your weakspots: <b>{result.flags.flagged.join(', ')}</b>.</p>}
      {result?.flags?.topicId && result.flags.unmatched?.length > 0 && <GapsToSubtopics topicId={result.flags.topicId} gaps={result.flags.unmatched} refresh={refresh} />}
      {result?.item && !result.item.feedback && <p className="muted" role="status">Saved.</p>}
      {past.length > 0 && (
        <details className="disclosure">
          <summary>Earlier explanations <span className="muted num">({past.length})</span></summary>
          <div className="list flat">
            {past.map((t) => (
              <div key={t.id} className="list-row static">
                <span className="row-main"><span><b>{t.topic}</b>{t.feedback && <span className="num"> · {t.feedback.score}/5</span>}</span><span className="row-sub qtext">{t.text}</span></span>
                <span className="row-sub num">{t.at.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
