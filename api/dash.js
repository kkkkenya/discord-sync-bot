// Data for the admin dashboard (staff only, via the signed esh_session cookie).
//   GET  /api/dash?op=queue    files waiting in #to-sort
//   GET  /api/dash?op=targets  every unit post, the book shelves and #pdf-library (for the picker)
//   POST /api/dash?op=sort     { fileMsgId, noteMsgId, targets: [{kind:'unit',code}|{kind:'shelf',id}|{kind:'library'}] }
//   GET  /api/dash?op=stats    members, trials, payments, money this semester
import { api, isoDay } from '../lib/discord.js';
import { CHANNELS, EXISTING, GUILD_ID, PRICES, ROLES, SEMESTER_START, TRIAL_DAYS } from '../lib/config.js';
import { allUnitPosts, forwardTo, normaliseCode, partsOf, postsFor, SHELVES } from '../lib/sorting.js';
import { currentUser } from '../lib/session.js';

const DAY = 24 * 3600 * 1000;
const ADMINISTRATOR = 1n << 3n;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function recent(channelId, max) {
  const out = [];
  for (let before = ''; out.length < max;) {
    const page = await api('GET', `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ''}`);
    out.push(...page);
    if (page.length < 100) break;
    before = page[page.length - 1].id;
  }
  return out;
}

const sortButton = (m) => (m.components || []).flatMap((r) => r.components || []).find((c) => (c.custom_id || '').startsWith('sort:start:'));

