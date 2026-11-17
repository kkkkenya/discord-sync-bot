import { useEffect, useState } from 'react';
import { MODES, PUBLIC_ROOMS, clock, end, leaveRoom, pause, reset, setPlan, start, switchMode, useOthers, useTick, view } from './focus-store.js';
import { joinCode, leaveHosted, roomView, useHostedRoom } from './room-store.js';
import { HostedRoom, Ring, RoomsLobby } from './Rooms.jsx';
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

// The Focus page: your own timer, or a room (fixplan-f): a public room on the clock, or a hosted room joined with a
// code. Shows how many are focusing.
export default function Focus({ s, unit, invite = '' }) {
  const st = useTick();
  const hosted = useHostedRoom();
  const [tab, setTab] = useState(invite || st.room || hosted.notice ? 'rooms' : 'own');
  useEffect(() => { if (hosted.notice) setTab('rooms'); }, [hosted.notice]); // "The host ended the room" shows on Rooms
  useOthers(true); // the count shows before you start, too
  const title = s.data.units.find((u) => u.code === unit)?.title;
  const other = invite && invite.toUpperCase() !== hosted.code ? invite.toUpperCase() : null;
  if (hosted.code) return (
    <div className="focus">
      {other && (
        <div className="card room-row" role="status">
          <span className="row-main"><b>Invited to room <span className="num">{other}</span></b><span className="row-sub">You are in room <span className="num">{hosted.code}</span>. Leave it to join.</span></span>
          <button className="btn" type="button" onClick={async () => { await leaveHosted(); await joinCode(other).catch(() => {}); }}>Leave and join</button>
        </div>
      )}
      <HostedRoom />
    </div>
  );
  const v = view(st);
  const room = st.room;
  const pub = PUBLIC_ROOMS[room];
  const own = tab === 'own' && !room;
  return (
    <div className="focus">
      <header className="page-head">
        <h1>Focus</h1>
        <p>{pub ? `${pub.name}: everyone on the hub, one clock` : own ? <><span className="num">{unit}</span>{title ? ` · ${title}` : ''}</> : 'Study with others on one clock'}</p>
      </header>
      <nav className="segmented" aria-label="How to focus">
        <button type="button" aria-pressed={own} onClick={() => { if (room) leaveRoom(); setTab('own'); }}>On my own</button>
        <button type="button" aria-pressed={!own} onClick={() => setTab('rooms')}>Rooms</button>
      </nav>
      {!own && !room && <RoomsLobby unit={unit} title={title} invite={invite} />}
      {own && (
        <nav className="segmented" aria-label="Timer">
          {Object.entries(MODES).map(([id, label]) => <button key={id} type="button" aria-pressed={st.mode === id} onClick={() => switchMode(id)}>{label}</button>)}
        </nav>
      )}
      {(own || room) && (
        <section className="card focus-card" aria-label={`${MODES[v.mode]} timer`}>
          <Ring v={v} sub={room ? `${MODES[v.mode]} · the room's clock` : <>{MODES[v.mode]} · round <span className="num">{st.round}</span> of 4</>} />
          {room ? (
            <>
              <Together count={st.roomCount} label={() => `in the ${pub.name.toLowerCase()} with you`} none={v.mode === 'focus' ? `Nobody else in the ${pub.name.toLowerCase()} yet.` : 'Break time for the room.'} />
              <div className="actions focus-actions"><button className="btn" type="button" onClick={leaveRoom}>Leave the room</button></div>
              <p className="muted small together">{room === 'long' ? 'This room focuses from :00 to :50, with a break until the hour' : 'This room focuses from :00 to :25 and :30 to :55, with breaks in between'}, so you can join at any time.</p>
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
      )}
      {own && (
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
  const hosted = useHostedRoom();
  const hv = roomView(hosted);
  if (hosted.code && hv) {
    const label = hv.state === 'running' ? MODES[hv.mode] : hv.state === 'paused' ? `${MODES[hv.mode]}, paused` : hv.state === 'done' ? 'Session done' : 'Waiting for the host';
    return (
      <div className="focusbar glass" role="region" aria-label="Room timer">
        <a className="focusbar-main" href={href('focus')}>
          <span className={`fdot ${hv.mode}`} aria-hidden="true" />
          <span className="row-main"><b className="num">{clock(hv.left)}</b><span className="row-sub"><span className="num">{hosted.code}</span> · {label}</span></span>
        </a>
      </div>
    );
  }
  return <OwnBar />;
}
function OwnBar() {
  const st = useTick();
  useOthers(Boolean(st.room) || (st.running && st.mode === 'focus'));
  if (!st.active) return null;
  const v = view(st);
  const count = st.room ? st.roomCount : st.others;
  return (
    <div className="focusbar glass" role="region" aria-label="Focus timer">
      <a className="focusbar-main" href={href('focus')}>
        <span className={`fdot ${v.mode}`} aria-hidden="true" />
        <span className="row-main"><b className="num">{clock(v.left)}</b><span className="row-sub">{st.room ? `Study room · ${MODES[v.mode]}` : v.running ? MODES[v.mode] : `${MODES[v.mode]}, paused`}</span></span>
        {count > 0 && <span className="row-sub fcount"><Icon name="user" /><span className="num">{count}</span></span>}
      </a>
      {st.room
        ? <button className="navbtn" type="button" onClick={leaveRoom} aria-label="Leave the room"><Icon name="close" /></button>
        : <button className="navbtn" type="button" onClick={v.running ? pause : start} aria-label={v.running ? 'Pause' : 'Resume'}><Icon name={v.running ? 'pause' : 'play'} /></button>}
    </div>
  );
}
