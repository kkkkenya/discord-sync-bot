import FirstRun from './FirstRun.jsx';
import { Icon } from './icons.jsx';
import { href, unitSlug } from './route.js';

const daysText = (p) => (p.days == null ? 'TBA' : p.days < 0 ? 'Passed' : p.days === 0 ? 'Today' : `${p.days} day${p.days === 1 ? '' : 's'}`);

// Today: up to 3 next actions, then every unit with its days left and stage. Nothing else.
export default function Today({ s, go, refresh }) {
  if (!s.data.units.length) return <FirstRun s={s} refresh={refresh} />;
  const strip = s.data.units.map((u) => ({ code: u.code, ...s.units[u.code] })).sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  return (
    <>
      <header className="page-head"><h1>Today</h1></header>
      <div>
        <h2 className="list-title">Next</h2>
        <div className="list">
          {s.next.map((a) => (
            <a key={a.unit + a.label} className="list-row" href={a.href} onClick={(e) => { e.preventDefault(); go(a.focus.section, a.focus); }}>
              <span className="row-main">
                <span>{a.label}</span>
                <span className="row-sub">{a.reason}</span>
              </span>
              <span className="row-sub">{a.minutes} min</span>
              <span className="chev"><Icon name="chevron" /></span>
            </a>
          ))}
        </div>
      </div>
      <div>
        <h2 className="list-title">Units</h2>
        <ul className="strip">
          {strip.map((u) => (
            <li key={u.code}>
              <a href={href('unit', unitSlug(u.code), 'topics')}>
                <span className={`dot ${u.stage.id}`} aria-hidden="true" />
                <b>{u.code}</b>
                <span className="row-sub">{daysText(u)}<span className="visually-hidden">, {u.stage.name}</span></span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
