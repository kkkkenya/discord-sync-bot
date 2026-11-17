// Hosted study rooms: the rules (server/rooms.js) and the API (server/rooms-routes.js) on the in-memory store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS } from '../server/defs.js';
import { cleanName, makeCode, nextHost, normalizeCode, presence, shouldEnd, validCode } from '../server/rooms.js';
import { resetRoomsForTests, roomsStore } from '../server/rooms-store.js';
import { cleanRooms, roomsRoute } from '../server/rooms-routes.js';

const M = 60e3;
const T0 = Date.parse('2026-11-17T17:00:00Z');
const at = (min) => new Date(T0 + min * M).toISOString();
const amina = { id: 'a', name: 'Amina', tier: 'premium' };
const brian = { id: 'b', name: 'Brian', tier: 'basic' };
const wanjiru = { id: 'w', name: 'Wanjiru', tier: 'trial' };
const call = (user, method, path, body, now = T0, q = '') => roomsRoute(method, path, new URLSearchParams(q), body, user, now);
const host = async (body = {}) => call(amina, 'POST', '/api/rooms', { name: 'EMM 302 revision', unit: 'EMM 302', ...body });

test('codes: four letters, no vowels, no I or O; typed in any case with spaces', () => {
  for (let i = 0; i < 200; i++) { const c = makeCode(() => false); assert.ok(validCode(c)); assert.doesNotMatch(c, /[AEIOUY]/); }
  assert.equal(normalizeCode(' kx-q t '), 'KXQT');
  assert.equal(validCode('KXQ'), false);
  assert.equal(validCode('KOQT'), false);
  let n = 0;
  assert.ok(validCode(makeCode(() => n++ < 3))); // taken codes are skipped
  assert.equal(n, 4);
  assert.equal(makeCode(() => false, () => 0), 'BBBB');
  assert.throws(() => makeCode(() => true), /free room code/);
});

test('room names: one line, no links, at most 40 characters, a fallback when empty', () => {
  assert.equal(cleanName('  EMM 302 \n revision https://x.y/z '), 'EMM 302 revision');
  assert.equal(cleanName('a'.repeat(60)).length, ROOMS.nameChars);
  assert.equal(cleanName('   ', "Amina's room"), "Amina's room");
});

test('presence: here for 90 s, away after, gone after 10 min; removed people never listed', () => {
  const now = T0 + 20 * M;
  const ms = [
    { user_id: 'a', joined_at: at(0), seen_at: at(20) },
    { user_id: 'b', joined_at: at(1), seen_at: at(17) },
    { user_id: 'c', joined_at: at(2), seen_at: at(5) },
    { user_id: 'd', joined_at: at(3), seen_at: at(20), removed: true },
  ];
  assert.deepEqual(presence(ms, now).map((m) => [m.user_id, m.here]), [['a', true], ['b', false]]);
});

test('host hand-over after 5 min away, to whoever joined first and is here; none when nobody is here', () => {
  const room = { host_id: 'a' };
  const ms = [{ user_id: 'a', joined_at: at(0), seen_at: at(0) }, { user_id: 'b', joined_at: at(1), seen_at: at(6) }, { user_id: 'c', joined_at: at(2), seen_at: at(6) }];
  assert.equal(nextHost(room, ms, T0 + 4 * M), null);
  assert.equal(nextHost(room, ms, T0 + 6 * M).user_id, 'b');
  assert.equal(nextHost(room, ms, T0 + 9 * M), null); // b and c are away too
});

test('a room ends 30 min after the last person was seen, or 12 h after it was made', () => {
  const room = { created_at: at(0) };
  const ms = [{ user_id: 'a', seen_at: at(100) }];
  assert.equal(shouldEnd(room, ms, T0 + 129 * M), null);
  assert.equal(shouldEnd(room, ms, T0 + 130 * M), 'empty');
  assert.equal(shouldEnd(room, [{ user_id: 'a', seen_at: at(719) }], T0 + 720 * M), 'old');
});

test('host a room, join it with the code, and both see the same clock and names (never ids)', async () => {
  resetRoomsForTests();
  const made = await host({ plan: { focus: 50, short: 10 } });
  assert.ok(validCode(made.room.code));
  assert.equal(made.room.host, true);
  assert.equal(made.room.clock.plan.focus, 50);
  const joined = await call(brian, 'POST', '/api/rooms/join', { code: made.room.code.toLowerCase() });
  assert.equal(joined.room.host, false);
  assert.deepEqual(joined.people.map((p) => [p.name, p.host, p.me]), [['Amina', true, false], ['Brian', false, true]]);
  assert.equal(JSON.stringify(joined).includes('"a"'), false); // no Discord id anywhere
  const state = await call(amina, 'GET', '/api/rooms/state', null, T0 + M, `code=${made.room.code}`);
  assert.equal(state.people.length, 2);
  assert.equal(state.now, T0 + M);
});

