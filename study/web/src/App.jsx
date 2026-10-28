import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ReactLenis } from 'lenis/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Hero from './Hero.jsx';
import Mock from './Mock.jsx';
import Notes from './Notes.jsx';
import Onboarding, { Checklist } from './Onboarding.jsx';
import Papers from './Papers.jsx';
import Progress from './Progress.jsx';
import Prompt from './Prompt.jsx';
import Teach from './Teach.jsx';
import Timer from './Timer.jsx';
import Today from './Today.jsx';
import Units from './Units.jsx';

gsap.registerPlugin(useGSAP);
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const NAV = [['today', 'Today'], ['units', 'Units'], ['notes', 'Notes'], ['teach', 'Teach'], ['mock', 'Mock'], ['papers', 'Papers'], ['prompt', 'Prompt'], ['progress', 'Progress']];

export default function App() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  // what a "Today" task asks for: { section, unit, topic } — Teach and Mock preselect from it
  const [focus, setFocus] = useState(null);
  const lenisRef = useRef(null);
  const root = useRef(null);

  const [problem, setProblem] = useState('');
  const [tourOn, setTourOn] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [checklistOff, setChecklistOff] = useState(false);
  const refresh = useCallback(() => api('GET', 'state').then((x) => { setS(x); setProblem(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { refresh(); }, [refresh]);
  // auto-open the tour on a brand-new (empty) store, once
  useEffect(() => {
    if (s && !s.data.units.length && !s.settings.tour?.done && !s.settings.tour?.skipped) {
      setTourStep(s.settings.tour?.step || 0);
      setTourOn(true);
    }
  }, [s?.data.units.length, s?.settings.tour?.done, s?.settings.tour?.skipped]);
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

  const go = (section, extra = {}) => {
    setFocus({ section, ...extra, at: Date.now() });
    const el = document.getElementById(section);
    if (lenisRef.current?.lenis) lenisRef.current.lenis.scrollTo(el, { offset: -70 });
    else el?.scrollIntoView();
  };

  if (error) return <main className="shell"><p className="banner bad">{error} <button className="link" onClick={() => { setError(''); refresh(); }}>Try again</button></p></main>;
  if (!s) return <main className="shell"><p className="muted">Loading…</p></main>;

  const props = { s, refresh, go, focus };
  return (
    <>
      {!calm && <ReactLenis root options={{ autoRaf: false, anchors: true }} ref={lenisRef} />}
      <header className="top">
        <div className="shell top-in">
          <strong className="brand">Study Desk</strong>
          <nav>{NAV.map(([id, label]) => <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); go(id); }}>{label}</a>)}</nav>
          <button className="help" onClick={() => { setTourStep(0); setTourOn(true); }} aria-label="Take the tour" title="Take the tour">?</button>
          <select
            className={`ai-toggle${s.ai ? '' : ' off'}`}
            value={s.settings.aiProvider}
            aria-label="AI provider"
            title={s.ai ? `AI ready (${s.provider})` : `No key for ${s.provider} — pick another provider or add the key`}
            onChange={(e) => api('POST', 'settings', { aiProvider: e.target.value }).then(refresh).catch((err) => setProblem(err.message))}
          >
            <option value="gemini">AI: Gemini</option>
            <option value="deepseek">AI: DeepSeek</option>
            <option value="anthropic">AI: Claude</option>
          </select>
        </div>
      </header>
      {problem && (
        <div className="shell"><p className="banner bad" role="alert">{problem} <button className="link" onClick={refresh}>Try again</button></p></div>
      )}
      <main className="shell" ref={root}>
        {s.retiredCards > 0 && !s.settings.cardsNotice && (
          <p className="banner" role="status">
            Flashcards are retired: Study Desk now works from teach-backs, exam questions and (soon) your sub-topic weakspots.
            Your {s.retiredCards} old card{s.retiredCards === 1 ? ' is' : 's are'} still saved in <code>study.json</code>, just not used.
            Topic colours no longer count recall reviews, so some topics may change colour.{' '}
            <button className="link" onClick={() => api('POST', 'settings', { cardsNotice: true }).then(refresh).catch((e) => setProblem(e.message))}>Got it</button>
          </p>
        )}
        <Hero {...props} />
        {!tourOn && (s.settings.tour?.done || s.settings.tour?.skipped) && !checklistOff && <Checklist s={s} onDismiss={() => setChecklistOff(true)} />}
        <Today {...props} />
        <Units {...props} />
        <Notes {...props} />
        <Teach {...props} />
        <Mock {...props} />
        <Papers {...props} />
        <Prompt {...props} />
        <Progress {...props} />
      </main>
      <Timer {...props} />
      {tourOn && <Onboarding s={s} refresh={refresh} initialStep={tourStep} close={() => setTourOn(false)} />}
    </>
  );
}
