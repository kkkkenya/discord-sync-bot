// A Discord voice channel for a study room (fixplan-f F7): the host adds one, everyone in the room gets Join voice,
// and it goes when the room ends. Voice is for talking; the board (F8) is for showing, which costs far less data.
// Off until CRUX_ROOMS_CATEGORY_ID names a "Study rooms" category where the bot's role has Manage Channels.
// The channel is private: hidden from the rest of the Hub, open to the room's members only. Joining the room adds a
// member; leaving or being removed takes them off.
import { api as discord } from '../../lib/discord.js';
import { APP_ID, GUILD_ID } from '../../lib/config.js';

const VIEW = 1 << 10, CONNECT = 1 << 20, SPEAK = 1 << 21, MANAGE = 1 << 4;
const MEMBER = String(VIEW | CONNECT | SPEAK);
const ID = /^\d{17,20}$/;

export const voiceCategory = () => (ID.test(process.env.CRUX_ROOMS_CATEGORY_ID || '') ? process.env.CRUX_ROOMS_CATEGORY_ID : null);
export const voiceLink = (channelId) => (channelId ? `https://discord.com/channels/${GUILD_ID}/${channelId}` : null);

// `KXQT · EMM 302 revision`, within Discord's 100 characters
export const channelName = (room) => `${room.code} · ${room.name}`.replace(/[\u0000-\u001f]/g, ' ').slice(0, 100);

// who may see the channel: nobody on the Hub by default (@everyone has the guild's id), the bot, and the members
export function overwrites(memberIds = []) {
  return [
    { id: GUILD_ID, type: 0, deny: String(VIEW | CONNECT), allow: '0' },
    { id: APP_ID, type: 1, allow: String(VIEW | CONNECT | MANAGE), deny: '0' },
    ...[...new Set(memberIds)].filter((id) => ID.test(String(id))).slice(0, 60).map((id) => ({ id: String(id), type: 1, allow: MEMBER, deny: '0' })),
  ];
}

/** Make the room's voice channel for these members; its id. */
export async function makeVoice(room, memberIds = [], api = discord, category = voiceCategory()) {
  if (!category) throw Object.assign(new Error('Voice channels for rooms are not set up on the Hub yet.'), { status: 503 });
  try {
    const c = await api('POST', `/guilds/${GUILD_ID}/channels`, { name: channelName(room), type: 2, parent_id: category, user_limit: 50, permission_overwrites: overwrites(memberIds) });
    return String(c.id);
  } catch (e) {
    console.error('room voice:', e.message);
    throw Object.assign(new Error("Couldn't make the voice channel. The room works without it."), { status: 502 });
  }
}

/** Remove a room's voice channel; never throws (the room ends either way). */
export async function removeVoice(channelId, api = discord) {
  if (!channelId) return;
  try { await api('DELETE', `/channels/${channelId}`); } catch (e) { if (!/404/.test(e.message)) console.error('room voice:', e.message); }
}

/** Let a member in (they joined the room), or take them off (they left or were removed). Never throws. */
export async function allowVoice(channelId, userId, api = discord) {
  if (!channelId || !ID.test(String(userId))) return;
  try { await api('PUT', `/channels/${channelId}/permissions/${userId}`, { type: 1, allow: MEMBER, deny: '0' }); } catch (e) { console.error('room voice:', e.message); }
}
export async function denyVoice(channelId, userId, api = discord) {
  if (!channelId || !ID.test(String(userId))) return;
  try { await api('DELETE', `/channels/${channelId}/permissions/${userId}`); } catch (e) { if (!/404/.test(e.message)) console.error('room voice:', e.message); }
}