test('only the host runs the clock; a stale version is refused', async () => {
  resetRoomsForTests();
  const { room } = await host();
  await call(brian, 'POST', '/api/rooms/join', { code: room.code });
  await assert.rejects(call(brian, 'POST', '/api/rooms/act', { code: room.code, action: 'start' }), /Only the host/);
  const s = await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'start', version: room.version });
  assert.equal(s.room.clock.state, 'running');
  await assert.rejects(call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'pause', version: room.version }), /The room changed/);
  const p = await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'pause', version: s.room.version }, T0 + 5 * M);
  assert.equal(p.room.clock.leftMs, 20 * M);
});

test('settings, lock, remove, make host', async () => {
  resetRoomsForTests();
  const { room } = await host();
  const b = await call(brian, 'POST', '/api/rooms/join', { code: room.code });
  let s = await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'settings', plan: { focus: 90, short: 20, wait: true }, name: 'One paper' });
  assert.deepEqual([s.room.clock.plan.focus, s.room.clock.plan.wait, s.room.name], [90, true, 'One paper']);
  s = await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'lock' });
  await assert.rejects(call(wanjiru, 'POST', '/api/rooms/join', { code: room.code }), /locked/);
  await call(brian, 'POST', '/api/rooms/join', { code: room.code }); // people already in can come back
  const key = b.people.find((p) => p.me).key;
  s = await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'remove', person: key });
  assert.deepEqual(s.people.map((p) => p.name), ['Amina']);
  await assert.rejects(call(brian, 'POST', '/api/rooms/join', { code: room.code }), /removed you/);
  await assert.rejects(call(brian, 'GET', '/api/rooms/state', null, T0, `code=${room.code}`), /removed you/);
  await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'unlock' });
  const w = await call(wanjiru, 'POST', '/api/rooms/join', { code: room.code });
  s = await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'host', person: w.people.find((p) => p.me).key });
  assert.equal(s.room.host, false);
  await assert.rejects(call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'lock' }), /Only the host/);
});

test('joining: wrong codes, too many tries, a full room, one room at a time', async () => {
  resetRoomsForTests();
  await assert.rejects(call(brian, 'POST', '/api/rooms/join', { code: 'BCDF' }), /not in use/);
  await assert.rejects(call(brian, 'POST', '/api/rooms/join', { code: 'AB' }), /four letters/);
  for (let i = 0; i < ROOMS.wrongPerHour - 2; i++) await call(brian, 'POST', '/api/rooms/join', { code: 'BCDF' }).catch(() => {});
  await assert.rejects(call(brian, 'POST', '/api/rooms/join', { code: 'BCDF' }), /Too many tries/);
  await assert.rejects(call(brian, 'POST', '/api/rooms/join', { code: 'BCDF' }, T0 + 61 * M), /not in use/); // a new hour

  resetRoomsForTests();
  const { room } = await host();
  for (let i = 1; i < ROOMS.maxPeople; i++) await call({ id: `s${i}`, name: `S${i}` }, 'POST', '/api/rooms/join', { code: room.code });
  await assert.rejects(call(brian, 'POST', '/api/rooms/join', { code: room.code }), /full/);

  resetRoomsForTests();
  const one = await host();
  const two = await call(wanjiru, 'POST', '/api/rooms', { name: 'Other' });
  await call(brian, 'POST', '/api/rooms/join', { code: one.room.code });
  await call(brian, 'POST', '/api/rooms/join', { code: two.room.code });
  const s1 = await call(amina, 'GET', '/api/rooms/state', null, T0, `code=${one.room.code}`);
  assert.deepEqual(s1.people.map((p) => p.name), ['Amina']);
  assert.equal((await call(brian, 'GET', '/api/rooms')).mine.code, two.room.code);
});

test('a host who leaves hands the room on; with nobody here, the room ends; hosting again ends the old room', async () => {
  resetRoomsForTests();
  const { room } = await host();
  await call(brian, 'POST', '/api/rooms/join', { code: room.code });
  await call(amina, 'POST', '/api/rooms/leave', {});
  const s = await call(brian, 'GET', '/api/rooms/state', null, T0, `code=${room.code}`);
  assert.equal(s.room.host, true);
  await call(brian, 'POST', '/api/rooms/leave', {});
  await assert.rejects(call(brian, 'POST', '/api/rooms/join', { code: room.code }), /ended/);

  resetRoomsForTests();
  const first = await host();
  await host();
  await assert.rejects(call(brian, 'POST', '/api/rooms/join', { code: first.room.code }), /ended/);
});

test('the host is handed on by the next state call after 5 min away', async () => {
  resetRoomsForTests();
  const { room } = await host();
  await call(brian, 'POST', '/api/rooms/join', { code: room.code });
  const s = await call(brian, 'GET', '/api/rooms/state', null, T0 + 6 * M, `code=${room.code}`);
  assert.equal(s.room.host, true);
});

