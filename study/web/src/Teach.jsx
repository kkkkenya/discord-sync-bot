import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Busy from './Busy.jsx';
import LimitNote from './LimitNote.jsx';
import { wavData } from './media.js';

const MAX_SECS = 240; // 4 minutes of voice is about 7.7 MB as WAV, under the upload limit

function Feedback({ f }) {
  return (
    <div className="feedback">
      <p className="score">{f.score}/5</p>
      <p>✓ {f.good}</p>
      <ul>{f.gaps.map((g) => <li key={g}>✗ {g}</li>)}</ul>
      <p><b>Answer this next, from memory:</b> {f.followUp}</p>
    </div>
  );
}

// Gaps that don't match a sub-topic yet: one click lists each under the topic (as shaky: you just missed it).
function GapsToSubtopics({ topicId, gaps, refresh }) {
  const [done, setDone] = useState([]);
  const addOne = async (gap) => {
    const { added } = await api('POST', 'subtopics', { topicId, name: gap.length > 70 ? `${gap.slice(0, 67)}…` : gap });
    if (added[0]) await api('PATCH', `subtopics/${added[0].id}`, { audit: 'shaky' });
    setDone((d) => [...d, gap]);
    refresh();
  };
  return (
    <div className="small">
      <p className="muted">Not in your sub-topic list yet:</p>
      <ul className="gaps">{gaps.map((g) => <li key={g}>{g} {done.includes(g) ? <span className="ok">added ✓</span> : <button className="link" onClick={() => addOne(g)}>add as a shaky sub-topic</button>}</li>)}</ul>
    </div>
  );
}

export default function Teach({ s, unit, setUnit, refresh, focus, go }) {
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

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

  // Phase 9: say it instead of typing it. Recorded in the browser, sent as WAV, transcribed and marked the same way.
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
    <section id="teach" className="reveal">
      <h2>Teach it back</h2>
      <p className="muted small">Explain a topic as if a classmate missed the lecture: what it is, the key equation and what each term means, when it applies, one worked example. If you get stuck, that's the gap to study.{s.coach ? ' The AI marks it and names the exact gaps.' : ''}</p>
      <form onSubmit={send}>
        <div className="row wrap">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
            {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
          </select>
          <input className="grow" list="topics" placeholder="Topic (e.g. Mohr's circle)" aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <datalist id="topics">{topics.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        </div>
        <textarea rows={8} placeholder="Start with: 'Imagine you have…'" aria-label="Your explanation" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row wrap">
          <button disabled={busy || rec || !unit || !topic.trim() || text.trim().length < 40}><Busy on={busy} label="Marking…" idle={s.coach ? 'Get it marked' : 'Save teach-back'} /></button>
          <span className="muted small">or</span>
          {rec
            ? <button type="button" className="ghost" onClick={() => rec.stop()}><span className="recdot" />Stop and mark ({Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} of 4:00)</button>
            : <button type="button" className="ghost" onClick={record} disabled={busy || !s.media?.audio || !unit || !topic.trim()}>Say it out loud instead</button>}
        </div>
        {!s.media?.audio && <p className="muted small">Speaking needs an AI that can listen (Gemini, in Settings). Typing works with any.</p>}
        {rec && <p className="muted small" role="status">Recording. Explain it as if to a classmate, then press Stop.</p>}
      </form>
      {result?.error && <p className="banner bad">{result.error}</p>}
      {result?.transcript && <details className="past" open><summary>What you said</summary><p className="small">{result.transcript}</p></details>}
      {result?.item && <LimitNote s={s} unit={unit} topic={topic} go={go} what="marking a derivation" />}
      {result?.item?.feedback && <Feedback f={result.item.feedback} />}
      {result?.flags?.flagged?.length > 0 && <p className="muted small" role="status">Marked shaky in your weakspots: <b>{result.flags.flagged.join(', ')}</b>.</p>}
      {result?.flags?.topicId && result.flags.unmatched?.length > 0 && <GapsToSubtopics topicId={result.flags.topicId} gaps={result.flags.unmatched} refresh={refresh} />}
      {result?.item && !result.item.feedback && <p className="muted">Saved.</p>}
      {past.length > 0 && (
        <details className="past">
          <summary>Earlier teach-backs for {unit} ({past.length})</summary>
          {past.map((t) => <div key={t.id}><b>{t.topic}</b>{t.feedback && ` · ${t.feedback.score}/5`} <span className="muted small">{t.at.slice(0, 10)}</span><p className="small">{t.text}</p></div>)}
        </details>
      )}
    </section>
  );
}
