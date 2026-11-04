import { Component, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, flushOutbox, openFile, outbox, prepareUnit } from './api.js';
import { adoptFocus } from './focus-store.js';
import { adoptLook } from './look.js';
import { keptPages, memoryUse } from './keep.js';
import { onSync, pull, push } from './sync.js';
import Focus, { FocusBar } from './Focus.jsx';
import StickyBar from './StickyBar.jsx';

const PdfViewer = lazy(() => import('./PdfViewer.jsx')); // only when a file is opened
import PromptBuilder from './PromptBuilder.jsx';
import { Icon } from './icons.jsx';
import Insights from './Insights.jsx';
import Kit from './Kit.jsx';
import Mock from './Mock.jsx';
import Nav from './Nav.jsx';
import PractiseQuestions from './PractiseQuestions.jsx';
import { go as goTo, href, unitCode, unitSlug, useRoute } from './route.js';
import Settings from './Settings.jsx';
import Teach from './Teach.jsx';
import Today from './Today.jsx';
import Units from './Units.jsx';
import UnitNotes from './UnitNotes.jsx';
import UnitPapers from './UnitPapers.jsx';
import UnitTopics from './UnitTopics.jsx';

const MODES = [{ id: 'questions', label: 'Questions' }, { id: 'explain', label: 'Explain it' }, { id: 'timed', label: 'Timed paper' }];
const UNIT_TABS = [{ id: 'topics', label: 'Topics' }, { id: 'papers', label: 'Papers' }, { id: 'notes', label: 'Notes' }, { id: 'sheet', label: 'Sheet' }];

// Where the old panels' links (go('predictions'), go('teach'), …) land in the new map (fixplan Appendix C).
const PLACE = {
  overview: ['today'], today: ['today'], units: ['units'],
  predictions: ['unit', 'papers'], papers: ['unit', 'papers'], analysis: ['unit', 'topics'], learn: ['unit', 'topics'],
  kit: ['unit', 'sheet'], notes: ['unit', 'notes'],
  practice: ['practise', 'questions'], teach: ['practise', 'explain'], mock: ['practise', 'timed'], progress: ['insights'],
};

// The first time a unit is opened and none of its files have been read, Crux reads them in the background (shared:
// the text is stored once for everyone in the unit). Once per unit per session, and only online.
const autoRead = new Set();
function AutoRead({ s, unit, refresh }) {
  const [line, setLine] = useState('');
  const read = Object.values(s.library || {}).some((e) => e.unit === unit && e.chars > 0);
  useEffect(() => {
    if (read || autoRead.has(unit) || !navigator.onLine) return;
    autoRead.add(unit);
    setLine(`Reading ${unit}'s files in the background…`);
    prepareUnit(unit, (p) => p.total && setLine(`Reading ${unit}'s files: ${p.done} of ${p.total}`))
      .then(() => { setLine(''); refresh(); })
      .catch(() => setLine(''));
  }, [unit, read, refresh]);
  return line ? <p className="muted small" role="status">{line}</p> : null;
}

// Every list a screen expects, even when an older or new account is missing one (a missing list used to blank the page).
const LISTS = ['units', 'topics', 'subtopics', 'paperq', 'attempts', 'teach', 'questions', 'mocks', 'materials', 'papers', 'hints', 'stickies', 'marks'];
const withLists = (x) => ({ ...x, data: { ...x.data, ...Object.fromEntries(LISTS.map((k) => [k, Array.isArray(x.data?.[k]) ? x.data[k] : []])) } });

// If a screen fails, show what happened instead of a blank page.
class Guard extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card stack" role="alert">
        <h2 className="card-title">This screen hit a problem</h2>
        <p className="muted small">{String(this.state.error.message || this.state.error)}</p>
        <div className="toolbar"><button type="button" className="btn primary" onClick={() => this.setState({ error: null })}>Try again</button><a className="btn" href={href('today')}>Back to Today</a></div>
      </div>
    );
  }
}

