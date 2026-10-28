import { useEffect, useRef, useState } from 'react';
import { api, questEvent } from './api.js';

// The sections, grouped the way a study day runs. `inside` is what the menu lists under each section.
export const GROUPS = [
  { id: 'today', label: 'Today', blurb: 'Where you stand, and the next thing to do.', art: 'gauge', items: [
    { id: 'overview', name: 'Overview', inside: ['CAT countdown', 'Study stage of each unit', 'Streak and hours this week'] },
    { id: 'today', name: 'Today’s plan', inside: ['Up to 3 tasks, weakest and soonest unit first', 'Each one opens the right section'] },
  ] },
  { id: 'plan', label: 'Plan', blurb: 'What your units cover and what the exam is likely to ask.', art: 'gears', items: [
    { id: 'units', name: 'Units', inside: ['CAT dates, or TBA', 'Topics: suggest from your outline', 'Server files and sync'] },
    { id: 'predictions', name: 'Predict', inside: ['Topics ranked by exam weight', 'Lecturer hints', 'Past-paper questions by topic'] },
    { id: 'analysis', name: 'Weakspots', inside: ['Fix first: weight × weakness', 'How you lose marks', 'Sub-topic audit'] },
  ] },
  { id: 'practise', label: 'Practise', blurb: 'Closed book first, then check where it broke.', art: 'beam', items: [
    { id: 'kit', name: 'Study kit', inside: ['Made for the unit’s stage', 'Ladders, recipes, a one-page formula sheet'] },
    { id: 'practice', name: 'Check answer', inside: ['Final answer with its unit', 'Numbered checkpoints', 'Broke here → weakspots'] },
    { id: 'teach', name: 'Teach it back', inside: ['Explain a topic, get it marked', 'Gaps become sub-topics'] },
    { id: 'mock', name: 'Mock exam', inside: ['Timed at 1.5 minutes a mark', 'Predicted mock from past papers'] },
    { id: 'notes', name: 'Questions from your notes', inside: ['Inside Mock exam: paste notes, get CAT questions'] },
    { id: 'papers', name: 'Past papers', inside: ['Log a paper score', 'Average per unit'] },
  ] },
  { id: 'review', label: 'Review', blurb: 'Take it to a stronger AI, and see the trend.', art: 'chart', items: [
    { id: 'prompt', name: 'Prompt Builder', inside: ['Context pack (.md) to attach', 'Quick prompts'] },
    { id: 'progress', name: 'Progress', inside: ['Study time, 7 days', 'Paper scores', 'Syllabus coverage'] },
  ] },
];

