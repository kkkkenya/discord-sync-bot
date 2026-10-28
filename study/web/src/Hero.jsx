import { useState } from 'react';
import { api, daysUntil } from './api.js';
import CountUp from './components/CountUp.jsx';

// The countdown is to the nearest real date: a unit's own CAT/exam date, or the KU calendar for units that have
// no date of their own. TBA units (the strike) count down to nothing.
function nextDate(s) {
  const own = s.data.units
    .filter((u) => /^\d{4}-/.test(u.catDate || '') && u.catDate >= s.today)
    .map((u) => ({ name: `${u.code}`, start: u.catDate, end: u.catDate }));
  const calendar = (!s.data.units.length || s.data.units.some((u) => !u.catDate)) && s.next ? [s.next] : [];
  return [...own, ...calendar].sort((a, b) => a.start.localeCompare(b.start))[0] || null;
}

export default function Hero({ s }) {
  const [sent, setSent] = useState('');
  const next = nextDate(s);
  const allTba = s.data.units.length > 0 && s.data.units.every((u) => u.catDate === 'TBA');
  const days = next ? daysUntil(s.today, next.start) : null;
  const exams = daysUntil(s.today, s.calendar.exams.start);
  const minutes = Object.values(s.stats.minutesWeek).reduce((a, b) => a + b, 0);
  const green = s.data.topics.filter((t) => s.mastery?.[t.id]?.status === 'green').length;

  const dm = async () => {
    setSent('Sending…');
    try { await api('POST', 'dm-today'); setSent('Sent. Check your DMs.'); } catch (e) { setSent(e.message); }
  };

  return (
    <section className="hero reveal" data-tour="countdown">
      <div className="count">
        {next && days > 0 ? (
          <>
            <span className="big"><CountUp to={days} duration={1.2} /></span>
            <span className="label">days to <b>{next.name}</b><br />{next.start === next.end ? next.start : `${next.start} to ${next.end}`}</span>
          </>
        ) : next ? (
          <span className="label"><b>{next.name}</b> {next.start === next.end ? 'is today' : `are on now, until ${next.end}`}. One unit at a time.</span>
        ) : <span className="label">{allTba ? 'All your dates are TBA. Set them in Units when they are announced; until then everything is Adequate Prep.' : 'No CATs or exams left on the calendar.'}</span>}
      </div>
      {s.stageMix.length > 0 && (
        <p className="stagemix" aria-label="Study stages">
          {s.stageMix.map((m) => <span key={m.id} className={`stage ${m.id}`}>{m.n} {m.name}</span>)}
        </p>
      )}
      <dl className="tiles">
        <div><dt>Exams</dt><dd>{exams > 0 ? `${exams}d` : 'now'}</dd></div>
        <div><dt>Mastered</dt><dd>{green}/{s.data.topics.length}</dd></div>
        <div><dt>Streak</dt><dd>{s.stats.streak}d</dd></div>
        <div><dt>This week</dt><dd>{Math.round(minutes / 6) / 10}h</dd></div>
      </dl>
      <div className="hero-foot">
        {s.discord ? <button className="ghost" onClick={dm}>DM me today's plan</button> : <span className="muted">Discord DMs are off. Run <code>setup.bat</code> in the study folder.</span>}
        {!s.coach && <span className="muted">Teach-back marking is off: no key for the selected AI provider.</span>}
        {sent && <span className="muted">{sent}</span>}
      </div>
    </section>
  );
}
