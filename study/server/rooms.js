// Hosted study rooms (fixplan-f): the rules, pure. Codes, names, who may do what, who is here, who hosts next,
// and when a room ends. The store is server/rooms-store.js, the routes server/rooms-routes.js, the clock
// web/src/room-clock.js (shared with the page).
import { createHash, randomInt } from 'node:crypto';
import { ROOMS } from './defs.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// four letters, no vowels (no words) and no I or O; typed in any case, spaces and dashes ignored
export const normalizeCode = (input) => String(input || '').toUpperCase().replace(/[\s-]/g, '');
export const validCode = (code) => code.length === ROOMS.codeLength && [...code].every((ch) => ROOMS.codeLetters.includes(ch));
export function makeCode(isTaken, pick = (n) => randomInt(n)) {
  for (let i = 0; i < 20; i++) {
    const code = Array.from({ length: ROOMS.codeLength }, () => ROOMS.codeLetters[pick(ROOMS.codeLetters.length)]).join('');
    if (!isTaken(code)) return code;
  }
  throw fail('Could not find a free room code. Try again.', 503);
}

// a room name a student typed: one line, no links, at most 40 characters
export function cleanName(text, fallback) {
  const t = String(text || '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, ROOMS.nameChars).trim();
  return t || String(fallback || 'Study room').slice(0, ROOMS.nameChars);
}

// a short handle for a person in a room, so the page can say "remove this one" without seeing Discord ids
export const personKey = (roomId, userId) => createHash('sha256').update(`${roomId}:${userId}`).digest('base64url').slice(0, 10);

const ms = (iso) => (iso ? Date.parse(iso) : 0);
// members: [{ user_id, name, joined_at, seen_at, removed }] -> the ones still listed, each with `here`
export function presence(members, now) {
  return members
    .filter((m) => !m.removed && now - ms(m.seen_at) < ROOMS.dropMinutes * 60e3)
    .map((m) => ({ ...m, here: now - ms(m.seen_at) < ROOMS.hereSeconds * 1e3 }))
    .sort((a, b) => ms(a.joined_at) - ms(b.joined_at));
}

// the next host when the host has not been seen for a while: whoever joined first and is here now (null: keep it)
export function nextHost(room, members, now) {
  const host = members.find((m) => m.user_id === room.host_id && !m.removed);
  if (host && now - ms(host.seen_at) < ROOMS.hostAwayMinutes * 60e3) return null;
  const here = presence(members, now).filter((m) => m.here && m.user_id !== room.host_id);
  return here[0] || null;
}

// why a live room should end now, or null
export function shouldEnd(room, members, now) {
  if (room.ended_at) return null;
  if (now - ms(room.created_at) >= ROOMS.maxHours * 3600e3) return 'old';
  const last = Math.max(ms(room.created_at), ...members.filter((m) => !m.removed).map((m) => ms(m.seen_at)));
  if (now - last >= ROOMS.emptyEndMinutes * 60e3) return 'empty';
  return null;
}

export const HOST_ACTIONS = ['start', 'pause', 'resume', 'skip', 'settings', 'end', 'lock', 'unlock', 'remove', 'host', 'rename', 'work', 'board'];

// Today's work (F4): what the host sets the room to do. A short line, and optionally a Hub paper at a page, which
// members open in their own viewer. Only Hub files (numeric ids): a file the host added privately cannot be shared.
export function cleanWork(w) {
  if (!w || typeof w !== 'object') return null;
  const text = String(w.text || '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140).trim();
  const fileId = /^\d{1,12}$/.test(String(w.fileId ?? '')) ? String(w.fileId) : null;
  const page = fileId && Number.isInteger(Number(w.page)) && Number(w.page) >= 1 && Number(w.page) <= 5000 ? Number(w.page) : null;
  const fileName = fileId ? String(w.fileName || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 120) || 'Paper' : null;
  if (!text && !fileId) return null;
  return { text, fileId, fileName, page };
}
// The board (F8): what the host presents to the room, text and not video. A question, its working one step per line
// (revealed one at a time with Next), and code with its output. Members' screens follow it. Kept only with the room.
export const BOARD = { title: 120, text: 4000, steps: 30, stepChars: 600, code: 6000, output: 4000 };
const plain = (v, max) => String(v ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, max);
export function cleanBoard(b) {
  if (!b || typeof b !== 'object' || b.on === false) return null;
  const steps = (Array.isArray(b.steps) ? b.steps : []).map((x) => plain(x, BOARD.stepChars).trim()).filter(Boolean).slice(0, BOARD.steps);
  const step = Math.min(steps.length, Math.max(0, Math.round(Number(b.step) || 0)));
  const out = { on: true, title: plain(b.title, BOARD.title).trim(), text: plain(b.text, BOARD.text).trim(), steps, step, code: plain(b.code, BOARD.code).replace(/\s+$/, ''), output: plain(b.output, BOARD.output) };
  return out.title || out.text || out.steps.length || out.code ? out : null;
}
export const CHECKINS = ['done', 'partly', 'stuck'];
// this round's check-ins: counts only (the host sees how the room is doing, not who said what)
// Counts only from CHECKIN_MIN answers: with fewer, a host could tell who said what (two people in a room).
export const CHECKIN_MIN = 3;
export function checkinCounts(members, round) {
  const out = { done: 0, partly: 0, stuck: 0 };
  for (const m of members) if (!m.removed && m.checkin?.round === round && CHECKINS.includes(m.checkin.how)) out[m.checkin.how]++;
  return out.done + out.partly + out.stuck >= CHECKIN_MIN ? out : null;
}
export function canAct(room, member, action) {
  if (!room || room.ended_at) throw fail('This room has ended.', 410);
  if (!member || member.removed) throw fail('You are not in this room.', 403);
  if (!HOST_ACTIONS.includes(action)) throw fail('Unknown room action.');
  if (room.host_id !== member.user_id) throw fail('Only the host can do that.', 403);
  return true;
}
