// Data for the admin dashboard (staff only, via the signed esh_session cookie).
//   GET  /api/dash?op=queue    files waiting in #to-sort
//   GET  /api/dash?op=targets  every unit post, the book shelves and #pdf-library (for the picker)
//   POST /api/dash?op=sort     { fileMsgId, noteMsgId, targets: [{kind:'unit',code}|{kind:'shelf',id}|{kind:'library'}] }
//   GET  /api/dash?op=stats    members, trials, payments, money this semester
import { api, isoDay } from '../lib/discord.js';
import { CHANNELS, EXISTING, GUILD_ID, ROLES, SEMESTER_START, TRIAL_DAYS } from '../lib/config.js';
import { APPROVED, priceOf } from '../lib/plans.js';
import { allUnitPosts, SHELVES } from '../lib/sorting.js';
import { currentUser } from '../lib/session.js';
import { deskQueue, deskSort, sortButton } from '../lib/hub-desk.js';

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
    const ok = m.content.match(APPROVED);
    const plan = ok ? ok[1] : /Plan: \*\*Upgrade to Acrux/.test(m.content) ? 'vvipup' : /Plan: \*\*Upgrade/.test(m.content) ? 'upgrade'
      : /Plan: \*\*Acrux/.test(m.content) ? 'vvip' : /Plan: \*\*(Premium|Mimosa)/.test(m.content) ? 'premium' : 'basic';
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
    vvip: humans.filter((m) => has(m, ROLES.vvip)).length,
    trialsEnding,
    payments: {
      pending: payments.filter((p) => p.status === 'pending').length,
      approvedThisSemester: approvedThisSemester.length,
      revenueThisSemester: approvedThisSemester.reduce((s, p) => s + priceOf(p.plan, new Date(`${p.date}T12:00:00+03:00`)), 0),
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
    if (op === 'queue') return json(await deskQueue());
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
    return json(await deskSort(await request.json(), user));
  } catch (e) {
    if (e.status) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: e.message }, 502);
  }
}
