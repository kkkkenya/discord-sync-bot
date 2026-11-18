// A Discord voice channel for a study room (fixplan-f F7): the host adds one, everyone in the room gets Join voice,
// and it goes when the room ends. Voice is for talking; the board (F8) is for showing, which costs far less data.
// Off until CRUX_ROOMS_CATEGORY_ID names a "Study rooms" category where the bot's role has Manage Channels.
import { api as discord } from '../../lib/discord.js';
import { GUILD_ID } from '../../lib/config.js';

export const voiceCategory = () => (/^\d{17,20}$/.test(process.env.CRUX_ROOMS_CATEGORY_ID || '') ? process.env.CRUX_ROOMS_CATEGORY_ID : null);
export const voiceLink = (channelId) => (channelId ? `https://discord.com/channels/${GUILD_ID}/${channelId}` : null);

// `KXQT · EMM 302 revision`, within Discord's 100 characters
export const channelName = (room) => `${room.code} · ${room.name}`.replace(/[\u0000-\u001f]/g, ' ').slice(0, 100);

/** Make the room's voice channel; its id. */
export async function makeVoice(room, api = discord, category = voiceCategory()) {
  if (!category) throw Object.assign(new Error('Voice channels for rooms are not set up on the Hub yet.'), { status: 503 });
  try {
    const c = await api('POST', `/guilds/${GUILD_ID}/channels`, { name: channelName(room), type: 2, parent_id: category, user_limit: 50 });
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
