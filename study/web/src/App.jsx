import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import GoDeeper from './GoDeeper.jsx';
import { Icon } from './icons.jsx';
import Insights from './Insights.jsx';
import Kit from './Kit.jsx';
import Mock from './Mock.jsx';
import PractiseQuestions from './PractiseQuestions.jsx';
import { go as goTo, href, unitCode, unitSlug, useRoute } from './route.js';
import Settings from './Settings.jsx';
import Teach from './Teach.jsx';
import Today from './Today.jsx';
import Units from './Units.jsx';
import UnitNotes from './UnitNotes.jsx';
import UnitPapers from './UnitPapers.jsx';
import UnitTopics from './UnitTopics.jsx';

const TABS = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'units', label: 'Units', icon: 'units' },
  { id: 'practise', label: 'Practise', icon: 'practise' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
];
const MODES = [{ id: 'questions', label: 'Questions' }, { id: 'explain', label: 'Explain it' }, { id: 'timed', label: 'Timed paper' }];
const UNIT_TABS = [{ id: 'topics', label: 'Topics' }, { id: 'papers', label: 'Papers' }, { id: 'notes', label: 'Notes' }, { id: 'sheet', label: 'Sheet' }];

// Where the old panels' links (go('predictions'), go('teach'), …) land in the new map (fixplan Appendix C).
const PLACE = {
  overview: ['today'], today: ['today'], units: ['units'],
  predictions: ['unit', 'papers'], papers: ['unit', 'papers'], analysis: ['unit', 'topics'], learn: ['unit', 'topics'],
  kit: ['unit', 'sheet'], notes: ['unit', 'notes'],
  practice: ['practise', 'questions'], teach: ['practise', 'explain'], mock: ['practise', 'timed'], progress: ['insights'],
};

