// The Hub files desk (fixplan-g, owner 2026-11-18): who is staff, the #to-sort queue, and sorting a file into its
// place. Shared by the web dashboard (api/dash.js) and Crux (study/server/hub-desk-routes.js, used by Crux Harness).
// The bot token stays on the server; callers get names, sizes and links only.
import { api } from './discord.js';
import { CHANNELS, GUILD_ID } from './config.js';
import { forwardTo, normaliseCode, partsOf, postsFor, SHELVES } from './sorting.js';

const ADMINISTRATOR = 1n << 3n;
const MANAGE_ROLES = 1n << 28n;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/** Staff: the server owner, or a member with Administrator or Manage Roles (the dashboard's rule). Cached 10 min. */
const staffCache = new Map();
export async function isStaff(userId, { discord = api, now = Date.now() } = {}) {
  if (!userId) return false;
  const hit = staffCache.get(userId);
  if (hit && now - hit.at < 10 * 60e3) return hit.ok;
  let ok = false;
  try {
    const [guild, member, roles] = await Promise.all([
      discord('GET', `/guilds/${GUILD_ID}`), discord('GET', `/guilds/${GUILD_ID}/members/${userId}`), discord('GET', `/guilds/${GUILD_ID}/roles`),
    ]);
    if (guild?.owner_id === userId) ok = true;
    else {
      const mine = new Set([...(member?.roles || []), GUILD_ID]); // @everyone's id is the guild's
      const perms = roles.filter((r) => mine.has(r.id)).reduce((p, r) => p | BigInt(r.permissions || '0'), 0n);
      ok = Boolean(perms & (ADMINISTRATOR | MANAGE_ROLES));
    }
  } catch { ok = false; } // Discord down or not a member: not staff
  staffCache.set(userId, { ok, at: now });
  return ok;
}
export const forgetStaffForTests = () => staffCache.clear();

async function recent(channelId, max, discord) {
  const out = [];
  for (let before = ''; out.length < max;) {
    const page = await discord('GET', `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ''}`);
    out.push(...page);
    if (page.length < 100) break;
    before = page[page.length - 1].id;
  }
  return out;
}
export const sortButton = (m) => (m.components || []).flatMap((r) => r.components || []).find((c) => (c.custom_id || '').startsWith('sort:start:'));

/** Files waiting in #to-sort, oldest first: name, size, link, why the bot couldn't place it, its guess. */
export async function deskQueue({ discord = api } = {}) {
  const msgs = await recent(CHANNELS.toSort, 300, discord);
  const byId = new Map(msgs.map((m) => [m.id, m]));
  const items = [];
  for (const note of msgs) {
    const btn = sortButton(note);
    if (!btn) continue;
    const fileMsgId = btn.custom_id.split(':')[2];
    const file = byId.get(fileMsgId) || await discord('GET', `/channels/${CHANNELS.toSort}/messages/${fileMsgId}`).catch(() => null);
    const a = file?.attachments?.[0];
    if (!a) continue;
    items.push({
      fileMsgId, noteMsgId: note.id, name: a.filename, size: a.size, url: a.url, type: a.content_type || '',
      reason: (note.content.match(/Couldn't place this file\*\*: (.*)/) || [])[1] || '',
      suggestion: (note.content.match(/💡 Suggestion: ([A-Z]{3} \d{3})/) || [])[1] || '',
      snippet: (note.content.match(/Page 1 starts: "([\s\S]*?)"\n/) || [])[1] || '',
      at: file.timestamp,
    });
  }
  return items.reverse();
}

/** Sort one #to-sort file into units, shelves or #pdf-library. Every destination is resolved before anything moves. */
export async function deskSort({ fileMsgId, noteMsgId, targets } = {}, user, { discord = api, today = new Date().toISOString().slice(0, 10), via = 'dashboard' } = {}) {
  if (!/^\d{5,25}$/.test(String(fileMsgId || '')) || !/^\d{5,25}$/.test(String(noteMsgId || '')) || !Array.isArray(targets) || !targets.length) throw fail('Pick at least one destination.');
  const note = await discord('GET', `/channels/${CHANNELS.toSort}/messages/${noteMsgId}`);
  if (!sortButton(note)) throw fail('This file was already sorted.', 409);
  const plan = [];
  for (const t of targets.slice(0, 6)) {
    if (t?.kind === 'unit') {
      const code = normaliseCode(t.code);
      const posts = code ? await postsFor(code) : [];
      if (!posts.length) throw fail(`There's no post for ${String(t.code).slice(0, 20)}.`);
      plan.push({ label: posts[0].name, ids: posts.map((p) => p.id) });
    } else if (t?.kind === 'shelf') {
      const s = SHELVES.find((x) => x.id === t.id);
      if (!s) throw fail('Unknown shelf.');
      plan.push({ label: `📚 ${s.name}`, ids: [s.id] });
    } else if (t?.kind === 'library') plan.push({ label: '#pdf-library', ids: [CHANNELS.library] });
    else throw fail('Unknown destination.');
  }
  const parts = partsOf(note.content, fileMsgId);
  for (const p of plan) for (const id of p.ids) for (const part of parts) await forwardTo(id, part, CHANNELS.toSort);
  const labels = plan.map((p) => p.label);
  await discord('PATCH', `/channels/${CHANNELS.toSort}/messages/${noteMsgId}`, {
    content: `${note.content}\n\n✅ Sorted into ${labels.join(', ')} by ${String(user?.name || 'staff').slice(0, 60)} (${via}) on ${today}`,
    components: [], allowed_mentions: { parse: [] },
  });
  return { ok: true, sortedInto: labels };
}
