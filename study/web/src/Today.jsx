import FirstRun from './FirstRun.jsx';
import PasteDates from './PasteDates.jsx';
import { Icon } from './icons.jsx';
import { href, unitSlug } from './route.js';

const daysText = (p) => (p.days == null ? 'TBA' : p.days < 0 ? 'Passed' : p.days === 0 ? 'Today' : `${p.days} day${p.days === 1 ? '' : 's'}`);
const dateText = (iso) => new Date(`${iso}T12:00:00+03:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' });

// Today: the next action as one card with Start, the other actions as a short list, then every unit with its days
// left and stage. Nothing else.
export default function Today({ s, go, refresh, notify }) {
  if (!s.data.units.length) return <FirstRun s={s} refresh={refresh} />;
  const title = Object.fromEntries(s.data.units.map((u) => [u.code, u.title]));
  const strip = s.data.units.map((u) => ({ code: u.code, title: u.title, ...s.units[u.code] })).sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  const week = strip.filter((u) => u.days != null && u.days >= 0 && u.days <= 7).length;
  const [first, ...rest] = s.next;
  const open = (a) => (e) => { e.preventDefault(); go(a.focus.section, a.focus); };
  return (
    <div className="today">
      <header className="page-head">
        <h1>Today</h1>
        <p className="num">{dateText(s.today)} · {week ? `${week} unit${week === 1 ? '' : 's'} with a paper this week` : 'No papers this week'}</p>
      </header>
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