test('ending a room, codes resting for 24 h, and the daily clean-up', async () => {
  resetRoomsForTests();
  const store = roomsStore();
  const { room } = await host();
  assert.deepEqual(await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'end' }), { ended: true, now: T0 });
  assert.equal(await store.codeResting(room.code, T0 + 23 * 3600e3), true);
  assert.equal(await store.codeResting(room.code, T0 + 25 * 3600e3), false);
  const other = await call(brian, 'POST', '/api/rooms', {});
  assert.deepEqual(await cleanRooms(T0 + 13 * 3600e3), { ended: 1, deleted: 0 });
  assert.deepEqual(await cleanRooms(T0 + 8 * 864e5), { ended: 0, deleted: 2 });
  await assert.rejects(call(brian, 'GET', '/api/rooms/state', null, T0, `code=${other.room.code}`), /ended/);
});

test('GET /api/rooms lists the public rooms with counts', async () => {
  resetRoomsForTests();
  const r = await call(amina, 'GET', '/api/rooms');
  assert.deepEqual(r.public.map((p) => p.id), ['hub', 'long']);
  assert.equal(r.mine, null);
});

test('review fixes: valid joins never use up tries, a host leaving hands on to someone away, a rename keeps the plan', async () => {
  resetRoomsForTests();
  const { room } = await host({ plan: { focus: 50 } });
  for (let i = 0; i < ROOMS.wrongPerHour + 3; i++) await call(brian, 'POST', '/api/rooms/join', { code: room.code });
  await call(wanjiru, 'POST', '/api/rooms/join', { code: room.code });
  await call(amina, 'POST', '/api/rooms/leave', {}, T0 + 3 * M); // the others are away (seen 3 min ago), not gone
  const s = await call(brian, 'GET', '/api/rooms/state', null, T0 + 4 * M, `code=${room.code}`);
  assert.equal(s.people.find((p) => p.host).name, 'Brian');
  const r = await call(brian, 'POST', '/api/rooms/act', { code: room.code, action: 'settings', name: 'Renamed' }, T0 + 4 * M);
  assert.deepEqual([r.room.name, r.room.clock.plan.focus], ['Renamed', 50]);
  await call(brian, 'POST', '/api/rooms/act', { code: room.code, action: 'end' }, T0 + 5 * M);
  assert.equal((await roomsStore().members(1)).length, 0); // nobody's membership outlives the room
});

test("today's work: host only, cleaned, Hub papers only; check-ins count per round and the host sees counts, not names", async () => {
  resetRoomsForTests();
  const { room } = await host();
  await call(brian, 'POST', '/api/rooms/join', { code: room.code });
  await call(wanjiru, 'POST', '/api/rooms/join', { code: room.code });
  await assert.rejects(call(brian, 'POST', '/api/rooms/act', { code: room.code, action: 'work', work: { text: 'x' } }), /Only the host/);
  let s = await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'work', work: { text: 'CAT 1 2024, Q3 and Q4 https://evil.example', fileId: '3691', fileName: 'CAT 1 2024.pdf', page: '2' } });
  assert.deepEqual(s.room.work, { text: 'CAT 1 2024, Q3 and Q4', fileId: '3691', fileName: 'CAT 1 2024.pdf', page: 2 });
  s = await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'work', work: { text: '', fileId: 'local-9' } });
  assert.equal(s.room.work, null); // a private file can't be shared, and nothing else was set
  await call(amina, 'POST', '/api/rooms/act', { code: room.code, action: 'start' });
  await assert.rejects(call(brian, 'POST', '/api/rooms/checkin', { code: room.code, how: 'great' }), /done, partly or stuck/);
  const b = await call(brian, 'POST', '/api/rooms/checkin', { code: room.code, how: 'stuck' }, T0 + 26 * M);
  assert.deepEqual([b.checkin.mine, b.checkin.counts], ['stuck', null]); // members don't see the counts
  await call(wanjiru, 'POST', '/api/rooms/checkin', { code: room.code, how: 'done' }, T0 + 27 * M);
  const two = await call(amina, 'GET', '/api/rooms/state', null, T0 + 27 * M, `code=${room.code}`);
  assert.equal(two.checkin.counts, null, 'with 2 answers the host could tell who said what: no counts');
  await call(amina, 'POST', '/api/rooms/checkin', { code: room.code, how: 'partly' }, T0 + 27 * M);
  const h = await call(amina, 'GET', '/api/rooms/state', null, T0 + 28 * M, `code=${room.code}`);
  assert.deepEqual(h.checkin, { round: 1, mine: 'partly', counts: { done: 1, partly: 1, stuck: 1 } });
  const next = await call(amina, 'GET', '/api/rooms/state', null, T0 + 31 * M, `code=${room.code}`);
  assert.equal(next.checkin.counts, null); // round 2 starts clean (no answers yet)
  assert.equal(JSON.stringify(h).includes('Brian'), true); // names are in the people list…
  assert.equal(JSON.stringify(h.checkin).includes('Brian'), false); // …but never beside a check-in
});
