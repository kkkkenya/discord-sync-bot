import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ReactLenis } from 'lenis/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Analysis from './Analysis.jsx';
import Hero from './Hero.jsx';
import Kit from './Kit.jsx';
import Mock from './Mock.jsx';
import Nav from './Nav.jsx';
import Notes from './Notes.jsx';
import Papers from './Papers.jsx';
import Practice from './Practice.jsx';
import Predictions from './Predictions.jsx';
import Progress from './Progress.jsx';
import Prompt from './Prompt.jsx';
import Quests from './Quests.jsx';
import Teach from './Teach.jsx';
import Timer from './Timer.jsx';
import Today from './Today.jsx';
import Units from './Units.jsx';

gsap.registerPlugin(useGSAP, ScrollTrigger);
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The page in four bands, in the order a study day runs (Nav.jsx GROUPS lists what is in each section).
function Band({ n, label, note, children }) {
  return (
    <div className="band">
      <p className="band-head eyebrow"><b>{n}</b> {label}<span>{note}</span></p>
      {children}
    </div>
  );
}

export default function App() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  // what a "Today" task asks for: { section, unit, topic } — Teach and Mock preselect from it
  const [focus, setFocus] = useState(null);
  const lenisRef = useRef(null);
  const root = useRef(null);

  const [problem, setProblem] = useState('');
  // one toast at a time: { text, undo } — deletes happen at once and can be undone for 8 seconds
  const [toast, setToast] = useState(null);
  const notify = useCallback((text, undo) => setToast({ text, undo, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);
  // one current unit for every section: any unit picker changes it, opening a task or a unit's link sets it, and
  // this browser remembers it between visits
  const [unitPick, setUnitPick] = useState(() => { try { return localStorage.getItem('study-unit') || ''; } catch { return ''; } });
  const setUnit = useCallback((code) => { setUnitPick(code); try { localStorage.setItem('study-unit', code); } catch { /* private window */ } }, []);
  const refresh = useCallback(() => api('GET', 'state').then((x) => { setS(x); setProblem(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { refresh(); }, [refresh]);
  // any failed save (server closed, bad input) shows up here instead of failing silently
  useEffect(() => {
    const show = (e) => { setProblem(e.reason?.message || String(e.reason)); e.preventDefault(); };
    window.addEventListener('unhandledrejection', show);
    return () => window.removeEventListener('unhandledrejection', show);
  }, []);

  useEffect(() => {
    if (calm) return;
    const tick = (t) => lenisRef.current?.lenis?.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => gsap.ticker.remove(tick);
  }, []);

  useGSAP(() => {
    if (!s || calm) return;
    gsap.from('.reveal', { y: 18, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out', clearProps: 'all' });
  }, { scope: root, dependencies: [Boolean(s)] });

  // the top bar turns to frosted glass once the page has scrolled a little (Lenis feeds ScrollTrigger its scroll)
  useEffect(() => {
    if (!s) return;
    const lenis = lenisRef.current?.lenis;
    lenis?.on('scroll', ScrollTrigger.update);
    const st = ScrollTrigger.create({ start: 8, end: 'max', toggleClass: { targets: '.top', className: 'glass' } });
    return () => { st.kill(); lenis?.off('scroll', ScrollTrigger.update); };
  }, [Boolean(s)]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (section, extra = {}) => {
    if (extra.unit) setUnit(extra.unit);
    setFocus({ section, ...extra, at: Date.now() });
    const el = document.getElementById(section);
    const offset = -((document.querySelector('.top-in')?.offsetHeight || 64) + 16); // clear the fixed bar
    if (lenisRef.current?.lenis) lenisRef.current.lenis.scrollTo(el, { offset });
    else el?.scrollIntoView();
  };

  if (error) return <main className="shell"><p className="banner bad">{error} <button className="link" onClick={() => { setError(''); refresh(); }}>Try again</button></p></main>;
  if (!s) return <main className="shell"><p className="muted">Loading…</p></main>;

  // a remembered unit you've since dropped falls back to today's first unit
  const unit = s.data.units.some((u) => u.code === unitPick) ? unitPick : s.plan[0]?.code || s.data.units[0]?.code || '';
  const props = { s, refresh, go, focus, notify, unit, setUnit };
  return (
    <>
      {!calm && <ReactLenis root options={{ autoRaf: false, anchors: true }} ref={lenisRef} />}
      <Nav s={s} go={go} refresh={refresh} unit={unit} setUnit={setUnit} onProblem={setProblem} onTour={() => api('POST', 'settings', { quest: { ...s.settings.quest, off: false } }).then(refresh)} />
      <main className="shell" ref={root}>
        {problem && <p className="banner bad" role="alert">{problem} <button className="link" onClick={refresh}>Try again</button></p>}
        {s.retiredCards > 0 && !s.settings.cardsNotice && (
          <p className="banner" role="status">
            Flashcards are retired: Study Desk now works from teach-backs, exam questions and (soon) your sub-topic weakspots.
            Your {s.retiredCards} old card{s.retiredCards === 1 ? ' is' : 's are'} still saved in <code>study.json</code>, just not used.
            Topic colours no longer count recall reviews, so some topics may change colour.{' '}
            <button className="link" onClick={() => api('POST', 'settings', { cardsNotice: true }).then(refresh).catch((e) => setProblem(e.message))}>Got it</button>
          </p>
        )}
        <Band n="01" label="Today" note="where you stand, and the next thing to do">
          <div className="cols lead"><Hero {...props} /><Today {...props} /></div>
        </Band>
        <Band n="02" label="Plan" note="what the units cover, and what the exam is likely to ask">
          <Units {...props} />
          <div className="cols"><Predictions {...props} /><Analysis {...props} /></div>
        </Band>
        <Band n="03" label="Practise" note="closed book first, then check where it broke">
          <Kit {...props} />
          <div className="cols"><Practice {...props} /><Teach {...props} /></div>
          <div className="cols"><Mock {...props}><Notes {...props} /></Mock><Papers {...props} /></div>
        </Band>
        <Band n="04" label="Review" note="take it to a stronger AI, and see the trend">
          <div className="cols"><Prompt {...props} /><Progress {...props} /></div>
        </Band>
      </main>
      <Timer {...props} />
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && <button className="link" onClick={() => { const u = toast.undo; setToast(null); Promise.resolve(u()).then(refresh).catch((e) => setProblem(e.message)); }}>Undo</button>}
          <button className="x" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
        </div>
      )}
      <Quests s={s} refresh={refresh} go={go} />
    </>
  );
}
