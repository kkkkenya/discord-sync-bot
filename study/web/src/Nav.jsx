import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';
import { go, href, unitSlug } from './route.js';
import { onSync, push } from './sync.js';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'units', label: 'Units' },
  { id: 'practise', label: 'Practise' },
  { id: 'insights', label: 'Insights' },
];
const ACTIONS = [
  ['Today', href('today')], ['Units', href('units')], ['Practise questions', href('practise', 'questions')],
  ['Explain it', href('practise', 'explain')], ['Timed paper', href('practise', 'timed')], ['Insights', href('insights')],
  ['Focus timer', href('focus')], ['Prompt builder', href('deeper')], ['Settings', href('settings')], ['Wallpaper', href('settings')], ['Import notes', href('settings')], ['Export my data', href('settings')],
];
const inDays = (d) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
const daysText = (d) => (d == null ? 'TBA' : d < 0 ? 'Passed' : d === 0 ? 'Today' : `${d} day${d === 1 ? '' : 's'}`);

function useWide() {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q), on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

// The bell's new material: hub files posted to your units since you last opened the bell. Asked when Crux opens
// and when you come back to it, at most every 15 minutes; the answer is kept on the device in between.
const SEEN = 'crux-inbox-seen', CACHE = 'crux-inbox';
const stored = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
function useInbox() {
  const [inbox, setInbox] = useState(() => { try { return JSON.parse(stored(CACHE)) || {}; } catch { return {}; } });
  useEffect(() => {
    const check = () => {
      let cached = null;
      try { cached = JSON.parse(stored(CACHE)); } catch { /* none yet */ }
      if (cached && Date.now() - cached.at < 15 * 60e3) return;
      const since = stored(SEEN) || new Date(Date.now() - 7 * 864e5).toISOString();
      api('GET', `inbox?since=${encodeURIComponent(since)}`).then((r) => {
        const next = { at: Date.now(), files: r.files, announcements: r.announcements || [] };
        setInbox(next);
        try { localStorage.setItem(CACHE, JSON.stringify(next)); } catch { /* private window */ }
      }).catch(() => { /* offline: try again next time */ });
    };
    check();
    const back = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);
  return { files: inbox.files || [], announcements: inbox.announcements || [] };
}

// units whose hub files Crux has read: "EMM 302 is ready", newest first
const readyUnits = (library = {}) => {
  const by = new Map();
  for (const e of Object.values(library)) {
    if (!e.chars || !e.at) continue;
    const u = by.get(e.unit) || { unit: e.unit, count: 0, latest: e.at };
    u.count += 1; if (e.at > u.latest) u.latest = e.at;
    by.set(e.unit, u);
  }
  return [...by.values()].sort((a, b) => b.latest.localeCompare(a.latest));
};

// Slides the pale pill under the current tab. Widths come from each label, so it follows the font.
function useIndicator(ref, page, vertical) {
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const tabs = [...el.querySelectorAll('.tab')], ind = el.querySelector('.ind');
      const i = tabs.findIndex((t) => t.getAttribute('aria-current') === 'page');
      const full = (t) => 44 + t.querySelector('.lab').scrollWidth + 7;
      ind.style.opacity = i < 0 ? 0 : 1;
      if (i < 0) return;
      if (vertical) { ind.style.top = `${tabs[i].offsetTop}px`; ind.style.width = `${full(tabs[i])}px`; return; }
      let left = 4;
      tabs.forEach((t, j) => { const w = j === i ? full(t) : 44; t.style.width = `${w}px`; if (j < i) left += w; });
      ind.style.left = `${left}px`; ind.style.width = `${full(tabs[i])}px`;
    };
    place();
    document.fonts?.ready.then(place);
  }, [ref, page, vertical]);
}