// Blueprint-style line drawings, one per group: they inherit the theme's ink and accent colours.
function Art({ kind }) {
  const tick = (cx, cy, r1, r2, n, from = 0, to = 360) => Array.from({ length: n }, (_, i) => {
    const a = ((from + ((to - from) * i) / (n - 1 || 1)) * Math.PI) / 180;
    return <line key={i} x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)} x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)} />;
  });
  const gear = (cx, cy, r, teeth) => (
    <g>
      <circle cx={cx} cy={cy} r={r} /><circle cx={cx} cy={cy} r={r * 0.32} />
      {tick(cx, cy, r, r + 9, teeth, 0, 360 - 360 / teeth)}
      <line x1={cx - r * 0.7} y1={cy} x2={cx + r * 0.7} y2={cy} className="thin" /><line x1={cx} y1={cy - r * 0.7} x2={cx} y2={cy + r * 0.7} className="thin" />
    </g>
  );
  return (
    <svg viewBox="0 0 240 160" className="art" aria-hidden="true">
      {kind === 'gauge' && (
        <g>
          <path d="M40 120 A80 80 0 0 1 200 120" /><path d="M58 120 A62 62 0 0 1 182 120" className="thin" />
          <g className="thin">{tick(120, 120, 62, 74, 13, 180, 360)}</g>
          <line x1="120" y1="120" x2="168" y2="76" className="hot" /><circle cx="120" cy="120" r="6" className="fillhot" />
          <text x="120" y="146" textAnchor="middle">DAYS TO CAT</text>
        </g>
      )}
      {kind === 'gears' && (
        <g>
          {gear(86, 84, 38, 14)}{gear(160, 66, 24, 10)}
          <g className="thin"><line x1="40" y1="140" x2="200" y2="140" /><line x1="40" y1="134" x2="40" y2="146" /><line x1="200" y1="134" x2="200" y2="146" /></g>
          <text x="120" y="154" textAnchor="middle">UNIT · TOPICS · WEIGHT</text>
        </g>
      )}
      {kind === 'beam' && (
        <g>
          <rect x="30" y="70" width="180" height="14" rx="2" />
          <path d="M40 84 l-10 18 h20 z" /><circle cx="200" cy="93" r="9" /><line x1="22" y1="102" x2="58" y2="102" className="thin" /><line x1="186" y1="102" x2="214" y2="102" className="thin" />
          <line x1="120" y1="22" x2="120" y2="64" className="hot" /><path d="M113 56 l7 12 l7 -12" className="hot" />
          <text x="128" y="34">F</text>
          <g className="thin"><line x1="30" y1="122" x2="210" y2="122" /><line x1="30" y1="116" x2="30" y2="128" /><line x1="120" y1="116" x2="120" y2="128" /><line x1="210" y1="116" x2="210" y2="128" /></g>
          <text x="75" y="142" textAnchor="middle">L/2</text><text x="165" y="142" textAnchor="middle">L/2</text>
        </g>
      )}
      {kind === 'chart' && (
        <g>
          <path d="M34 20 V130 H214" />
          <g className="thin">{[40, 70, 100].map((y) => <line key={y} x1="34" y1={y} x2="214" y2={y} strokeDasharray="3 4" />)}</g>
          <polyline points="44,112 74,98 104,104 134,78 164,70 194,46" className="hot" />
          {[[44, 112], [74, 98], [104, 104], [134, 78], [164, 70], [194, 46]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" className="fillhot" />)}
          <text x="124" y="150" textAnchor="middle">PAPER SCORES →</text>
        </g>
      )}
    </svg>
  );
}

// The top bar: clear at the top of the page, frosted glass once you scroll (App toggles .glass). Hovering or
// focusing a group opens a panel: its sections and what's inside them on one side, a drawing on the other.
// Below 900px it's a Menu button and a full sheet.
export default function Nav({ s, go, refresh, unit, setUnit, onTour, onProblem }) {
  const [open, setOpen] = useState(null); // a group id, 'settings', or 'sheet'
  const [hot, setHot] = useState(null); // the section under the pointer, for the panel's caption
  const timer = useRef(0);
  const bar = useRef(null);
  const later = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen((o) => (o === 'sheet' ? o : null)), 160); };
  const now = (id) => { clearTimeout(timer.current); setOpen(id); setHot(null); if (id !== 'settings') questEvent('nav-open'); };
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') setOpen(null); };
    const away = (e) => { if (bar.current && !bar.current.contains(e.target)) setOpen(null); };
    document.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', away);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', away); };
  }, []);
  useEffect(() => { document.body.style.overflow = open === 'sheet' ? 'hidden' : ''; }, [open]);

  const visit = (id) => { setOpen(null); go(id); };
  const group = GROUPS.find((g) => g.id === open);
  const setting = (body) => api('POST', 'settings', body).then(refresh).catch((e) => onProblem(e.message));
  const settings = (
    <div className="settings">
      <label className="small">Study stage
        <select value={s.settings.stage || ''} onChange={(e) => setting({ stage: e.target.value || null })}
          title={`Stages now: ${s.stageMix.map((m) => `${m.n} ${m.name}`).join(', ') || 'no units'}. A unit's own stage (in Units) wins over this.`}>
          <option value="">Auto, from each unit's date</option>
          {s.stages.map((st) => <option key={st.id} value={st.id}>All units: {st.name}</option>)}
        </select>
      </label>
      <label className="small">AI provider
        <select value={s.settings.aiProvider} onChange={(e) => setting({ aiProvider: e.target.value })}>
          <option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option><option value="anthropic">Claude</option>
        </select>
      </label>
      <p className={`small ${s.ai ? 'muted' : 'warm'}`}>{s.ai ? `AI ready (${s.provider}).` : `No key for ${s.provider}. Pick another provider or add the key with setup.bat.`}</p>
      <button className="link small" onClick={() => { setOpen(null); onTour(); }}>{s.settings.quest?.off ? 'Show the tutorial quests' : 'Tutorial quests are on (bottom left)'}</button>
    </div>
  );
  const unitPick = s.data.units.length > 0 && (
    <select className="unitpick" value={unit} onChange={(e) => { setUnit(e.target.value); questEvent('unit-pick'); }} aria-label="Current unit (every section follows it)" title="Every section follows this unit">
      {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code} {u.title}</option>)}
    </select>
  );

  return (
    <header className="top" ref={bar} onMouseLeave={later} onMouseEnter={() => clearTimeout(timer.current)}>
      <div className="shell top-in">
        <button className="brand" onClick={() => visit('overview')} aria-label="Study Desk: back to the top">
          <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" /><path d="M16 9v8l5 3" /></svg>
          <span><b>Study Desk</b><small>Engineering Study Hub</small></span>
        </button>
        <nav className="groups" aria-label="Sections">
          {GROUPS.map((g) => (
            <button key={g.id} className={open === g.id ? 'on' : ''} aria-expanded={open === g.id} aria-controls="navpanel"
              onMouseEnter={() => now(g.id)} onFocus={() => now(g.id)} onClick={() => (open === g.id ? setOpen(null) : now(g.id))}>
              {g.label}<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg>
            </button>
          ))}
        </nav>
        <div className="tools">
          {unitPick}
          <button className={`iconbtn${open === 'settings' ? ' on' : ''}${s.ai ? '' : ' warn'}`} aria-expanded={open === 'settings'} aria-label="Settings: study stage and AI provider" title="Settings" onClick={() => (open === 'settings' ? setOpen(null) : now('settings'))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></svg>
          </button>
          <button className="menubtn" aria-expanded={open === 'sheet'} onClick={() => { if (open !== 'sheet') questEvent('nav-open'); setOpen(open === 'sheet' ? null : 'sheet'); }}>{open === 'sheet' ? 'Close' : 'Menu'}</button>
        </div>
      </div>

      {group && (
        <div className="navpanel" id="navpanel" role="region" aria-label={`${group.label} sections`}>
          <div className="shell navpanel-in">
            <div className="navlist">
              <p className="eyebrow">{group.label} · {group.blurb}</p>
              <ul>
                {group.items.map((it) => (
                  <li key={it.id}>
                    <button onClick={() => visit(it.id)} onMouseEnter={() => setHot(it)} onFocus={() => setHot(it)}>
                      <b>{it.name}</b>
                      <span>{it.inside.join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <figure className="navart">
              <Art kind={group.art} />
              <figcaption className="small">{hot ? <><b>{hot.name}:</b> {hot.inside.join(', ')}.</> : group.blurb}</figcaption>
            </figure>
          </div>
        </div>
      )}
      {open === 'settings' && <div className="navpanel narrow"><div className="shell"><div className="popover">{settings}</div></div></div>}
      {open === 'sheet' && (
        <div className="sheet" role="dialog" aria-label="Sections">
          {unitPick}
          {GROUPS.map((g) => (
            <div key={g.id} className="sheetgroup">
              <p className="eyebrow">{g.label}</p>
              {g.items.map((it) => <button key={it.id} onClick={() => visit(it.id)}><b>{it.name}</b><span>{it.inside.join(' · ')}</span></button>)}
            </div>
          ))}
          <div className="sheetgroup"><p className="eyebrow">Settings</p>{settings}</div>
        </div>
      )}
    </header>
  );
}
