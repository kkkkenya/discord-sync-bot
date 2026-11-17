// Study rooms on the Focus page (fixplan-f): join with a code, host a room, the public rooms, and the hosted room
// itself (one clock run by the host, the names of the people in it). Not a call and not a screen share: everyone keeps
// working in their own Crux, and talks on Discord or in person.
import { useState } from 'react';
import { PUBLIC_ROOMS, joinRoom } from './focus-store.js';
import { Icon } from './icons.jsx';
import { LIMITS, PRESETS } from './room-clock.js';
import { act, clearNotice, hostRoom, joinCode, leaveHosted, roomView, useHostedRoom } from './room-store.js';

const MODES = { focus: 'Focus', short: 'Short break', long: 'Long break' };
const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'; // server/defs.js ROOMS.codeLetters
const tidy = (v) => v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const clock = (ms) => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function Ring({ v, sub }) {
  const R = 112, C = 2 * Math.PI * R;
  const done = v.total ? 1 - v.left / v.total : 0;
  return (
    <div className="ring">
      <svg viewBox="0 0 260 260" aria-hidden="true">
        <circle cx="130" cy="130" r={R} className="ring-track" />
        <circle cx="130" cy="130" r={R} className={`ring-fill ${v.mode}`} strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, Math.max(0, done)))} />
      </svg>
      <div className="ring-text">
        <span className="time num" role="timer" aria-live="off">{clock(v.left)}</span>
        <span className="row-sub">{sub}</span>
      </div>
    </div>
  );
}

// The room's timer settings, for the host form and for Room settings
function PlanFields({ plan, setPlan }) {
  const num = (k, label, unitLabel, step = 1) => (
    <label className="field">{label}
      <span className="room-num">
        <input type="number" inputMode="numeric" min={LIMITS[k][0]} max={LIMITS[k][1]} step={step} value={plan[k]} onChange={(e) => setPlan({ ...plan, [k]: Number(e.target.value) })} />
        <span className="row-sub">{unitLabel}</span>
      </span>
    </label>
  );
  const preset = Object.entries(PRESETS).find(([, p]) => p.focus === plan.focus && p.short === plan.short)?.[0];
  return (
    <>
      <nav className="segmented" aria-label="Preset">
        {Object.entries(PRESETS).map(([id, p]) => <button key={id} type="button" aria-pressed={preset === id} onClick={() => setPlan({ ...p, rounds: plan.rounds, wait: plan.wait })}>{p.focus}/{p.short}</button>)}
      </nav>
      <div className="room-fields">
        {num('focus', 'Focus', 'min', 5)}
        {num('short', 'Break', 'min')}
        {num('long', 'Long break', 'min')}
        {num('longEvery', 'Long break after', plan.longEvery ? 'blocks' : 'never')}
        {num('rounds', 'Rounds', plan.rounds ? 'blocks' : 'until stopped')}
      </div>
      <label className="room-check"><input type="checkbox" checked={plan.wait} onChange={(e) => setPlan({ ...plan, wait: e.target.checked })} /> Wait for the host between focus and breaks</label>
    </>
  );
}

