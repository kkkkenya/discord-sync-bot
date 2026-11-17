// The study rooms API (fixplan-f section 4). Served before the student's document is loaded (api/router.js,
// server/index.js): rooms read only their own tables, so a full room polling every 20 s stays cheap.
import { ROOMS, PUBLIC_ROOMS } from './defs.js';
import { focusByRoom } from './focus.js';
import { CHECKINS, canAct, checkinCounts, cleanBoard, cleanName, cleanWork, makeCode, nextHost, normalizeCode, personKey, presence, shouldEnd, validCode } from './rooms.js';
import { roomsStore } from './rooms-store.js';
import { actions, cleanPlan, idle, phaseAt } from '../web/src/room-clock.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const iso = (ms) => new Date(ms).toISOString();
const ms = (s) => (s ? Date.parse(s) : null);

const toClock = (r) => ({ plan: cleanPlan(r.plan), state: r.state, phase: r.phase, round: r.round, phaseStart: ms(r.phase_start), leftMs: r.left_ms == null ? null : Number(r.left_ms) });
const fromClock = (c) => ({ plan: c.plan, state: c.state, phase: c.phase, round: c.round, phase_start: c.phaseStart == null ? null : iso(c.phaseStart), left_ms: c.leftMs == null ? null : Math.round(c.leftMs) });

// what a member sees: the clock, the people (names, never ids), and the server's time for the offset
function view(room, members, userId, now) {
  const people = presence(members, now).map((m) => ({ key: personKey(room.id, m.user_id), name: m.name, host: m.user_id === room.host_id, here: m.here, me: m.user_id === userId }));
  const clock = toClock(room);
  const round = phaseAt(clock, now).round;
  const mine = members.find((m) => m.user_id === userId)?.checkin;
  const host = room.host_id === userId;
  return {
    now,
    room: { code: room.code, name: room.name, unit: room.unit_code || null, clock, version: room.version, locked: Boolean(room.locked), host, work: room.work || null, board: room.board || null },
    people,
    // check-ins for this round: yours, and the counts for the host (never who said what)
    checkin: { round, mine: mine?.round === round ? mine.how : null, counts: host ? checkinCounts(members, round) : null },
  };
}

// the room behind a code, still live, with its members; ends it on the way if it is empty or too old
async function load(store, code, now) {
  const c = normalizeCode(code);
  if (!validCode(c)) throw fail('A room code is four letters.');
  const room = await store.live(c);
  if (!room) throw fail('This room has ended or the code is not in use.', 410);
  const members = await store.members(room.id);
  if (shouldEnd(room, members, now)) { await store.end(room.id, now); throw fail('This room has ended.', 410); }
  return { room, members };
}
const memberOf = (members, userId) => members.find((m) => m.user_id === userId) || null;

// leave whatever room you are in (one room at a time); a host leaving hands the room on, or ends it when nobody is here
async function leaveCurrent(store, user, now, except = null) {
  const room = await store.roomOf(user.id);
  if (!room || room.id === except) return;
  await store.leave(room.id, user.id);
  if (room.host_id !== user.id) return;
  // the next host: someone here now, else anyone still listed (away less than 10 min); the room ends only when nobody is left
  const listed = presence(await store.members(room.id), now);
  const heir = listed.find((m) => m.here) || listed[0];
  if (heir) await store.cas(room.id, room.version, { host_id: heir.user_id });
  else await store.end(room.id, now);
}

export const ROOM_PATHS = /^\/api\/rooms(\/(join|state|act|leave|checkin))?$/;

