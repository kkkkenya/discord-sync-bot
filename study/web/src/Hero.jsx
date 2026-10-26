import { useState } from 'react';
import { api, daysUntil } from './api.js';
import CountUp from './components/CountUp.jsx';

export default function Hero({ s }) {
  const [sent, setSent] = useState('');
  const next = s.next;
  const days = next ? daysUntil(s.today, next.start) : null;
  const exams = daysUntil(s.today, s.calendar.exams.start);
  const minutes = Object.values(s.stats.minutesWeek).reduce((a, b) => a + b, 0);

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
            <span className="label">days to <b>{next.name}</b><br />{next.start} to {next.end}</span>
          </>
        ) : next ? (
          <span className="label"><b>{next.name}</b> are on now, until {next.end}. One unit at a time.</span>
        ) : <span className="label">No CATs or exams left on the calendar.</span>}
      </div>
      <dl className="tiles">
        <div><dt>Exams</dt><dd>{exams > 0 ? `${exams}d` : 'now'}</dd></div>
        <div><dt>Cards due</dt><dd>{s.due}</dd></div>
        <div><dt>Streak</dt><dd>{s.stats.streak}d</dd></div>
        <div><dt>This week</dt><dd>{Math.round(minutes / 6) / 10}h</dd></div>
      </dl>
      <div className="hero-foot">
        {s.discord ? <button className="ghost" onClick={dm}>DM me today's plan</button> : <span className="muted">Discord DMs are off. Run <code>setup.bat</code> in the study folder.</span>}
        {!s.coach && <span className="muted">Teach-back marking is off — no key for the selected AI provider.</span>}
        {sent && <span className="muted">{sent}</span>}
      </div>
    </section>
  );
}
