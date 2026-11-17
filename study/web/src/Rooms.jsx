// Study rooms on the Focus page (fixplan-f): join with a code, host a room, the public rooms, and the hosted room
// itself (one clock run by the host, the names of the people in it). Not a call and not a screen share: everyone keeps
// working in their own Crux, and talks on Discord or in person.
import { useEffect, useState } from 'react';
import { api } from './api.js';
import OpenAt from './OpenAt.jsx';
import Rich from './Rich.jsx';
import { runCode } from './CodeCell.jsx';
import { PUBLIC_ROOMS, joinRoom } from './focus-store.js';
import { Icon } from './icons.jsx';
import { LIMITS, PRESETS } from './room-clock.js';
import { act, checkin, clearNotice, hostRoom, joinCode, leaveHosted, roomView, useHostedRoom } from './room-store.js';

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

// The board (F8): what the host presents, followed on everyone's screen. Text, not video, so it is light on data.
// The host writes or pastes a question and its working, one step per line, and shows the steps one at a time.
function Board({ board, me, run }) {
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = (step) => { if (busy) return; setBusy(true); run(async () => { await act('board', { board: { ...board, step } }); })().finally(() => setBusy(false)); };
  useEffect(() => {
    if (!me || !board) return undefined;
    const key = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight' && board.step < board.steps.length) go(board.step + 1);
      if (e.key === 'ArrowLeft' && board.step > 0) go(board.step - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  if (!board) return null;
  if (hidden && !me) return <div className="card room-row"><span className="row-main"><b>The host is presenting</b></span><button className="btn" type="button" onClick={() => setHidden(false)}>Back to the board</button></div>;
  return (
    <section className="card stack board" aria-label="The board" aria-live="polite">
      <div className="room-row">
        <h2 className="room-h">{board.title || 'The board'}</h2>
        {!me && <button className="btn plain" type="button" onClick={() => setHidden(true)}>Stop following</button>}
      </div>
      {board.text && <Rich text={board.text} />}
      {board.steps.length > 0 && (
        <ol className="board-steps">
          {board.steps.slice(0, board.step).map((x, i) => <li key={i}><Rich as="span" text={x} /></li>)}
        </ol>
      )}
      {board.steps.length > 0 && <p className="row-sub">Step <span className="num">{board.step}</span> of <span className="num">{board.steps.length}</span></p>}
      {board.code && <pre className="code-block" tabIndex={0} aria-label="Code"><code>{board.code}</code></pre>}
      {board.output && <pre className="code-block code-out" tabIndex={0} aria-label="Output"><code>{board.output}</code></pre>}
      {me && (
        <div className="actions start">
          <button className="btn" type="button" disabled={busy || board.step <= 0} onClick={() => go(board.step - 1)}>Back</button>
          <button className="btn primary" type="button" disabled={busy || board.step >= board.steps.length} onClick={() => go(board.step + 1)}>Next step</button>
        </div>
      )}
    </section>
  );
}

// The host's board editor: a title, the question, the working (one step per line), and code to run here.
function BoardEditor({ board, onDone, run }) {
  const [title, setTitle] = useState(board?.title || '');
  const [text, setText] = useState(board?.text || '');
  const [steps, setSteps] = useState((board?.steps || []).join('\n'));
  const [code, setCode] = useState(board?.code || '');
  const [output, setOutput] = useState(board?.output || '');
  const [running, setRunning] = useState(false);
  const show = (e) => { e.preventDefault(); run(async () => { await act('board', { board: { title, text, steps: steps.split('\n'), step: board ? Math.min(board.step, steps.split('\n').filter((x) => x.trim()).length) : 0, code, output } }); onDone(); })(); };
  const runIt = async () => { setRunning(true); const r = await runCode(code, ''); setOutput(r.stopped ? 'Stopped: it ran for more than 3 seconds.' : r.blocked ? `Plain Python only (no ${r.blocked}).` : `${r.out}${r.error ? `${r.error.type}${r.error.line ? ` on line ${r.error.line}` : ''}: ${r.error.message}` : ''}`); setRunning(false); };
  return (
    <form className="card room-form" aria-label="Present" onSubmit={show}>
      <label className="field">Title<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="CAT 1 2024, question 3" /></label>
      <label className="field">Question <span className="hint">(maths in $…$)</span><textarea value={text} maxLength={4000} rows={4} onChange={(e) => setText(e.target.value)} /></label>
      <label className="field">Working <span className="hint">(one step per line; the room sees them one at a time)</span><textarea value={steps} rows={6} onChange={(e) => setSteps(e.target.value)} /></label>
      <label className="field">Code <span className="hint">(optional, Python)</span><textarea className="code-input small" value={code} maxLength={6000} rows={4} spellCheck="false" onChange={(e) => setCode(e.target.value)} /></label>
      {code.trim() && <div className="actions start"><button className="btn" type="button" disabled={running} onClick={runIt}>{running ? 'Running…' : 'Run to show its output'}</button></div>}
      {output && <pre className="code-block code-out"><code>{output}</code></pre>}
      <div className="actions">
        <button className="btn primary" type="submit">{board ? 'Update the board' : 'Show to the room'}</button>
        <button className="btn plain" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

// a Hub file's name for a button: no extension or underscores, at most 60 characters
const shortFile = (n) => { const t = String(n || 'paper').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 57)}…` : t; };

// Today's work (F4): what the host has the room do, with a Hub paper to open at a page. Each member opens it in their
// own Crux; answers stay their own.
function TodaysWork({ room, me, run }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [fileId, setFileId] = useState('');
  const [page, setPage] = useState('');
  const [files, setFiles] = useState(null);
  const w = room.work;
  if (!w && !me) return null;
  const edit = () => {
    setText(w?.text || ''); setFileId(w?.fileId || ''); setPage(w?.page ? String(w.page) : ''); setEditing(true);
    if (room.unit && !files) api('GET', `library?unit=${encodeURIComponent(room.unit)}&lite=1`).then((r) => setFiles((r.files || []).filter((f) => /^\d+$/.test(String(f.id))))).catch(() => setFiles([]));
  };
  const save = (work) => run(async () => { await act('work', { work }); setEditing(false); })();
  if (editing) {
    const file = files?.find((f) => String(f.id) === fileId);
    return (
      <form className="card room-form" aria-label="Today's work" onSubmit={(e) => { e.preventDefault(); save({ text, fileId: fileId || null, fileName: file?.name || w?.fileName || null, page: page ? Number(page) : null }); }}>
        <label className="field">Today's work<input value={text} maxLength={140} onChange={(e) => setText(e.target.value)} placeholder="CAT 1 2024, questions 3 and 4" /></label>
        {room.unit && (
          <div className="room-fields">
            <label className="field">Paper <span className="hint">(optional)</span>
              <select value={fileId} onChange={(e) => setFileId(e.target.value)} disabled={files === null}>
                <option value="">{files === null ? 'Loading…' : 'None'}</option>
                {w?.fileId && !(files || []).some((f) => String(f.id) === w.fileId) && <option value={w.fileId}>{w.fileName}</option>}
                {(files || []).map((f) => <option key={f.id} value={String(f.id)}>{f.name}</option>)}
              </select>
            </label>
            <label className="field">Page<input type="number" inputMode="numeric" min={1} value={page} onChange={(e) => setPage(e.target.value)} disabled={!fileId} /></label>
          </div>
        )}
        <div className="actions">
          <button className="btn primary" type="submit" disabled={!text.trim() && !fileId}>Save</button>
          {w && <button className="btn" type="button" onClick={() => save(null)}>Clear</button>}
          <button className="btn plain" type="button" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </form>
    );
  }
  return (
    <section className="card room-row" aria-label="Today's work">
      <span className="row-main">
        <b>Today's work</b>
        <span className="row-sub">{w ? w.text || w.fileName : 'Set what the room works on. Everyone opens it in their own Crux.'}</span>
        {w?.fileId && <OpenAt fileId={w.fileId} page={w.page} label={`Open ${shortFile(w.fileName)}${w.page ? ` · p. ${w.page}` : ''}`} />}
      </span>
      {me && <button className="btn" type="button" onClick={edit}>{w ? 'Change' : 'Set'}</button>}
    </section>
  );
}

// At a break: how did that block go? Each person answers for themselves; the host sees only the counts.
function CheckIn({ v, data, me, run }) {
  const c = data.checkin;
  const atBreak = v.mode !== 'focus' || v.state === 'waiting' || v.state === 'done';
  if (!c || !atBreak || v.state === 'idle') return null;
  const n = c.counts;
  return (
    <section className="card stack-s" aria-label="Check in">
      <h2 className="room-h">How did that block go?</h2>
      <div className="segmented" role="group" aria-label="How did that block go">
        {[['done', 'Done'], ['partly', 'Partly'], ['stuck', 'Stuck']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={c.mine === id} onClick={run(() => checkin(id))}>{label}</button>
        ))}
      </div>
      {me && n && <p className="row-sub">Round <span className="num">{c.round}</span>: <span className="num">{n.done}</span> done, <span className="num">{n.partly}</span> partly, <span className="num">{n.stuck}</span> stuck. Only counts are shown, never who.</p>}
      {me && !n && <p className="row-sub">The counts show once 3 people have answered, so nobody's answer can be told apart.</p>}
    </section>
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
  const [presenting, setPresenting] = useState(false);
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
      {me && presenting && <BoardEditor board={room.board} run={run} onDone={() => setPresenting(false)} />}
      {!presenting && <Board board={room.board} me={me} run={run} />}
      {me && !presenting && (
        <div className="actions start">
          <button className="btn" type="button" onClick={() => setPresenting(true)}>{room.board ? 'Edit the board' : 'Present'}</button>
          {room.board && <button className="btn plain" type="button" onClick={run(() => act('board', { board: { on: false } }))}>Stop presenting</button>}
        </div>
      )}
      <TodaysWork room={room} me={me} run={run} />
      <CheckIn v={v} data={s.data} me={me} run={run} />
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
