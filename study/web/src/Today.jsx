import FirstRun from './FirstRun.jsx';
import PasteDates from './PasteDates.jsx';
import { Icon } from './icons.jsx';
import { InstallNote } from './Install.jsx';
import { href, unitSlug } from './route.js';

const daysText = (p) => (p.days == null ? 'TBA' : p.days < 0 ? 'Passed' : p.days === 0 ? 'Today' : `${p.days} day${p.days === 1 ? '' : 's'}`);
const dateText = (iso) => new Date(`${iso}T12:00:00+03:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' });

// "Good morning" by the clock in Nairobi
const greeting = () => {
  const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Nairobi' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const agoText = (n) => (n == null ? 'Not started' : n >= 14 ? `${Math.floor(n / 7)} weeks ago` : `${n} days ago`);

// Today: a greeting, then what's urgent (a paper within 3 days and what to do for it), the next action with Start,
// the rest as a short list, then three small boards (dates ahead, weak spots, not revised lately) and every unit.
export default function Today({ s, go, refresh, notify, user }) {
  if (!s.data.units.length) return <FirstRun s={s} refresh={refresh} />;
  const title = Object.fromEntries(s.data.units.map((u) => [u.code, u.title]));
  const strip = s.data.units.map((u) => ({ code: u.code, title: u.title, ...s.units[u.code] })).sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  const week = strip.filter((u) => u.days != null && u.days >= 0 && u.days <= 7).length;
  const board = s.board || { urgent: [], dates: [], weak: [], stale: [] };
  const urgentSet = new Set(board.urgent);
  const urgentActs = s.next.filter((a) => urgentSet.has(a.unit));
  const [first, ...rest] = s.next.filter((a) => !urgentSet.has(a.unit));
  const open = (a) => (e) => { e.preventDefault(); go(a.focus.section, a.focus); };
  const name = (user?.name || '').split(/\s+/)[0];
  return (
    <div className="today">
      <header className="page-head today-head">
        {user && (user.avatar
          ? <img className="today-avatar" src={user.avatar} alt="" width="48" height="48" />
          : <span className="today-avatar initials" aria-hidden="true">{(user.name || '?').slice(0, 1).toUpperCase()}</span>)}
        <div>
          <h1>{greeting()}{name ? `, ${name}` : ''}</h1>
          <p className="num">{dateText(s.today)} · {week ? `${week} unit${week === 1 ? '' : 's'} with a paper this week` : 'No papers this week'}</p>
        </div>
      </header>
      <InstallNote notify={notify} />
      {board.urgent.length > 0 && (
        <section className="card urgent" aria-labelledby="urgent-title">
          <h2 className="card-title" id="urgent-title"><Icon name="bell" /> Urgent</h2>
          <ul className="urgent-list">
            {board.dates.filter((d) => urgentSet.has(d.unit)).map((d) => (
              <li key={d.unit}>
                <span className="row-main"><span><b className="num">{d.unit}</b> · {d.title}</span><span className="row-sub">{d.days === 0 ? 'Paper today' : `Paper in ${d.days} day${d.days === 1 ? '' : 's'}`} · {dateText(d.date)}</span></span>
                {urgentActs.filter((a) => a.unit === d.unit).slice(0, 2).map((a) => (
                  <a key={a.label} className="btn primary" href={a.href} onClick={open(a)}>{a.label}</a>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      {first && (
        <div>
          <h2 className="list-title" id="next-title">Next up</h2>
          <section className="card nextup" aria-labelledby="next-title">
            <span className="eyebrow"><span className="udot" /><span><span className="num">{first.unit}</span> · {title[first.unit]}</span></span>
            <h3>{first.label}</h3>
            <p className="row-sub">{first.reason}</p>
            <div className="nextup-foot">
              <span className="row-sub num">{first.minutes} min</span>
              <a className="btn primary" href={first.href} onClick={open(first)}>Start</a>
            </div>
          </section>
        </div>
      )}
      {rest.length > 0 && (
        <div>
          <h2 className="list-title">After that</h2>
          <div className="list">
            {rest.map((a) => (
              <a key={a.unit + a.label} className="list-row" href={a.href} onClick={open(a)}>
                <span className="row-main">
                  <span>{a.label}</span>
                  <span className="row-sub">{title[a.unit]} · {a.reason}</span>
                </span>
                <span className="row-sub num">{a.minutes} min</span>
                <span className="chev"><Icon name="chevron" /></span>
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="today-boards">
        <section className="card board" aria-labelledby="dates-title">
          <h2 className="card-title" id="dates-title"><Icon name="calendar" /> Coming up</h2>
          {board.dates.length ? (
            <ul className="board-list">
              {board.dates.slice(0, 6).map((d) => (
                <li key={d.unit}><span className="row-main"><b className="num">{d.unit}</b><span className="row-sub">{dateText(d.date)}</span></span><span className={`chip num${d.days <= 3 ? ' bad' : d.days <= 7 ? ' warn' : ''}`}>{d.days === 0 ? 'Today' : `${d.days}d`}</span></li>
              ))}
            </ul>
          ) : <p className="muted small">No CAT or exam dates yet. Paste them below.</p>}
        </section>
        <section className="card board" aria-labelledby="weak-title">
          <h2 className="card-title" id="weak-title"><Icon name="insights" /> Weak spots</h2>
          {board.weak.length ? (
            <ul className="board-list">
              {board.weak.map((w) => (
                <li key={w.subtopicId}><button type="button" className="board-row" onClick={() => go('learn', { unit: w.unit, topicId: w.topicId })}>
                  <span className="row-main"><span>{w.name}</span><span className="row-sub"><span className="num">{w.unit}</span> · {w.topic}</span></span>
                </button></li>
              ))}
            </ul>
          ) : <p className="muted small">None yet. They show up as you rate sub-topics and check answers.</p>}
        </section>
        <section className="card board" aria-labelledby="stale-title">
          <h2 className="card-title" id="stale-title"><Icon name="timer" /> Not revised lately</h2>
          {board.stale.length ? (
            <ul className="board-list">
              {board.stale.map((t) => (
                <li key={t.topicId}><button type="button" className="board-row" onClick={() => go('learn', { unit: t.unit, topicId: t.topicId })}>
                  <span className="row-main"><span>{t.name}</span><span className="row-sub"><span className="num">{t.unit}</span> · {agoText(t.ago)}</span></span>
                </button></li>
              ))}
            </ul>
          ) : <p className="muted small">You've been over everything in the last 10 days.</p>}
        </section>
      </div>
      <div className="units-block">
        <h2 className="list-title">Units</h2>
        <ul className="strip">
          {strip.map((u) => (
            <li key={u.code}>
              <a href={href('unit', unitSlug(u.code), 'topics')}>
                <span className={`dot ${u.stage.id}`} aria-hidden="true" />
                <b className="num">{u.code}</b>
                <span className="row-sub uname">{u.title}</span>
                <span className="row-sub num">{daysText(u)}<span className="visually-hidden">, {u.stage.name}</span></span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <PasteDates s={s} refresh={refresh} notify={notify} />
    </div>
  );
}