export default function App({ user }) {
  const route = useRoute();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [problem, setProblem] = useState('');
  const [deeper, setDeeperTarget] = useState(null); // { unit, topicId?, questionId?, goal? }: what the Prompt Builder starts from
  const setDeeper = useCallback((t) => { setDeeperTarget(t); goTo(href('deeper')); }, []);
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
  const keepUnit = useCallback((code) => { setUnitPick(code); try { localStorage.setItem('study-unit', code); } catch { /* private window */ } }, []);
  const setUnit = useCallback((code) => { keepUnit(code); push('unit', code); }, [keepUnit]);
  useEffect(() => { onSync('look', adoptLook); onSync('focus', adoptFocus); onSync('unit', keepUnit); }, [keepUnit]);
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
  // a phone keeps Crux open for days: when it comes back to the front (at most every 5 minutes), look for a newer
  // build and offer to load it
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    const mine = document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') || '';
    let last = 0;
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 5 * 60e3) return;
      last = Date.now();
      fetch('/', { cache: 'no-store' }).then((r) => r.text()).then((html) => {
        const live = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
        if (mine && live && !mine.endsWith(live)) setNewer(true);
      }).catch(() => {});
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  // a hub file opened from anywhere (openFile in api.js): shown in Crux's own viewer
  // open files are tabs, kept on this device with the page you were on; collapsed, they wait in a dock
  const [files, setFiles] = useState(() => { try { return JSON.parse(localStorage.getItem('crux-open-files') || '[]'); } catch { return []; } });
  const [activeFile, setActiveFile] = useState(() => files[0]?.fileId || null);
  const [fileOpen, setFileOpen] = useState(false);
  const [jump, setJump] = useState(0); // a new open: go to the page asked for
  useEffect(() => { try { localStorage.setItem('crux-open-files', JSON.stringify(files)); } catch { /* private window */ } }, [files]);
  useEffect(() => {
    const open = (e) => {
      const f = e.detail;
      setFiles((fs) => [f, ...fs.filter((x) => x.fileId !== f.fileId)].slice(0, 8));
      setActiveFile(f.fileId); setFileOpen(true); setJump((j) => j + 1);
    };
    window.addEventListener('crux-open-file', open);
    return () => window.removeEventListener('crux-open-file', open);
  }, []);
  // keepSmall: switch the mini reader in the notes bar to another file without opening the full viewer
  const activateFile = (id, keepSmall = false) => {
    const t = files.find((x) => x.fileId === id);
    if (t && !(t.until > Date.now())) { openFile(id, t.page).catch((e) => setProblem(e.message)); return; } // its link expired: a fresh one
    setActiveFile(id); setJump((j) => j + 1);
    if (!keepSmall) setFileOpen(true);
  };
  const closeFile = (id) => setFiles((fs) => { const left = fs.filter((x) => x.fileId !== id); if (!left.length) setFileOpen(false); else if (id === activeFile) setActiveFile(left[0].fileId); return left; });
  const filePage = useCallback((id, page) => setFiles((fs) => fs.map((x) => (x.fileId === id && x.page !== page ? { ...x, page } : x))), []);
  const collapseFile = useCallback(() => setFileOpen(false), []);
  const refresh = useCallback(() => api('GET', 'state').then((x) => { setS(withLists(x)); setProblem(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (s) pull(s.settings?.sync); }, [s]);
  // changes kept offline: shown as a count, sent when the connection comes back or Crux is opened again
  const [queued, setQueued] = useState(() => outbox().length);
  useEffect(() => {
    const count = () => setQueued(outbox().length);
    const send = () => flushOutbox().then((n) => { if (n) refresh(); });
    let last = Date.now();
    const back = () => { if (document.visibilityState === 'visible' && Date.now() - last > 60e3) { last = Date.now(); flushOutbox().then(refresh); } };
    send();
    window.addEventListener('crux-outbox', count); window.addEventListener('online', send); document.addEventListener('visibilitychange', back);
    return () => { window.removeEventListener('crux-outbox', count); window.removeEventListener('online', send); document.removeEventListener('visibilitychange', back); };
  }, [refresh]);
  useEffect(() => {
    const show = (e) => { setProblem(e.reason?.message || String(e.reason)); e.preventDefault(); };
    window.addEventListener('unhandledrejection', show);
    return () => window.removeEventListener('unhandledrejection', show);
  }, []);
  // a unit page sets the current unit
  useEffect(() => { if (route.name === 'unit' && route.rest[0]) setUnit(unitCode(route.rest[0])); }, [route, setUnit]);

  // Pages stay loaded after you leave them (Settings sets how many), hidden, with their scroll position: going to the
  // notes and back finds the question where you left it. alive: [{ key, route, unit, focus }], newest first.
  const alive = useRef([]);
  const scrolls = useRef({});
  const shownKey = useRef('');
  const [, setTrimmed] = useState(0);
  useEffect(() => {
    const save = () => { if (shownKey.current) scrolls.current[shownKey.current] = window.scrollY; };
    window.addEventListener('scroll', save, { passive: true });
    // Settings' "Free memory" and a lower limit: drop the hidden pages
    const trim = (e) => { alive.current = alive.current.slice(0, e.detail?.all ? 1 : keptPages()); setTrimmed((n) => n + 1); };
    window.addEventListener('crux-keep', trim);
    return () => { window.removeEventListener('scroll', save); window.removeEventListener('crux-keep', trim); };
  }, []);
  useLayoutEffect(() => {
    const k = alive.current[0]?.key;
    if (!k || k === shownKey.current) return;
    shownKey.current = k;
    window.scrollTo(0, scrolls.current[k] || 0);
  });
  // a lot of memory in use (Chrome and Edge say how much): offer to drop the hidden pages
  const [heavy, setHeavy] = useState(null);
  useEffect(() => {
    const t = setInterval(() => { const m = memoryUse(); setHeavy(m && m.high && alive.current.length > 1 ? m : null); }, 30e3);
    return () => clearInterval(t);
  }, []);

  if (error) return <main className="main bare"><p className="notice bad">{error} <button className="btn plain" onClick={() => { setError(''); refresh(); }}>Try again</button></p></main>;
  if (!s) return <main className="main bare" aria-busy="true"><div className="skeleton" style={{ height: 34, width: 160 }} /><div className="skeleton" style={{ height: 180 }} /></main>;

  const unit = s.data.units.some((u) => u.code === unitPick) ? unitPick : s.plan[0]?.code || s.data.units[0]?.code || '';
  const go = (section, extra = {}) => {
    const target = extra.unit || unit;
    if (section === 'prompt') { setDeeper({ unit: target, topicId: extra.topicId, questionId: extra.questionId, goal: extra.goal }); return; }
    if (extra.unit) setUnit(extra.unit);
    setFocus({ section, ...extra, at: Date.now() });
    const [name, tab] = PLACE[section] || ['today'];
    goTo(name === 'unit' ? href('unit', unitSlug(target), tab) : href(name, tab));
    setTimeout(() => document.querySelector(`.page:not([hidden]) #${CSS.escape(section)}`)?.scrollIntoView({ block: 'start' }), 50);
  };
  const props = { s, refresh, go, focus, notify, unit, setUnit, user };
  const settingsOpen = route.name === 'settings';
  const page = settingsOpen ? 'today' : route.name;
  const bare = !s.data.units.length; // the first run: no tabs until there are units

  // one page's content for its route and unit (a kept page keeps the unit it was opened with)
  const pageFor = (r, pu, pfocus) => {
    const props = { s, refresh, go, focus: pfocus, notify, unit: pu, setUnit, user };
    const page = r.name === 'settings' ? 'today' : r.name;
    let content;
    if (page === 'unit') {
      const code = unitCode(r.rest[0]);
      const u = s.data.units.find((x) => x.code === code);
      const tab = UNIT_TABS.some((t) => t.id === r.rest[1]) ? r.rest[1] : 'topics';
      content = !u ? (
        <div className="empty"><h1>Not one of your units</h1><a className="btn" href={href('units')}>See your units</a></div>
      ) : (
        <>
          <header className="page-head"><span className="eyebrow num"><span className="udot" />{u.code}</span><h1>{u.title || u.code}</h1></header>
          <nav className="segmented" aria-label={`${u.code} sections`}>
            {UNIT_TABS.map((t) => <a key={t.id} href={href('unit', unitSlug(u.code), t.id)} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>)}
          </nav>
          <AutoRead s={s} unit={u.code} refresh={refresh} />
          {tab === 'topics' && <UnitTopics {...props} unit={u.code} />}
          {tab === 'papers' && <UnitPapers {...props} unit={u.code} />}
          {tab === 'notes' && <UnitNotes {...props} unit={u.code} />}
          {tab === 'sheet' && <div className="sheet-tab"><Kit {...props} unit={u.code} /></div>}
        </>
      );
    } else if (page === 'units') {
      content = <Units {...props} />;
    } else if (page === 'practise') {
      const mode = MODES.some((m) => m.id === r.rest[0]) ? r.rest[0] : 'questions';
      content = (
        <>
          <header className="page-head practise-head"><a className="btn" href={href('deeper')}>Prompt builder</a><h1>Practise</h1><p><span className="num">{pu}</span> · {s.data.units.find((x) => x.code === pu)?.title}</p></header>
          <nav className="segmented" aria-label="Ways to practise">
            {MODES.map((m) => <a key={m.id} href={href('practise', m.id)} aria-current={mode === m.id ? 'page' : undefined}>{m.label}</a>)}
          </nav>
          {mode === 'questions' && <PractiseQuestions key={pu} {...props} />}
          {mode === 'explain' && <Teach {...props} />}
          {mode === 'timed' && <Mock {...props} />}
        </>
      );
    } else if (page === 'deeper') {
      content = <PromptBuilder {...props} target={deeper} />;
    } else if (page === 'focus') {
      content = <Focus {...props} />;
    } else if (page === 'insights') {
      content = <><header className="page-head"><h1>Insights</h1></header><Insights {...props} deeper={setDeeper} /></>;
    } else {
      content = <Today {...props} />;
    }
    return content;
  };
  const key = `${page}/${route.rest.join('/')}${page === 'unit' ? '' : `|${unit}`}`;
  alive.current = [{ key, route, unit, focus }, ...alive.current.filter((x) => x.key !== key)].slice(0, Math.max(1, keptPages()));
  let content = (
    <>
      {alive.current.map((x) => (
        <div key={x.key} className="page" hidden={x.key !== key || undefined}>
          <Guard>{pageFor(x.route, x.unit, x.key === key ? focus : x.focus)}</Guard>
        </div>
      ))}
    </>
  );
  if (bare) {
    content = <Today {...props} />; // whatever the route: there's nothing else to show yet
  }
  const freeMemory = () => { alive.current = alive.current.slice(0, 1); setHeavy(null); setTrimmed((n) => n + 1); };

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      {bare ? (
        <header className="bare-head"><span className="wordmark">Crux</span><a className="navbtn" href={href('settings')} aria-label="Settings"><Icon name="settings" /></a></header>
      ) : <Nav s={s} unit={unit} setUnit={setUnit} page={page} tab={route.rest[1]} />}
      <main className={bare ? 'main bare' : 'main'} id="main" tabIndex={-1}>
          {!bare && (
            <button type="button" className="topsearch" onClick={() => window.dispatchEvent(new Event('crux-search'))} aria-label="Search Crux (Ctrl+K)">
              <Icon name="search" /><span className="topsearch-text">Search units, topics, sub-topics…</span><kbd>Ctrl K</kbd>
            </button>
          )}
          {newer && <p className="notice good" role="status">A new version of Crux is ready. <button type="button" className="btn plain" onClick={() => window.location.reload()}>Load it</button></p>}
          {!online && <p className="notice" role="status">Offline. You're seeing your last saved data. Changes that don't need AI are kept on this device and sent when you're back.</p>}
          {queued > 0 && <p className="notice" role="status"><span className="num">{queued}</span> change{queued === 1 ? '' : 's'} waiting to sync.</p>}
          {problem && (
            <p className="notice bad" role="alert">{problem}{' '}
              {problem.startsWith("Today's AI limit") ? <button className="btn plain" onClick={() => { setProblem(''); setDeeper({ unit }); }}>Go deeper</button> : <button className="btn plain" onClick={refresh}>Try again</button>}
            </p>
          )}
          {heavy && <p className="notice" role="status">Crux is using {heavy.mb} MB of memory with {alive.current.length} pages kept open, which can slow this device down. <button type="button" className="btn plain" onClick={freeMemory}>Close the hidden pages</button></p>}
          {bare ? <Guard>{content}</Guard> : content}
        </main>
      {!bare && page !== 'focus' && <FocusBar />}
      {!bare && <StickyBar s={s} unit={unit} onProblem={setProblem} />}
      {!bare && files.length > 0 && (
        <Suspense fallback={null}>
          <PdfViewer tabs={files} active={activeFile} expanded={fileOpen} jump={jump} marks={s.data.marks} onActivate={activateFile} onCloseTab={closeFile} onCollapse={collapseFile} onPage={filePage} onProblem={setProblem} />
        </Suspense>
      )}
      {settingsOpen && <Settings s={s} user={user} unit={unit} notify={notify} refresh={refresh} onProblem={setProblem} onClose={() => (history.length > 1 ? history.back() : goTo(href('today')))} />}
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
