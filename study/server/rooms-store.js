// Where hosted rooms live: Supabase (crux_rooms, crux_room_members) on the website, memory for local runs and tests,
// as server/focus.js does. Host actions are compare-and-set on `version` (one PATCH with a filter), so two people
// acting at once can't both win. No row is ever read by the browser: the service key stays on the server.
import { db, enc } from '../../lib/db.js';
import { ROOMS } from './defs.js';
import { remote } from './ingest.js';

const iso = (ms) => new Date(ms).toISOString();
const ms = (s) => (s ? Date.parse(s) : 0);

// ---- memory (local runs, tests) ----
const mem = { rooms: [], members: [], tries: new Map(), id: 0 };
export const resetRoomsForTests = () => { mem.rooms = []; mem.members = []; mem.tries.clear(); mem.id = 0; };
const memory = {
  async live(code) { return mem.rooms.find((r) => r.code === code && !r.ended_at) || null; },
  async byId(id) { return mem.rooms.find((r) => r.id === id) || null; },
  async codeResting(code, now) { return mem.rooms.some((r) => r.code === code && (!r.ended_at || now - ms(r.ended_at) < ROOMS.codeRestHours * 3600e3)); },
  async hostedBy(userId) { return mem.rooms.find((r) => r.host_id === userId && !r.ended_at) || null; },
  async insert(row, now) { const r = { ...row, id: ++mem.id, version: 0, created_at: iso(now), ended_at: null }; mem.rooms.push(r); return { ...r }; },
  async cas(id, version, patch, hostId) {
    const r = mem.rooms.find((x) => x.id === id && x.version === version && !x.ended_at && (!hostId || x.host_id === hostId));
    if (!r) return null;
    Object.assign(r, patch, { version: version + 1 });
    return { ...r };
  },
  async end(id, now) { const r = mem.rooms.find((x) => x.id === id && !x.ended_at); if (r) Object.assign(r, { ended_at: iso(now), state: 'ended', version: r.version + 1 }); await memory.dropMembers(id); },
  // nobody's membership outlives the room (privacy, and roomOf stays short)
  async dropMembers(id) { mem.members = mem.members.filter((m) => m.room_id !== id); },
  async members(roomId) { return mem.members.filter((m) => m.room_id === roomId).map((m) => ({ ...m })); },
  async addMember(roomId, userId, name, now) {
    const m = mem.members.find((x) => x.room_id === roomId && x.user_id === userId);
    if (m) { m.seen_at = iso(now); m.name = name; return { ...m }; }
    const row = { room_id: roomId, user_id: userId, name, joined_at: iso(now), seen_at: iso(now), removed: false };
    mem.members.push(row);
    return { ...row };
  },
  async seen(roomId, userId, now) { const m = mem.members.find((x) => x.room_id === roomId && x.user_id === userId); if (m) m.seen_at = iso(now); },
  async setRemoved(roomId, userId) { const m = mem.members.find((x) => x.room_id === roomId && x.user_id === userId); if (m) m.removed = true; },
  async setCheckin(roomId, userId, checkin) { const m = mem.members.find((x) => x.room_id === roomId && x.user_id === userId); if (m) m.checkin = checkin; },
  async leave(roomId, userId) { mem.members = mem.members.filter((x) => !(x.room_id === roomId && x.user_id === userId)); },
  async roomOf(userId) {
    const ids = mem.members.filter((m) => m.user_id === userId && !m.removed).map((m) => m.room_id);
    return mem.rooms.find((r) => ids.includes(r.id) && !r.ended_at) || null;
  },
  async liveRooms() { return mem.rooms.filter((r) => !r.ended_at).map((r) => ({ ...r })); },
  async purge(now) { const old = (r) => r.ended_at && now - ms(r.ended_at) > ROOMS.keepDays * 864e5; const gone = new Set(mem.rooms.filter(old).map((r) => r.id)); mem.rooms = mem.rooms.filter((r) => !gone.has(r.id)); mem.members = mem.members.filter((m) => !gone.has(m.room_id)); return gone.size; },
  // wrong codes this hour and today; triesLeft reads, wrongCode counts one
  async triesLeft(userId, now) {
    const h = mem.tries.get(`${userId}|${iso(now).slice(0, 13)}`) || 0, d = mem.tries.get(`${userId}|${iso(now).slice(0, 10)}`) || 0;
    return h < ROOMS.wrongPerHour && d < ROOMS.wrongPerDay;
  },
  async wrongCode(userId, now) {
    for (const k of [`${userId}|${iso(now).slice(0, 13)}`, `${userId}|${iso(now).slice(0, 10)}`]) mem.tries.set(k, (mem.tries.get(k) || 0) + 1);
  },
};