// The nav. Phones: glass top bar (unit, search, bell, account) and a floating tab pill. 768px+: a floating rail.
// Search and the bell open a glass panel; Esc or a tap elsewhere closes it.
export default function Nav({ s, unit, setUnit, page, tab }) {
  const wide = useWide();
  const unitTitle = s.data.units.find((u) => u.code === unit)?.title || '';
  const [open, setOpen] = useState(null); // 'unit' | 'search' | 'bell'
  const [query, setQuery] = useState('');
  const pill = useRef(null), rail = useRef(null);
  useIndicator(pill, page, false);
  useIndicator(rail, page, true);
  // picking a unit keeps you where you are: a unit page moves to the same tab of the new unit, other pages just follow it
  const pickUnit = (code) => { setUnit(code); setOpen(null); if (page === 'unit') go(href('unit', unitSlug(code), tab || 'topics')); };
  const toggle = (what) => { setOpen((o) => (o === what ? null : what)); setQuery(''); };
  useEffect(() => { setOpen(null); }, [page, unit]);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => { if (e.key === 'Escape') setOpen(null); };
    const away = (e) => { if (!e.target.closest('.panel, .topbar, .rail')) setOpen(null); };
    document.addEventListener('keydown', esc); document.addEventListener('pointerdown', away);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', away); };
  }, [open]);

  const units = s.data.units.map((u) => ({ ...u, ...s.units[u.code] })).sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  const soon = units.filter((u) => u.days != null && u.days >= 0 && u.days <= 7);
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem('crux-bell-seen'); } catch { return null; } });
  const { files, announcements } = useInbox();
  const [filesSeen, setFilesSeen] = useState(() => stored(SEEN) || '');
  const [openedAt, setOpenedAt] = useState(''); // what was unseen when the bell opened, so it stays listed while open
  const readyShown = readyUnits(s.library).filter((r) => r.latest > (openedAt || new Date(Date.now() - 7 * 864e5).toISOString())).slice(0, 3);
  const ready = readyUnits(s.library).filter((r) => r.latest > (filesSeen || new Date(Date.now() - 7 * 864e5).toISOString())).slice(0, 3);
  const unread = (soon.length > 0 && seen !== s.today) || files.some((f) => f.latest > filesSeen) || announcements.some((a) => a.created_at > filesSeen) || ready.length > 0;
  useEffect(() => {
    onSync('bellSeen', (v) => { try { localStorage.setItem('crux-bell-seen', v); } catch { /* private window */ } setSeen(v); });
    onSync('inboxSeen', (v) => { try { localStorage.setItem(SEEN, v); } catch { /* private window */ } setFilesSeen(v); });
  }, []);
  const openBell = () => {
    toggle('bell');
    const now = new Date().toISOString();
    try { localStorage.setItem('crux-bell-seen', s.today); localStorage.setItem(SEEN, now); } catch { /* private window */ }
    setOpenedAt(filesSeen);
    setSeen(s.today); setFilesSeen(now);
    push('bellSeen', s.today); push('inboxSeen', now);
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const has = (t) => String(t || '').toLowerCase().includes(q);
    return [
      ...s.data.units.filter((u) => has(u.code) || has(u.title)).map((u) => ({ icon: 'units', label: u.code, sub: u.title, to: href('unit', unitSlug(u.code), 'topics') })),
      ...s.data.topics.filter((t) => has(t.name)).map((t) => ({ icon: 'practise', label: t.name, sub: t.unit, to: href('unit', unitSlug(t.unit), 'topics') })),
      ...ACTIONS.filter(([l]) => has(l)).map(([l, to]) => ({ icon: 'chevron', label: l, sub: 'Go to', to })),
    ].slice(0, 8);
  }, [query, s.data.units, s.data.topics]);

  const searchBox = (
    <form className={`searchbox${wide ? ' inpanel' : ''}`} role="search" onSubmit={(e) => { e.preventDefault(); if (results[0]) { go(results[0].to); setOpen(null); } }}>
      <Icon name="search" />
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Units, topics, actions" aria-label="Search Crux" autoFocus />
    </form>
  );
  const bellBtn = (
    <button className="navbtn" type="button" aria-label={unread ? 'Notifications, new' : 'Notifications'} aria-expanded={open === 'bell'} onClick={openBell} data-tip="Notifications">
      <Icon name="bell" />{unread && <span className="dotbadge" />}
    </button>
  );

  return (
    <>
      <header className="topbar glass">
        {open === 'search' && !wide ? searchBox : (
          <>
            <button className="unitpill" type="button" aria-expanded={open === 'unit'} aria-label={`${unit} ${unitTitle}, change unit`} onClick={() => toggle('unit')}>
              <span className="udot" /><span className="num">{unit}</span>{' '}<span className="uname">{unitTitle}</span><Icon name="down" />
            </button>
            <span className="spacer" />
          </>
        )}
        {open !== 'search' && <a className="navbtn" href={href('focus')} aria-label="Focus timer" aria-current={page === 'focus' ? 'page' : undefined}><Icon name="timer" /></a>}
        <button className="navbtn" type="button" aria-label={open === 'search' ? 'Close search' : 'Search'} aria-expanded={open === 'search'} onClick={() => toggle('search')}>
          <Icon name={open === 'search' ? 'close' : 'search'} />
        </button>
        {bellBtn}
        <a className="navbtn" href={href('settings')} aria-label="Settings"><Icon name="user" /></a>
      </header>

      <nav className="tabpill glass" aria-label="Sections" ref={pill}>
        <span className="ind" />
        {TABS.map((t) => <a key={t.id} className="tab" href={href(t.id)} aria-current={page === t.id || (t.id === 'units' && page === 'unit') ? 'page' : undefined}><Icon name={t.id} /><span className="lab">{t.label}</span></a>)}
      </nav>

      <nav className="rail glass" aria-label="Sections" ref={rail}>
        <button className="railunit num" type="button" aria-expanded={open === 'unit'} aria-label={`${unit} ${unitTitle}, change unit`} onClick={() => toggle('unit')} data-tip={`${unit} · ${unitTitle}`}>{unit.split(' ').pop()}</button>
        <span className="ind" />
        {TABS.map((t) => <a key={t.id} className="tab" href={href(t.id)} data-tip={t.label} aria-current={page === t.id || (t.id === 'units' && page === 'unit') ? 'page' : undefined}><Icon name={t.id} /><span className="lab">{t.label}</span></a>)}
        <span className="sep" />
        <a className="navbtn" href={href('focus')} aria-label="Focus timer" data-tip="Focus" aria-current={page === 'focus' ? 'page' : undefined}><Icon name="timer" /></a>
        <a className="navbtn" href={href('deeper')} aria-label="Prompt builder" data-tip="Prompt builder" aria-current={page === 'deeper' ? 'page' : undefined}><Icon name="prompt" /></a>
        <button className="navbtn" type="button" aria-label="Search" aria-expanded={open === 'search'} onClick={() => toggle('search')} data-tip="Search"><Icon name="search" /></button>
        {bellBtn}
        <a className="navbtn" href={href('settings')} aria-label="Settings" data-tip="Settings"><Icon name="settings" /></a>
      </nav>

      {open === 'unit' && (
        <div className="panel glass" role="dialog" aria-label="Your units">
          <h2>Your units</h2>
          {units.map((u) => (
            <button key={u.code} type="button" className="row" aria-current={u.code === unit ? 'true' : undefined} onClick={() => pickUnit(u.code)}>
              <span className={`dot ${u.stage?.id || ''}`} aria-hidden="true" />
              <span className="row-main"><b className="num">{u.code}</b><span className="row-sub">{u.title}</span></span>
              <span className="row-sub num">{daysText(u.days)}</span>
            </button>
          ))}
          <a className="row" href={href('units')}><span className="row-main">Add or change units</span><Icon name="chevron" /></a>
        </div>
      )}
      {open === 'search' && (
        <div className="panel glass" role="dialog" aria-label="Search">
          {wide && searchBox}
          {!query.trim() && <p className="none">Type a unit code, a topic or what you want to do, like “export”.</p>}
          {query.trim() && !results.length && <p className="none">Nothing matches “{query.trim()}”.</p>}
          {results.map((r) => (
            <a key={r.to + r.label} className="row" href={r.to} onClick={() => setOpen(null)}>
              <span className="ricon"><Icon name={r.icon} /></span>
              <span className="row-main"><span>{r.label}</span><span className="row-sub">{r.sub}</span></span>
            </a>
          ))}
        </div>
      )}
      {open === 'bell' && (
        <div className="panel glass" role="dialog" aria-label="Notifications">
          {announcements.length > 0 && <h2>From the Hub</h2>}
          {announcements.map((a) => (
            <div key={a.id} className="row">
              <span className="ricon"><Icon name="bell" /></span>
              <span className="row-main"><span>{a.body}</span><span className="row-sub num">{a.created_at.slice(0, 10)}</span></span>
            </div>
          ))}
          {readyShown.length > 0 && <h2>Ready</h2>}
          {readyShown.map((r) => (
            <a key={r.unit} className="row" href={href('unit', unitSlug(r.unit), 'topics')}>
              <span className="ricon"><Icon name="check" /></span>
              <span className="row-main"><span><b className="num">{r.unit}</b> is ready</span><span className="row-sub"><span className="num">{r.count}</span> files read</span></span>
            </a>
          ))}
          {files.length > 0 && <h2>New material</h2>}
          {files.map((f) => (
            <a key={f.unit} className="row" href={href('unit', unitSlug(f.unit), 'notes')}>
              <span className="ricon"><Icon name="file" /></span>
              <span className="row-main"><span><b className="num">{f.count}</b> new file{f.count === 1 ? '' : 's'} in <b className="num">{f.unit}</b></span><span className="row-sub">{f.names.join(', ')}</span></span>
            </a>
          ))}
          <h2>Coming up</h2>
          {!soon.length && <p className="none">Nothing in the next 7 days.</p>}
          {soon.map((u) => (
            <a key={u.code} className="row" href={href('unit', unitSlug(u.code), 'topics')}>
              <span className="ricon"><Icon name="calendar" /></span>
              <span className="row-main"><span><b className="num">{u.code}</b> {inDays(u.days)}</span><span className="row-sub">{u.title}{u.stage ? ` · ${u.stage.name}` : ''}</span></span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
