import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const STEPS = [
  { id: 'countdown', target: '[data-tour="countdown"]', title: 'Your exam countdown', body: (s) => `Your next assessment starts ${s.next ? s.next.start : 'soon'} — everything is planned back from this.` },
  { id: 'units', target: '[data-tour="units"]', title: 'Pick your units', body: 'Tick the units you are sitting this semester.', done: (s) => s.data.units.length > 0 },
  { id: 'topics', target: '[data-tour="topics"]', title: 'Add topics', body: 'Copy them straight from the course outline, comma-separated.', done: (s) => s.data.topics.length >= 3 },
  { id: 'sync', target: '[data-tour="sync"]', title: 'Sync your files', body: 'Open "show server files", then "Sync files" to pull your notes and past papers from Discord so the AI answers from your material. Optional.', done: () => false },
  { id: 'start', target: '[data-tour="today"]', title: 'Start studying', body: 'This is the daily loop: pick a task, focus (the timer bottom-right), then recall and teach it back.', done: () => false },
];

const CHECK = [
  { text: 'Pick your units', done: (s) => s.data.units.length > 0 },
  { text: 'Add at least 3 topics', done: (s) => s.data.topics.length >= 3 },
  { text: 'Sync your files (optional)', done: (s) => Object.values(s.library || {}).some((e) => e.chars > 0) },
  { text: 'Start your first focus session', done: (s) => s.data.sessions.length > 0 },
];

export default function Onboarding({ s, refresh, initialStep, close }) {
  const [step, setStep] = useState(initialStep || 0);
  const [box, setBox] = useState(null); // { x, y, w, h, below, narrow }

  const measure = useCallback(() => {
    const el = document.querySelector(STEPS[step]?.target);
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    const narrow = window.innerWidth < 640;
    const below = r.bottom + 240 < window.innerHeight;
    setBox({ x: r.left, y: r.top, w: r.width, h: r.height, below, narrow });
  }, [step]);

  useEffect(() => {
    measure();
    const t = setInterval(measure, 250); // cheaply follow scroll/resize
    return () => clearInterval(t);
  }, [measure]);

  useEffect(() => {
    const el = document.querySelector(STEPS[step]?.target);
    if (el) el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    const t = setTimeout(measure, calm ? 0 : 200);
    return () => clearTimeout(t);
  }, [step, measure]);

  // A step that is gated on an action advances by itself when the action is done.
  useEffect(() => {
    const done = STEPS[step]?.done;
    if (done && done(s) && step < STEPS.length - 1) setStep((x) => x + 1);
  }, [s, step]);

  const persist = (patch) => api('POST', 'settings', { tour: { step, done: false, skipped: false, ...patch } }).then(refresh).catch(() => {});
  const next = () => { persist({ step: Math.min(STEPS.length - 1, step + 1) }); setStep((x) => Math.min(STEPS.length - 1, x + 1)); };
  const back = () => setStep((x) => Math.max(0, x - 1));
  const finish = () => { api('POST', 'settings', { tour: { step, done: true, skipped: false } }).then(refresh).catch(() => {}); close(); };
  const skip = () => { api('POST', 'settings', { tour: { step, done: false, skipped: true } }).then(refresh).catch(() => {}); close(); };

  useEffect(() => {
    const onKey = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
      if (typing) return;
      if (e.key === 'Escape') skip();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = STEPS[step];
  const style = box && !box.narrow
    ? { left: Math.max(8, Math.min(window.innerWidth - 372, box.x + box.w / 2 - 180)), top: box.below ? box.y + box.h + 12 : box.y - 12, transform: box.below ? 'none' : 'translateY(-100%)' }
    : undefined;

  return (
    <>
      {box && <div className="spotlight" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      <div className={`tour-tip${box?.narrow ? ' narrow' : ''}`} style={style} role="dialog" aria-live="polite" aria-label={`Step ${step + 1} of ${STEPS.length}: ${cur.title}`}>
        <div className="tour-progress muted small">{step + 1} of {STEPS.length}</div>
        <h3>{cur.title}</h3>
        <p>{typeof cur.body === 'function' ? cur.body(s) : cur.body}</p>
        <div className="tour-actions">
          <button className="ghost" onClick={skip}>Skip tour</button>
          <span className="spacer" />
          <button className="ghost" onClick={back} disabled={step === 0}>Back</button>
          <button onClick={step === STEPS.length - 1 ? finish : next}>{step === STEPS.length - 1 ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    </>
  );
}

export function Checklist({ s, onDismiss }) {
  const items = CHECK.map((c) => ({ ...c, ok: c.done(s) }));
  if (items.every((i) => i.ok)) return null;
  return (
    <div className="checklist">
      <div className="checklist-head"><strong>Getting started</strong><button className="x" aria-label="dismiss" onClick={onDismiss}>×</button></div>
      {items.map((i) => (
        <div key={i.text} className={i.ok ? 'ok' : ''}><span className="tick">{i.ok ? '✓' : '○'}</span> {i.text}</div>
      ))}
    </div>
  );
}
