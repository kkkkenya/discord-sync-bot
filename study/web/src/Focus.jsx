import { MODES, clock, end, joinRoom, leaveRoom, pause, reset, setPlan, start, switchMode, useOthers, useTick, view } from './focus-store.js';
import { Icon } from './icons.jsx';
import { href } from './route.js';

const SHOWN = 12; // people icons before "+N"

// People focusing right now, as plain person icons: a count, never who.
export function Together({ count, label, none = 'Just you right now.' }) {
  if (count == null) return <p className="together row-sub">Can't see who else is studying right now.</p>;
  if (count === 0) return <p className="together row-sub">{none}</p>;
  return (
    <div className="together">
      <span className="people" aria-hidden="true">
        {Array.from({ length: Math.min(count, SHOWN) }, (_, i) => <span key={i} className="person"><Icon name="user" /></span>)}
        {count > SHOWN && <span className="person more num">+{count - SHOWN}</span>}
      </span>
      <span className="row-sub"><span className="num">{count}</span> {label(count)}</span>
    </div>
  );
}

// The Focus page: your own timer, or your unit's study room (everyone on the same clock). Shows how many are focusing.
export default function Focus({ s, unit }) {
  const st = useTick();
  useOthers(true); // the count shows before you start, too
  const v = view(st);
  const done = 1 - v.left / v.total;
  const title = s.data.units.find((u) => u.code === unit)?.title;
  const room = st.room;
  const R = 112, C = 2 * Math.PI * R;
  return (
    <div className="focus">
      <header className="page-head">
        <h1>Focus</h1>
        <p><span className="num">{room || unit}</span>{room ? ' study room' : title ? ` · ${title}` : ''}</p>
      </header>
      <nav className="segmented" aria-label="How to focus">
        <button type="button" aria-pressed={!room} onClick={() => room && leaveRoom()}>On my own</button>
        <button type="button" aria-pressed={Boolean(room)} onClick={() => room !== unit && joinRoom(unit)}><span className="num">{unit}</span>&nbsp;room</button>
      </nav>
      {!room && (
        <nav className="segmented" aria-label="Timer">
          {Object.entries(MODES).map(([id, label]) => <button key={id} type="button" aria-pressed={st.mode === id} onClick={() => switchMode(id)}>{label}</button>)}
        </nav>
      )}
      <section className="card focus-card" aria-label={`${MODES[v.mode]} timer`}>
        <div className="ring">
          <svg viewBox="0 0 260 260" aria-hidden="true">
            <circle cx="130" cy="130" r={R} className="ring-track" />
            <circle cx="130" cy="130" r={R} className={`ring-fill ${v.mode}`} strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, Math.max(0, done)))} />
          </svg>
          <div className="ring-text">
            <span className="time num" role="timer" aria-live="off">{clock(v.left)}</span>
            <span className="row-sub">{room ? `${MODES[v.mode]} · the room's clock` : <>{MODES[v.mode]} · round <span className="num">{st.round}</span> of 4</>}</span>
          </div>
        </div>
        {room ? (
          <>
            <Together count={st.roomCount} label={(n) => `in the ${room} room with you`} none={v.mode === 'focus' ? `Nobody else in the ${room} room yet.` : 'Break time for the room.'} />
            <div className="actions focus-actions"><button className="btn" type="button" onClick={leaveRoom}>Leave the room</button></div>
            <p className="muted small together">Rooms focus from :00 to :25 and :30 to :55, with breaks in between, so you can join at any time.</p>
          </>
        ) : (
          <>
            <div className="actions focus-actions">
              {v.running ? <button className="btn primary" type="button" onClick={pause}>Pause</button> : <button className="btn primary" type="button" onClick={start}>{v.left < v.total ? 'Resume' : 'Start'}</button>}
              <button className="btn" type="button" onClick={reset}>Reset</button>
              {st.active && <button className="btn plain" type="button" onClick={end}>End session</button>}
            </div>
            <Together count={st.others} label={(n) => `other${n === 1 ? '' : 's'} focusing with you`} />
          </>
        )}
      </section>
      {!room && (
        <div className="card">
          <label className="field">Block lengths
            <select value={st.plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="classic">25 min focus, 5 min breaks</option>
              <option value="long">50 min focus, 10 min breaks</option>
            </select>
          </label>
          <p className="row-sub">Every fourth focus block ends in a long break. Only a count of people focusing is shared, never who.</p>
        </div>
      )}
    </div>
  );
}

// The mini bar: the running timer or room while you use the rest of Crux. Tap it to go back to the Focus page.
export function FocusBar() {
  const st = useTick();
  useOthers(Boolean(st.room) || (st.running && st.mode === 'focus'));
  if (!st.active) return null;
  const v = view(st);
  const count = st.room ? st.roomCount : st.others;
  return (
    <div className="focusbar glass" role="region" aria-label="Focus timer">
      <a className="focusbar-main" href={href('focus')}>
        <span className={`fdot ${v.mode}`} aria-hidden="true" />
        <span className="row-main"><b className="num">{clock(v.left)}</b><span className="row-sub">{st.room ? `${st.room} room · ${MODES[v.mode]}` : v.running ? MODES[v.mode] : `${MODES[v.mode]}, paused`}</span></span>
        {count > 0 && <span className="row-sub fcount"><Icon name="user" /><span className="num">{count}</span></span>}
      </a>
      {st.room
        ? <button className="navbtn" type="button" onClick={leaveRoom} aria-label="Leave the room"><Icon name="close" /></button>
        : <button className="navbtn" type="button" onClick={v.running ? pause : start} aria-label={v.running ? 'Pause' : 'Resume'}><Icon name={v.running ? 'pause' : 'play'} /></button>}
    </div>
  );
}
