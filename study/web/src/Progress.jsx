import { pct } from './api.js';

const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short' });

function WeekBars({ s }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(s.today, i - 6));
  const minutes = days.map((d) => s.data.sessions.filter((x) => dayOf(x.at) === d).reduce((n, x) => n + x.minutes, 0));
  const max = Math.max(30, ...minutes);
  return (
    <div className="bars" role="img" aria-label={`Study minutes for the last 7 days, most recent ${minutes.at(-1)} minutes`}>
      {days.map((d, i) => (
        <div className="barbar" key={d}>
          <span className="bv muted small">{minutes[i] ? `${minutes[i]}m` : ''}</span>
          <span className="btrack"><i style={{ height: `${Math.round((minutes[i] / max) * 100)}%` }} className={d === s.today ? 'today' : ''} /></span>
          <span className={`bl ${d === s.today ? 'today' : 'muted'}`}>{dow(d)}</span>
        </div>
      ))}
    </div>
  );
}

function PaperTrend({ s }) {
  const rows = [...s.data.papers].sort((a, b) => a.at.localeCompare(b.at)).slice(-12);
  if (rows.length < 2) return <p className="muted small">Log two or more past papers to see your trend.</p>;
  const pts = rows.map((p, i) => ({ x: (i / (rows.length - 1)) * 100, y: 42 - (pct(p) / 100) * 40, p }));
  return (
    <div>
      <svg viewBox="0 0 100 46" className="line" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="21" x2="100" y2="21" className="axis" />
        <line x1="0" y1="42" x2="100" y2="42" className="axis" />
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="path" />
        {pts.map((p) => <circle key={p.p.id} cx={p.x} cy={p.y} r="1.6" className="dot" />)}
      </svg>
      <div className="linekeys">
        <span className="muted small">oldest</span>
        <span className="muted small">{pts[0].p.at.slice(0, 10)} → {pts.at(-1).p.at.slice(0, 10)}</span>
        <span className="muted small">newest</span>
      </div>
    </div>
  );
}

function Mastery({ s }) {
  const units = s.data.units.map((u) => {
    const topics = s.data.topics.filter((t) => t.unit === u.code);
    const status = (t) => s.mastery?.[t.id]?.status || 'red';
    const green = topics.filter((t) => status(t) === 'green').length;
    const amber = topics.filter((t) => status(t) === 'amber').length;
    const red = topics.filter((t) => status(t) === 'red').length;
    const covered = topics.length ? Math.round(((green + amber * 0.5) / topics.length) * 100) : 0;
    return { u, topics, green, amber, red, covered };
  });
  return (
    <div className="mastery">
      {units.map(({ u, topics, green, amber, red, covered }) => (
        <div className="mrow" key={u.code}>
          <div className="mhead"><span className="code">{u.code}</span> <span className="muted small">{topics.length ? `${covered}% of ${topics.length} topic${topics.length === 1 ? '' : 's'} covered` : 'no topics listed yet'}</span></div>
          {topics.length > 0 && (
            <div className="mbar" role="img" aria-label={`${u.code}: ${covered}% covered`}>
              <i className="seg-g" style={{ width: `${green / topics.length * 100}%` }} />
              <i className="seg-a" style={{ width: `${amber / topics.length * 100}%` }} />
              <i className="seg-r" style={{ width: `${red / topics.length * 100}%` }} />
            </div>
          )}
        </div>
      ))}
      <p className="muted small"><span className="ok">green</span> can teach it · <span className="warm">amber</span> getting there · <span className="hot">red</span> not yet. Add and rate topics in Units.</p>
    </div>
  );
}

export default function Progress({ s }) {
  const mins = Object.entries(s.stats.minutesWeek).sort((a, b) => b[1] - a[1]);
  const mocks = s.data.mocks.filter((m) => m.score != null);
  const avgMock = mocks.length ? Math.round(mocks.reduce((n, m) => n + (m.score / m.outOf) * 100, 0) / mocks.length) : null;
  const papers = s.data.papers.length;
  const broke = s.data.attempts.filter((a) => a.verdict === 'wrong').length;

  return (
    <section id="progress" className="reveal">
      <div className="head"><h2>Progress</h2></div>

      <dl className="tiles">
        <div><dt>Topics</dt><dd>{s.data.topics.length}</dd></div>
        <div><dt>Answers checked</dt><dd>{s.data.attempts.length}{broke > 0 && <span className="muted small"> · {broke} broke</span>}</dd></div>
        <div><dt>Teach-backs</dt><dd>{s.data.teach.length}</dd></div>
        <div><dt>Papers</dt><dd>{papers}</dd></div>
      </dl>

      <h4>Study time, last 7 days</h4>
      <WeekBars s={s} />

      <div className="col2">
        <div>
          <h4>This week by unit</h4>
          {mins.length ? mins.map(([code, m]) => (
            <div className="mrow" key={code}>
              <span className="code">{code}</span>
              <span className="bar" style={{ '--w': `${Math.min(100, m / 3)}%` }} />
              <span className="muted small">{Math.round(m / 6) / 10}h</span>
            </div>
          )) : <p className="muted small">No sessions logged this week. Start the focus timer.</p>}
        </div>
        <div>
          <h4>Past-paper scores</h4>
          <PaperTrend s={s} />
          {avgMock !== null && <p className="muted small">Mock average: <b className="ok">{avgMock}%</b> across {mocks.length} mock{mocks.length === 1 ? '' : 's'}.</p>}
        </div>
      </div>

      <h4>Syllabus coverage</h4>
      <Mastery s={s} />
    </section>
  );
}