export default function App({ user }) {
  const route = useRoute();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [problem, setProblem] = useState('');
  const [deeper, setDeeper] = useState(null); // { unit, topicId?, questionId?, goal? } while Go deeper is open
  const [focus, setFocus] = useState(null); // what a Today task asks for: { section, unit, topic }
  const [toast, setToast] = useState(null); // { text, undo }: deletes happen at once and can be undone for 8 s
  const notify = useCallback((text, undo) => setToast({ text, undo, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  // one current unit for every screen, remembered in this browser
  const [unitPick, setUnitPick] = useState(() => { try { return localStorage.getItem('study-unit') || ''; } catch { return ''; } });
  const setUnit = useCallback((code) => { setUnitPick(code); try { localStorage.setItem('study-unit', code); } catch { /* private window */ } }, []);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on); window.addEventListener('offline', on);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);
  // once per new version: a new build only starts when Crux is opened again, so this is the moment to say so
  useEffect(() => {
    try {
      const last = localStorage.getItem('crux-version');
      if (last && last !== __CRUX_VERSION__) notify('Crux was updated.');
      localStorage.setItem('crux-version', __CRUX_VERSION__);
    } catch { /* private window */ }
  }, [notify]);
  const refresh = useCallback(() => api('GET', 'state').then((x) => { setS(x); setProblem(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const show = (e) => { setProblem(e.reason?.message || String(e.reason)); e.preventDefault(); };
    window.addEventListener('unhandledrejection', show);
    return () => window.removeEventListener('unhandledrejection', show);
  }, []);
  // a unit page sets the current unit
  useEffect(() => { if (route.name === 'unit' && route.rest[0]) setUnit(unitCode(route.rest[0])); }, [route, setUnit]);

  if (error) return <main className="main"><p className="notice bad">{error} <button className="btn plain" onClick={() => { setError(''); refresh(); }}>Try again</button></p></main>;
  if (!s) return <main className="main" aria-busy="true"><div className="skeleton" style={{ height: 34, width: 160 }} /><div className="skeleton" style={{ height: 180 }} /></main>;

  const unit = s.data.units.some((u) => u.code === unitPick) ? unitPick : s.plan[0]?.code || s.data.units[0]?.code || '';
  const go = (section, extra = {}) => {
    const target = extra.unit || unit;
    if (section === 'prompt') { setDeeper({ unit: target, topicId: extra.topicId, questionId: extra.questionId, goal: extra.goal }); return; }
    if (extra.unit) setUnit(extra.unit);
    setFocus({ section, ...extra, at: Date.now() });
    const [name, tab] = PLACE[section] || ['today'];
    goTo(name === 'unit' ? href('unit', unitSlug(target), tab) : href(name, tab));
    setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }), 50);
  };
  const props = { s, refresh, go, focus, notify, unit, setUnit };
  const settingsOpen = route.name === 'settings';
  const page = settingsOpen ? 'today' : route.name;
  const bare = !s.data.units.length; // the first run: no tabs until there are units
  const current = (id) => (page === id || (id === 'units' && page === 'unit') ? 'page' : undefined);

  let content;
  if (page === 'unit') {
    const code = unitCode(route.rest[0]);
    const u = s.data.units.find((x) => x.code === code);
    const tab = UNIT_TABS.some((t) => t.id === route.rest[1]) ? route.rest[1] : 'topics';
    content = !u ? (
      <div className="empty"><h1>Not one of your units</h1><a className="btn" href={href('units')}>See your units</a></div>
    ) : (
      <>
        <header className="page-head"><h1>{u.code}</h1><p>{u.title}</p></header>
        <nav className="segmented" aria-label={`${u.code} sections`}>
          {UNIT_TABS.map((t) => <a key={t.id} href={href('unit', unitSlug(u.code), t.id)} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>)}
        </nav>
        {tab === 'topics' && <UnitTopics {...props} unit={u.code} />}
        {tab === 'papers' && <UnitPapers {...props} unit={u.code} />}
        {tab === 'notes' && <UnitNotes {...props} unit={u.code} />}
        {tab === 'sheet' && <div className="legacy sheet-tab"><Kit {...props} unit={u.code} /></div>}
      </>
    );
  } else if (page === 'units') {
    content = <><header className="page-head"><h1>Units</h1></header><div className="legacy"><Units {...props} /></div></>;
  } else if (page === 'practise') {
    const mode = MODES.some((m) => m.id === route.rest[0]) ? route.rest[0] : 'questions';
    content = (
      <>
        <header className="page-head"><h1>Practise</h1><p>{unit}</p></header>
        <nav className="segmented" aria-label="Ways to practise">
          {MODES.map((m) => <a key={m.id} href={href('practise', m.id)} aria-current={mode === m.id ? 'page' : undefined}>{m.label}</a>)}
        </nav>
        {mode === 'questions' && <PractiseQuestions key={unit} {...props} />}
        {mode === 'explain' && <div className="legacy"><Teach {...props} /></div>}
        {mode === 'timed' && <div className="legacy"><Mock {...props} /></div>}
      </>
    );
  } else if (page === 'insights') {
    content = <><header className="page-head"><h1>Insights</h1></header><Insights {...props} deeper={setDeeper} /></>;
  } else {
    content = <Today {...props} />;
  }
  if (bare) {
    content = <Today {...props} />; // whatever the route: there's nothing else to show yet
  }

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <a className="wordmark" href={href('today')}><img src="/favicon.svg" alt="" />Crux</a>
        {s.data.units.length > 0 && (
          <select className="unitswitch" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Current unit">
            {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
          </select>
        )}
        <a className="iconbtn" href={href('settings')} aria-label="Settings"><Icon name="settings" /></a>
      </header>
      <div className={bare ? '' : 'layout'}>
        {!bare && <nav className="rail" aria-label="Sections">
          {TABS.map((t) => <a key={t.id} href={href(t.id)} aria-current={current(t.id)}><Icon name={t.icon} />{t.label}</a>)}
        </nav>}
        <main className="main" id="main" tabIndex={-1}>
          {!online && <p className="notice" role="status">Offline. You're seeing your last saved data, and changes won't save until you're back.</p>}
          {problem && <p className="notice bad" role="alert">{problem} <button className="btn plain" onClick={refresh}>Try again</button></p>}
          {content}
        </main>
      </div>
      {!bare && (
        <nav className="tabbar" aria-label="Sections">
          {TABS.map((t) => <a key={t.id} href={href(t.id)} aria-current={current(t.id)}><Icon name={t.icon} />{t.label}</a>)}
        </nav>
      )}
      {deeper && <GoDeeper s={s} target={deeper} onClose={() => setDeeper(null)} />}
      {settingsOpen && <Settings s={s} user={user} refresh={refresh} onProblem={setProblem} onClose={() => (history.length > 1 ? history.back() : goTo(href('today')))} />}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && <button className="btn plain" onClick={() => { const u = toast.undo; setToast(null); Promise.resolve(u()).then(refresh).catch((e) => setProblem(e.message)); }}>Undo</button>}
          <button className="iconbtn" aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" /></button>
        </div>
      )}
    </>
  );
}
