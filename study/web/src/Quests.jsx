import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

// The tutorial, played like a game: each quest asks you to do one real thing in the app ("press Sync all files") and
// completes by itself when you have. A quest is done when the data says so (done(s)), when the app reports an
// action (event: Nav, the unit picker and the timer send these through questEvent in api.js), or when a section has
// been on screen for a moment (see). Progress is saved in settings.quest = { done: [ids], off }.
export const QUESTS = [
  { id: 'look', title: 'Look around', do: 'Hover over a group in the top bar (Today, Plan, Practise or Review), or tap Menu on a phone.', why: 'Every section lives under one of those four. The panel shows what each one holds.', target: '.groups, .menubtn', event: 'nav-open', xp: 10 },
  { id: 'units', title: 'Pick your units', do: 'In Units, tick the units you’re sitting this semester and press Save. (Edit units brings the list back later.)', why: 'Everything else is planned around them.', target: '#units', done: (s) => s.data.units.length > 0, xp: 20 },
  { id: 'unit', title: 'Choose what you’re studying', do: 'Pick a unit in the box at the top right.', why: 'Every section follows that one unit, so you pick it once.', target: '.unitpick', event: 'unit-pick', xp: 10 },
  { id: 'date', title: 'Set a date', do: 'On a unit card, set its CAT date, or tick TBA if the strike moved it.', why: 'The date decides the unit’s stage, and the stage decides what Today asks of you.', target: '#units .unit', done: (s) => s.data.units.some((u) => u.catDate), xp: 10 },
  { id: 'sync', title: 'Bring in your files', do: 'Press Sync all files in Units.', why: 'It pulls the unit’s notes and past papers from the Study Hub and reads the papers into questions.', target: '[data-tour="sync"]', done: (s) => Object.values(s.library || {}).some((e) => e.chars > 0), xp: 20 },
  { id: 'topics', title: 'List the topics', do: 'Press Suggest topics on a unit and add the ones your course covers (or type three or more).', why: 'Topics are how Predict ranks what is likely to come.', target: '[data-tour="topics"]', done: (s) => s.data.topics.length >= 3, xp: 20 },
  { id: 'predict', title: 'See what’s likely to come', do: 'Open Plan → Predict and read your number 1 topic.', why: 'Exam weight = how often it comes up × its marks × what the lecturer said.', target: '#predictions', see: '#predictions', xp: 10 },
  { id: 'learn', title: 'Study a topic', do: 'Open Practise → Study this topic and read the first page it points you to.', why: 'Notes and worked examples come first; the questions are there when you’re ready.', target: '#learn', see: '#learn', xp: 20 },
  { id: 'rate', title: 'Rate yourself honestly', do: 'In Weakspots, add sub-topics under a topic and rate one solid, shaky or stuck.', why: 'Fix first = exam weight × how weak you are.', target: '#analysis', done: (s) => s.data.subtopics.some((x) => x.auditAt), xp: 20 },
  { id: 'check', title: 'Check an answer', do: 'Solve a past-paper question on paper, closed book. Then type your final answer in Check answer and press Check.', why: 'A right answer counts in any unit: 0.1425 GPa is 142.5 MPa.', target: '#practice', done: (s) => s.data.attempts.length > 0, xp: 30 },
  { id: 'broke', title: 'Find where it broke', do: 'If it didn’t match, tap Broke here on the first checkpoint your paper disagrees with.', why: 'That step, and the kind of mistake, is exactly what to study next. Right first time? Then this one is already yours.', target: '#practice', done: (s) => s.data.attempts.some((a) => a.verdict === 'wrong' || a.verdict === 'right'), xp: 30 },
  { id: 'kit', title: 'Make your study kit', do: 'In Study kit, press Make it.', why: 'It is made for the unit’s stage: a ladder now, a one-page formula sheet near the paper.', target: '#kit', done: (s) => s.data.materials.length > 0, xp: 20 },
  { id: 'teach', title: 'Teach it back', do: 'Explain one topic in Teach it back, as if to a classmate, and get it marked.', why: 'If you get stuck explaining it, that is the gap.', target: '#teach', done: (s) => s.data.teach.length > 0, xp: 20 },
  { id: 'focus', title: 'Start a focus session', do: 'Press Focus on the timer at the bottom right. You can stop it straight away.', why: 'Sessions, checked answers and teach-backs all keep your streak going.', target: '.timer', event: 'focus-start', done: (s) => s.data.sessions.length > 0, xp: 10 },
];
const RANKS = [[0, 'Trainee'], [60, 'Technician'], [140, 'Engineer'], [220, 'Chartered Engineer']];
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Quests({ s, refresh, go }) {
  const saved = s.settings.quest || {};
  const [done, setDone] = useState(saved.done || []);
  const [won, setWon] = useState(null); // the quest just completed, for the +XP pop
  const [ring, setRing] = useState(null);
  const hud = useRef(null);
  const doneRef = useRef(done);
  doneRef.current = done;

  const cur = QUESTS.find((q) => !done.includes(q.id));
  const xp = QUESTS.filter((q) => done.includes(q.id)).reduce((n, q) => n + q.xp, 0);
  const rank = [...RANKS].reverse().find(([min]) => xp >= min)[1];
  const save = (patch) => api('POST', 'settings', { quest: { done: doneRef.current, ...saved, ...patch } }).then(refresh).catch(() => {});

  const complete = (ids) => {
    const add = ids.filter((id) => !doneRef.current.includes(id));
    if (!add.length) return;
    const next = [...doneRef.current, ...add];
    doneRef.current = next;
    setDone(next);
    setWon(QUESTS.find((q) => q.id === add.at(-1)));
    api('POST', 'settings', { quest: { ...saved, done: next } }).catch(() => {});
  };

  // data-based quests: anything already true counts (a returning user skips what they've done)
  useEffect(() => { complete(QUESTS.filter((q) => q.done?.(s)).map((q) => q.id)); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  // action-based quests
  useEffect(() => {
    const on = (e) => complete(QUESTS.filter((q) => q.event === e.detail).map((q) => q.id));
    window.addEventListener('study-quest', on);
    return () => window.removeEventListener('study-quest', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // "see it" quests: the section has been on screen for a second and a half
  useEffect(() => {
    if (!cur?.see) return;
    const el = document.querySelector(cur.see);
    if (!el) return;
    let t;
    const io = new IntersectionObserver(([e]) => { clearTimeout(t); if (e.isIntersecting) t = setTimeout(() => complete([cur.id]), 1500); }, { threshold: 0.35 });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // the pulsing ring follows the current quest's target while it is on screen
  useEffect(() => {
    if (!cur) { setRing(null); return; }
    const measure = () => {
      const el = [...document.querySelectorAll(cur.target)].find((x) => x.offsetParent !== null || getComputedStyle(x).position === 'fixed');
      if (!el) return setRing(null);
      const r = el.getBoundingClientRect();
      const inView = r.bottom > 0 && r.top < innerHeight;
      setRing(inView ? { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: Math.min(r.height + 12, innerHeight - r.top + 6) } : null);
    };
    measure();
    const t = setInterval(measure, 300);
    return () => clearInterval(t);
  }, [cur?.id]);

  // the +XP pop, and a burst of sparks; the last quest gets a bigger one
  useGSAP(() => {
    if (!won || calm()) return;
    const last = !cur;
    gsap.fromTo('.quest-won', { scale: 0.6, opacity: 0, y: 8 }, { scale: 1, opacity: 1, y: 0, duration: 0.45, ease: 'back.out(2.2)' });
    gsap.fromTo('.spark', { x: 0, y: 0, opacity: 1, scale: 1 }, {
      x: () => gsap.utils.random(-90, 90) * (last ? 2.2 : 1), y: () => gsap.utils.random(-110, -20) * (last ? 2 : 1),
      opacity: 0, scale: 0.4, duration: last ? 1.4 : 0.9, ease: 'power2.out', stagger: 0.015,
    });
  }, { scope: hud, dependencies: [won?.id] });
  useEffect(() => { if (!won) return; const t = setTimeout(() => setWon(null), 2600); return () => clearTimeout(t); }, [won]);

  const show = () => {
    const sec = cur.target.match(/#(\w+)/)?.[1];
    if (sec) go(sec);
    else document.querySelector(cur.target)?.scrollIntoView({ block: 'center' });
  };

  if (saved.off) return null;
  const pct = Math.round((done.length / QUESTS.length) * 100);
  return (
    <>
      {ring && <div className="quest-ring" style={{ left: ring.x, top: ring.y, width: ring.w, height: ring.h }} aria-hidden="true" />}
      <aside className="quest" ref={hud} aria-live="polite" aria-label="Tutorial quests">
        <div className="quest-top">
          <span className="eyebrow">{cur ? `Quest ${QUESTS.indexOf(cur) + 1} of ${QUESTS.length}` : 'All quests done'}</span>
          <span className="quest-xp"><b>{xp}</b> XP · {rank}</span>
          <button className="x" aria-label="Hide the tutorial (Settings brings it back)" title="Hide (Settings brings it back)" onClick={() => save({ off: true })}>×</button>
        </div>
        <div className="quest-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
        {won && (
          <p className="quest-won" role="status">
            {Array.from({ length: cur ? 10 : 24 }, (_, i) => <i key={i} className="spark" />)}
            ✓ {won.title} <b>+{won.xp} XP</b>
          </p>
        )}
        {cur ? (
          <>
            <h3>{cur.title}</h3>
            <p className="quest-do">{cur.do}</p>
            <p className="muted small">{cur.why}</p>
            <div className="row">
              <button onClick={show}>Show me</button>
              <button className="ghost" onClick={() => complete([cur.id])}>Skip</button>
            </div>
          </>
        ) : (
          <>
            <h3>You know the whole desk.</h3>
            <p className="small">The daily loop from here: open Today, do task 1, check your answers, mark where they broke.</p>
            <button className="ghost" onClick={() => save({ off: true })}>Close the tutorial</button>
          </>
        )}
      </aside>
    </>
  );
}