async function queue() {
  const msgs = await recent(CHANNELS.toSort, 300);
  const byId = new Map(msgs.map((m) => [m.id, m]));
  const items = [];
  for (const note of msgs) {
    const btn = sortButton(note);
    if (!btn) continue;
    const fileMsgId = btn.custom_id.split(':')[2];
    const file = byId.get(fileMsgId) || await api('GET', `/channels/${CHANNELS.toSort}/messages/${fileMsgId}`).catch(() => null);
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
  return items.reverse(); // oldest first
}

async function sort(body, user) {
  const { fileMsgId, noteMsgId, targets } = body || {};
  if (!fileMsgId || !noteMsgId || !Array.isArray(targets) || !targets.length) return json({ error: 'Pick at least one destination.' }, 400);
  const note = await api('GET', `/channels/${CHANNELS.toSort}/messages/${noteMsgId}`);
  if (!sortButton(note)) return json({ error: 'This file was already sorted.' }, 409);

  // resolve every destination first, so a typo never leaves a file half-sorted
  const plan = [];
  for (const t of targets) {
    if (t.kind === 'unit') {
      const code = normaliseCode(t.code);
      const posts = code ? await postsFor(code) : [];
      if (!posts.length) return json({ error: `There's no post for ${t.code}.` }, 400);
      plan.push({ label: posts[0].name, ids: posts.map((p) => p.id) });
    } else if (t.kind === 'shelf') {
      const s = SHELVES.find((x) => x.id === t.id);
      if (!s) return json({ error: 'Unknown shelf.' }, 400);
      plan.push({ label: `📚 ${s.name}`, ids: [s.id] });
    } else if (t.kind === 'library') {
      plan.push({ label: '#pdf-library', ids: [CHANNELS.library] });
    }
  }
  const parts = partsOf(note.content, fileMsgId); // every part of a split book
  for (const p of plan) for (const id of p.ids) for (const part of parts) await forwardTo(id, part, CHANNELS.toSort);
  const labels = plan.map((p) => p.label);
  await api('PATCH', `/channels/${CHANNELS.toSort}/messages/${noteMsgId}`, {
    content: `${note.content}\n\n✅ Sorted into ${labels.join(', ')} by ${user.name} (dashboard) on ${isoDay(new Date())}`,
    components: [], allowed_mentions: { parse: [] },
  });
  return json({ ok: true, sortedInto: labels });
}

async function allMembers() {
  const out = [];
  for (let after = '0'; ;) {
    const page = await api('GET', `/guilds/${GUILD_ID}/members?limit=1000&after=${after}`);
    out.push(...page);
    if (page.length < 1000) return out;
    after = page[page.length - 1].user.id;
  }
}

async function stats() {
  const [members, roles, payMsgs, sortMsgs] = await Promise.all([
    allMembers(), api('GET', `/guilds/${GUILD_ID}/roles`), recent(CHANNELS.payments, 500), recent(CHANNELS.toSort, 300),
  ]);
  const staff = new Set(roles.filter((r) => BigInt(r.permissions) & ADMINISTRATOR).map((r) => r.id));
  const humans = members.filter((m) => !m.user.bot);
  const name = (m) => m.nick || m.user.global_name || m.user.username;
  const has = (m, id) => m.roles.includes(id);
  const now = Date.now();

  const trialsEnding = humans
    .filter((m) => has(m, ROLES.trial) && !has(m, ROLES.paid) && !has(m, ROLES.premium) && !m.roles.some((r) => staff.has(r)))
    .map((m) => {
      const joined = Date.parse(m.joined_at);
      return { name: name(m), ends: joined < EXISTING.cutoff.getTime() ? EXISTING.deadline.getTime() : joined + TRIAL_DAYS * DAY };
    })
    .filter((t) => t.ends - now < 7 * DAY)
    .sort((a, b) => a.ends - b.ends)
    .map((t) => ({ name: t.name, ends: new Date(t.ends).toISOString() }));

  const payments = payMsgs.filter((m) => m.content.startsWith('💰')).map((m) => {
    const ok = m.content.match(/✅ \*\*Approved (basic|premium)\*\* by <@\d+> on (\d{4}-\d{2}-\d{2})/);
    const plan = ok ? ok[1] : /Plan: \*\*Premium/.test(m.content) ? 'premium' : 'basic';
    return {
      who: (m.content.match(/from <@\d+> \(([^)]+)\)/) || [])[1] || '?',
      plan,
      status: ok ? 'approved' : /❌ \*\*Rejected/.test(m.content) ? 'rejected' : 'pending',
      date: ok ? ok[2] : m.timestamp.slice(0, 10),
    };
  });
  const approvedThisSemester = payments.filter((p) => p.status === 'approved' && new Date(`${p.date}T12:00:00+03:00`) >= SEMESTER_START);

  return {
    members: humans.length,
    joinedLast7Days: humans.filter((m) => now - Date.parse(m.joined_at) < 7 * DAY).length,
    trial: humans.filter((m) => has(m, ROLES.trial)).length,
    paid: humans.filter((m) => has(m, ROLES.paid)).length,
    premium: humans.filter((m) => has(m, ROLES.premium)).length,
    trialsEnding,
    payments: {
      pending: payments.filter((p) => p.status === 'pending').length,
      approvedThisSemester: approvedThisSemester.length,
      revenueThisSemester: approvedThisSemester.reduce((s, p) => s + PRICES[p.plan], 0),
      recent: payments.slice(0, 10),
    },
    toSort: sortMsgs.filter(sortButton).length,
  };
}

export async function GET(request) {
  const user = currentUser(request);
  if (!user) return json({ error: 'signed-out' }, 401);
  const op = new URL(request.url).searchParams.get('op');
  try {
    if (op === 'me') return json({ name: user.name });
    if (op === 'queue') return json(await queue());
    if (op === 'targets') return json({ units: allUnitPosts(), shelves: SHELVES });
    if (op === 'stats') return json(await stats());
  } catch (e) {
    console.error(e);
    return json({ error: e.message }, 502);
  }
  return json({ error: 'unknown op' }, 404);
}

export async function POST(request) {
  const user = currentUser(request);
  if (!user) return json({ error: 'signed-out' }, 401);
  if (new URL(request.url).searchParams.get('op') !== 'sort') return json({ error: 'unknown op' }, 404);
  try {
    return await sort(await request.json(), user);
  } catch (e) {
    console.error(e);
    return json({ error: e.message }, 502);
  }
}
