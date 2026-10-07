// Shared by the Discord Sort buttons and the dashboard: find the post(s) for a unit code and forward files.
import { api } from './discord.js';
import { GUILD_ID, SORTER_ROLE_MATCH } from './config.js';
import THREADS from './threads.json' with { type: 'json' }; // unit code -> posts (regenerate when posts change)
import SHELVES from './shelves.json' with { type: 'json' };  // [{ id, name }] book shelves

export { THREADS, SHELVES };

const ADMINISTRATOR = 1n << 3n;
const MANAGE_ROLES = 1n << 28n;

// Who may sort #to-sort files: admins (Administrator or Manage Roles) and reps (config.SORTER_ROLE_MATCH).
export async function canSort(member) {
  if (BigInt(member?.permissions || '0') & (ADMINISTRATOR | MANAGE_ROLES)) return true;
  const roles = await api('GET', `/guilds/${GUILD_ID}/roles`);
  return roles.some((r) => member?.roles?.includes(r.id) && SORTER_ROLE_MATCH.test(r.name));
}

// A file too big for one message is posted in parts; its #to-sort note lists them all ("🧩 Parts: id id id")
// so sorting moves every part. Single files just return their own message id.
export const partsOf = (noteContent, fileMsgId) => {
  const m = String(noteContent || '').match(/🧩 Parts: ([\d ]+)/);
  return m ? m[1].trim().split(/\s+/) : [fileMsgId];
};

const codesOf = (name) => name.split(' — ')[0].match(/[A-Z]{3} \d{3}/g) || [];

// The best post for a unit code in each forum (a unit taught in two years has a post in both).
// Several posts in one forum: take the merged one, i.e. the post listing the most unit codes.
export async function postsFor(code) {
  let hits = THREADS[code] || [];
  if (!hits.length) { // a post created after threads.json was generated
    const { threads } = await api('GET', `/guilds/${GUILD_ID}/threads/active`);
    hits = threads.filter((t) => codesOf(t.name).includes(code)).map((t) => ({ id: t.id, name: t.name, forum: t.parent_id }));
  }
  const best = new Map();
  for (const h of hits) {
    const n = codesOf(h.name).length;
    if (!best.has(h.forum) || n > best.get(h.forum).n) best.set(h.forum, { ...h, n });
  }
  return [...best.values()];
}

export const normaliseCode = (raw) => {
  const m = String(raw).toUpperCase().match(/([A-Z]{3})\s*-?\s*(\d{3})/);
  return m ? `${m[1]} ${m[2]}` : null;
};

export const forwardTo = (channelId, messageId, fromChannel) => api('POST', `/channels/${channelId}/messages`, {
  message_reference: { type: 1, message_id: messageId, channel_id: fromChannel, guild_id: GUILD_ID },
});

// Every unit post once (for pickers), from threads.json.
export function allUnitPosts() {
  const seen = new Map();
  for (const [code, posts] of Object.entries(THREADS)) {
    for (const p of posts) {
      if (!seen.has(p.name)) seen.set(p.name, { label: p.name, code: codesOf(p.name)[0] || code, forums: [] });
      if (!seen.get(p.name).forums.includes(p.forum)) seen.get(p.name).forums.push(p.forum);
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}