// Not in a room: join with a code, host one, or pick a public room
export function RoomsLobby({ unit, title, invite = '' }) {
  const [code, setCode] = useState(tidy(invite));
  const [hosting, setHosting] = useState(false);
  const [name, setName] = useState('');
  const [plan, setPlan] = useState(PRESETS.classic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { notice } = useHostedRoom();
  const run = (f) => async (e) => { e.preventDefault(); setBusy(true); setError(null); clearNotice(); try { await f(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const ok = code.length === 4 && [...code].every((ch) => LETTERS.includes(ch));
  return (
    <>
      {notice && <p className="card muted" role="status">{notice}</p>}
      <form className="card" onSubmit={run(() => joinCode(code))} aria-label="Join with a code">
        <label className="field">Join with a code
          <span className="room-join">
            <input className="room-code num" value={code} onChange={(e) => setCode(tidy(e.target.value))} placeholder="KXQT" autoCapitalize="characters" autoComplete="off" spellCheck="false" maxLength={6} aria-describedby="room-names" />
            <button className="btn primary" type="submit" disabled={!ok || busy}>Join</button>
          </span>
        </label>
        <p className="row-sub" id="room-names">People in a room see your name.</p>
      </form>
      <section className="card" aria-label="Host a room">
        {!hosting ? (
          <div className="room-row">
            <span className="row-main"><b>Host a room</b><span className="row-sub">You run the clock. Others join with a code.</span></span>
            <button className="btn" type="button" onClick={() => setHosting(true)}>Host</button>
          </div>
        ) : (
          <form className="room-form" onSubmit={run(() => hostRoom({ name, unit, plan }))}>
            <label className="field">Name <span className="hint">(optional)</span>
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={unit ? `${unit}${title ? ` · ${title}` : ''}` : 'Revision'} />
            </label>
            <PlanFields plan={plan} setPlan={setPlan} />
            <div className="actions"><button className="btn primary" type="submit" disabled={busy}>Start the room</button><button className="btn plain" type="button" onClick={() => setHosting(false)}>Cancel</button></div>
          </form>
        )}
      </section>
      {error && <p className="notice bad" role="alert">{error}</p>}
      <section className="card" aria-label="Public rooms">
        <h2 className="room-h">Public rooms</h2>
        {Object.entries(PUBLIC_ROOMS).map(([id, r]) => (
          <div key={id} className="room-row">
            <span className="row-main"><b>{r.name}</b><span className="row-sub">{r.focus} min focus, {r.block - r.focus} min break, on the clock</span></span>
            <button className="btn" type="button" onClick={() => joinRoom(id)}>Join</button>
          </div>
        ))}
        <p className="row-sub">Public rooms show how many are in them, never who.</p>
      </section>
    </>
  );
}

function statusLine(v, hostName) {
  if (v.state === 'idle') return `Waiting for ${hostName} to start`;
  if (v.state === 'paused') return `${MODES[v.mode]}, paused`;
  if (v.state === 'waiting') return `Waiting for ${hostName} to start the ${v.mode === 'focus' ? 'next block' : 'break'}`;
  if (v.state === 'done') return 'Session done';
  return <>{MODES[v.mode]} · round <span className="num">{v.round}</span>{v.rounds ? <> of <span className="num">{v.rounds}</span></> : null}</>;
}

// In a hosted room
export function HostedRoom() {
  const s = useHostedRoom();
  const [settings, setSettings] = useState(false);
  const [plan, setPlan] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [ending, setEnding] = useState(false);
  const v = roomView(s);
  if (!s.data || !v) return <div className="card" role="status"><p className="muted">Opening room {s.code}…</p><div className="actions"><button className="btn plain" type="button" onClick={leaveHosted}>Leave</button></div></div>;
  const { room, people } = s.data;
  const host = people.find((p) => p.host)?.name || 'the host';
  const me = room.host;
  const run = (f) => async () => { setError(null); try { await f(); } catch (err) { setError(err.message); } };
  const invite = async () => {
    const link = `${location.origin}${location.pathname}#/room/${room.code}`;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setError(`Copy this link: ${link}`); }
  };
  const openSettings = () => { setPlan(room.clock.plan); setName(room.name); setSettings(true); };
  return (
    <>
      <header className="page-head">
        <h1>{room.name}</h1>
        <p>Room <b className="num room-code-inline">{room.code}</b>{room.unit ? ` · ${room.unit}` : ''}{room.locked ? ' · locked' : ''}</p>
      </header>
      <section className="card focus-card" aria-label="The room's timer">
        <Ring v={v} sub={statusLine(v, me ? 'you' : host)} />
        <p className="visually-hidden" aria-live="polite">{`${MODES[v.mode]}, ${v.state}`}</p>
        {me && (
          <div className="actions focus-actions">
            {(v.state === 'idle' || v.state === 'waiting' || v.state === 'done') && <button className="btn primary" type="button" onClick={run(() => act('start'))}>{v.state === 'waiting' ? (v.mode === 'focus' ? 'Start the block' : 'Start the break') : v.state === 'done' ? 'Start again' : 'Start'}</button>}
            {v.state === 'running' && <button className="btn primary" type="button" onClick={run(() => act('pause'))}>Pause</button>}
            {v.state === 'paused' && <button className="btn primary" type="button" onClick={run(() => act('resume'))}>Resume</button>}
            {(v.state === 'running' || v.state === 'paused') && <button className="btn" type="button" onClick={run(() => act('skip'))}>{v.mode === 'focus' ? 'Skip to break' : 'Skip to focus'}</button>}
          </div>
        )}
        <div className="actions focus-actions">
          <button className="btn" type="button" onClick={invite}><Icon name="copy" />{copied ? 'Link copied' : 'Copy invite'}</button>
          {me && <button className="btn" type="button" aria-expanded={settings} onClick={() => (settings ? setSettings(false) : openSettings())}><Icon name="settings" />Room settings</button>}
          <button className="btn plain" type="button" onClick={run(leaveHosted)}>Leave</button>
        </div>
        {error && <p className="notice bad" role="alert">{error}</p>}
      </section>
      {me && settings && plan && (
        <form className="card room-form" aria-label="Room settings" onSubmit={(e) => { e.preventDefault(); run(async () => { await act('settings', { plan, name }); setSettings(false); })(); }}>
          <label className="field">Name<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
          <PlanFields plan={plan} setPlan={setPlan} />
          <p className="row-sub">Changes apply from the next block. Skip moves to it now.</p>
          <div className="actions">
            <button className="btn primary" type="submit">Save</button>
            <button className="btn" type="button" onClick={run(() => act(room.locked ? 'unlock' : 'lock'))}>{room.locked ? 'Unlock the room' : 'Lock the room'}</button>
            {!ending ? <button className="btn plain" type="button" onClick={() => setEnding(true)}>End the room</button>
              : <button className="btn danger" type="button" onClick={run(() => act('end'))}>End it for everyone</button>}
          </div>
          {room.locked && <p className="row-sub">Locked: nobody new can join, even with the code.</p>}
        </form>
      )}
      <section className="card" aria-label="People in the room">
        <h2 className="room-h">In the room <span className="num row-sub">{people.length}</span></h2>
        <ul className="room-people">
          {people.map((p) => (
            <li key={p.key} className={p.here ? '' : 'away'}>
              <span className="person"><Icon name="user" /></span>
              <span className="row-main"><b>{p.name}{p.me ? ' (you)' : ''}</b><span className="row-sub">{p.host ? 'Host' : p.here ? 'Here' : 'Away'}</span></span>
              {me && !p.me && (
                <span className="room-person-actions">
                  <button className="btn plain" type="button" onClick={run(() => act('host', { person: p.key }))}>Make host</button>
                  <button className="btn plain" type="button" onClick={run(() => act('remove', { person: p.key }))}>Remove</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