export async function roomsRoute(method, path, query, body, user, now = Date.now(), store = roomsStore()) {
  const route = `${method} ${path}`;
  body = body || {};

  if (route === 'GET /api/rooms') {
    const counts = await focusByRoom(user.id, now).catch(() => null);
    const mine = await store.roomOf(user.id);
    return {
      now,
      public: PUBLIC_ROOMS.map((r) => ({ ...r, count: counts ? counts.rooms[r.id] || 0 : null })),
      mine: mine ? { code: mine.code, name: mine.name } : null,
    };
  }

  if (route === 'POST /api/rooms') { // host a room: anyone can (owner, 2026-11-17), one at a time
    const own = await store.hostedBy(user.id);
    if (own) await store.end(own.id, now);
    await leaveCurrent(store, user, now);
    const plan = cleanPlan(body.plan);
    const name = cleanName(body.name, `${user.name || 'A student'}'s room`);
    const unit = body.unit ? String(body.unit).slice(0, 20) : null;
    for (let tries = 0; tries < 5; tries++) {
      let code;
      for (let i = 0; i < 10 && !code; i++) { const c = makeCode(() => false); if (!(await store.codeResting(c, now))) code = c; }
      if (!code) break;
      let room;
      try {
        room = await store.insert({ code, name, unit_code: unit, host_id: user.id, ...fromClock(idle(plan)), locked: false }, now);
      } catch (e) { if (/duplicate|unique|23505/i.test(e.message)) continue; throw e; } // someone took the code a moment ago
      await store.addMember(room.id, user.id, user.name || 'Host', now);
      return view(room, await store.members(room.id), user.id, now);
    }
    throw fail('Could not find a free room code. Try again.', 503);
  }

  if (route === 'POST /api/rooms/join') {
    // wrong codes count (10 an hour, 30 a day); once used up, no code is looked up at all (fixplan-f 2.1)
    if (!(await store.triesLeft(user.id, now))) throw fail('Too many tries. Try again later.', 429);
    let found;
    try { found = await load(store, body.code, now); } catch (e) { if (e.status === 410 || e.status === 400) await store.wrongCode(user.id, now); throw e; }
    const { room, members } = found;
    const me = memberOf(members, user.id);
    if (me?.removed) throw fail('The host removed you from this room.', 403);
    if (!me) {
      if (room.locked) throw fail('This room is locked. Ask the host to unlock it.', 403);
      if (presence(members, now).length >= ROOMS.maxPeople) throw fail('This room is full.', 409);
    }
    await leaveCurrent(store, user, now, room.id);
    await store.addMember(room.id, user.id, user.name || 'Student', now);
    return view(room, await store.members(room.id), user.id, now);
  }

  if (route === 'GET /api/rooms/state') {
    let { room, members } = await load(store, query?.get?.('code'), now);
    const me = memberOf(members, user.id);
    if (!me) throw fail('You are not in this room.', 403);
    if (me.removed) throw fail('The host removed you from this room.', 403);
    if (now - ms(me.seen_at) >= ROOMS.seenEverySeconds * 1e3) { await store.seen(room.id, user.id, now); me.seen_at = iso(now); }
    const heir = nextHost(room, members, now);
    if (heir) room = (await store.cas(room.id, room.version, { host_id: heir.user_id })) || room;
    return view(room, members, user.id, now);
  }

  if (route === 'POST /api/rooms/act') {
    const { room, members } = await load(store, body.code, now);
    const me = memberOf(members, user.id);
    const action = String(body.action || '');
    canAct(room, me, action);
    const target = body.person ? presence(members, now).find((m) => personKey(room.id, m.user_id) === body.person) : null;
    let patch;
    if (action in actions) patch = fromClock(actions[action](toClock(room), now, body.plan || room.plan)); // a rename-only settings call keeps the plan
    else if (action === 'lock' || action === 'unlock') patch = { locked: action === 'lock' };
    else if (action === 'rename') patch = { name: cleanName(body.name, room.name) };
    else if (action === 'work') patch = { work: cleanWork(body.work) };
    else if (action === 'board') patch = { board: cleanBoard(body.board) };
    else if (action === 'host' || action === 'remove') {
      if (!target) throw fail('That person is not in the room any more.', 404);
      if (target.user_id === user.id) throw fail(action === 'host' ? 'You are already the host.' : 'Use Leave to leave the room.');
      patch = action === 'host' ? { host_id: target.user_id } : {};
    }
    if (action === 'settings' && body.name != null) patch.name = cleanName(body.name, room.name);
    if (action === 'end') patch.ended_at = iso(now);
    const version = Number.isInteger(body.version) ? body.version : room.version;
    const next = await store.cas(room.id, version, patch, user.id);
    if (!next) throw fail('The room changed. Try again.', 409);
    if (action === 'remove') await store.setRemoved(room.id, target.user_id);
    if (action === 'end') { await store.dropMembers(room.id); return { ended: true, now }; }
    return view(next, await store.members(room.id), user.id, now);
  }

  // A member's check-in at a break (F4): done, partly or stuck, for the room's current round. Any time is fine; it
  // counts for the round the clock is in.
  if (route === 'POST /api/rooms/checkin') {
    const { room, members } = await load(store, body.code, now);
    const me = memberOf(members, user.id);
    if (!me || me.removed) throw fail('You are not in this room.', 403);
    if (!CHECKINS.includes(body.how)) throw fail('Pick done, partly or stuck.');
    const round = phaseAt(toClock(room), now).round;
    me.checkin = { round, how: body.how };
    await store.setCheckin(room.id, user.id, me.checkin);
    await store.seen(room.id, user.id, now); // checking in is being here
    me.seen_at = new Date(now).toISOString();
    return view(room, members, user.id, now);
  }

  if (route === 'POST /api/rooms/leave') {
    await leaveCurrent(store, user, now);
    return { left: true, now };
  }

  throw fail('not found', 404);
}

// the daily cron (server/backup.js): rooms past their 12 hours end, and ended rooms older than 7 days are deleted
export async function cleanRooms(now = Date.now(), store = roomsStore()) {
  let ended = 0;
  for (const room of await store.liveRooms()) {
    if (shouldEnd(room, await store.members(room.id), now)) { await store.end(room.id, now); ended++; }
  }
  return { ended, deleted: await store.purge(now) };
}