// ---- Supabase (the website, and Crux (local).bat) ----
// Today's work and check-ins (F4) need two columns (end of supabase/crux.sql). Until the owner adds them, say so plainly.
const newColumns = (p) => p.catch((e) => {
  if (/PGRST204|column .*(work|checkin|board)|(work|checkin|board).* column/i.test(e.message)) throw Object.assign(new Error("This part of rooms isn't switched on yet. The Hub admin needs to update Crux's database."), { status: 503 });
  throw e;
});
const one = async (p) => (await p)?.[0] || null;
const supabase = {
  live: (code) => one(db.select('crux_rooms', `code=eq.${enc(code)}&ended_at=is.null&limit=1`)),
  byId: (id) => one(db.select('crux_rooms', `id=eq.${id}&limit=1`)),
  async codeResting(code, now) {
    const rows = await db.select('crux_rooms', `code=eq.${enc(code)}&or=(ended_at.is.null,ended_at.gt.${enc(iso(now - ROOMS.codeRestHours * 3600e3))})&select=id&limit=1`);
    return rows.length > 0;
  },
  hostedBy: (userId) => one(db.select('crux_rooms', `host_id=eq.${enc(userId)}&ended_at=is.null&limit=1`)),
  insert: async (row) => (await db.insert('crux_rooms', [row]))[0],
  cas: (id, version, patch, hostId) => newColumns(one(db.update('crux_rooms', `id=eq.${id}&version=eq.${version}&ended_at=is.null${hostId ? `&host_id=eq.${enc(hostId)}` : ''}`, { ...patch, version: version + 1 }))),
  end: async (id, now) => { await db.update('crux_rooms', `id=eq.${id}&ended_at=is.null`, { ended_at: iso(now), state: 'ended' }); await supabase.dropMembers(id); },
  dropMembers: async (id) => { await db.remove('crux_room_members', `room_id=eq.${id}`); },
  members: (roomId) => db.select('crux_room_members', `room_id=eq.${roomId}&order=joined_at.asc&limit=200`),
  addMember: async (roomId, userId, name, now) => (await db.upsert('crux_room_members', [{ room_id: roomId, user_id: userId, name, seen_at: iso(now) }], 'room_id,user_id'))[0],
  seen: async (roomId, userId, now) => { await db.update('crux_room_members', `room_id=eq.${roomId}&user_id=eq.${enc(userId)}`, { seen_at: iso(now) }); },
  setRemoved: async (roomId, userId) => { await db.update('crux_room_members', `room_id=eq.${roomId}&user_id=eq.${enc(userId)}`, { removed: true }); },
  setCheckin: (roomId, userId, checkin) => newColumns(db.update('crux_room_members', `room_id=eq.${roomId}&user_id=eq.${enc(userId)}`, { checkin })),
  leave: async (roomId, userId) => { await db.remove('crux_room_members', `room_id=eq.${roomId}&user_id=eq.${enc(userId)}`); },
  async roomOf(userId) {
    const mine = await db.select('crux_room_members', `user_id=eq.${enc(userId)}&removed=is.false&select=room_id&order=joined_at.desc&limit=20`);
    if (!mine.length) return null;
    return one(db.select('crux_rooms', `id=in.(${mine.map((m) => m.room_id).join(',')})&ended_at=is.null&limit=1`));
  },
  liveRooms: () => db.select('crux_rooms', 'ended_at=is.null&limit=200'),
  purge: async (now) => (await db.remove('crux_rooms', `ended_at=lt.${enc(iso(now - ROOMS.keepDays * 864e5))}`)).length,
  // wrong codes in crux_usage: the hour rides in the kind, the day in the day column
  async triesLeft(userId, now) {
    const day = iso(now).slice(0, 10), hourKind = `room-code-${iso(now).slice(11, 13)}`;
    const rows = await db.select('crux_usage', `user_id=eq.${enc(userId)}&day=eq.${day}&kind=in.(room-code,${hourKind})&select=kind,count`);
    const n = (k) => rows.find((r) => r.kind === k)?.count || 0;
    return n(hourKind) < ROOMS.wrongPerHour && n('room-code') < ROOMS.wrongPerDay;
  },
  async wrongCode(userId, now) {
    const day = iso(now).slice(0, 10);
    await db.rpc('crux_bump', { p_user: userId, p_day: day, p_kind: `room-code-${iso(now).slice(11, 13)}`, p_limit: ROOMS.wrongPerHour });
    await db.rpc('crux_bump', { p_user: userId, p_day: day, p_kind: 'room-code', p_limit: ROOMS.wrongPerDay });
  },
};

export const roomsStore = () => (remote() ? supabase : memory);
