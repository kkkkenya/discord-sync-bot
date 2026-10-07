// Slash commands and buttons for the community side, answered on Vercel so they work even when the PC bot is off:
//   /find resource|group   /group create|mine   /classmates on|off   /daily on|off   /nudges on|off
//   /streak   /leaderboard   and the buttons dp:* (daily problem) and grp:* (study groups and squads).
// Data lives in Supabase (lib/db.js); channels and roles are found by the names in config.NAMES.
import { api, isoDay } from './discord.js';
import { db, enc } from './db.js';
import { CHANNELS, COURSE_ROLE_MATCH, GUILD_ID, NAMES, POINTS, ROLES } from './config.js';
import { normaliseCode, postsFor, SHELVES } from './sorting.js';

const DAY = 24 * 3600 * 1000;
const ADMINISTRATOR = 1n << 3n;
const MANAGE_ROLES = 1n << 28n;
const json = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });
const say = (content, components = []) => json({ type: 4, data: { content: content.slice(0, 2000), components, flags: 64, allowed_mentions: { parse: [] } } });
const jump = (channelId, messageId) => `https://discord.com/channels/${GUILD_ID}/${channelId}${messageId ? `/${messageId}` : ''}`;
const clean = (s, n = 80) => String(s).replace(/[[\]]/g, '').slice(0, n);

const KIND = {
  paper: ['📝', 'Past paper'], notes: ['📒', 'Notes'], slides: ['📊', 'Slides'], book: ['📚', 'Book'], other: ['📄', 'File'],
};

const isStaff = (i) => (BigInt(i.member?.permissions || '0') & (ADMINISTRATOR | MANAGE_ROLES)) !== 0n;
const isPremium = (i) => (i.member?.roles || []).includes(ROLES.premium) || isStaff(i);
const nameOf = (i, user) => i.member?.nick || user.global_name || user.username;
const today = () => isoDay(new Date());
const yesterday = () => isoDay(new Date(Date.now() - DAY));

const channelByName = async (name) => (await api('GET', `/guilds/${GUILD_ID}/channels`)).find((c) => c.name === name);
const roleByName = async (name) => (await api('GET', `/guilds/${GUILD_ID}/roles`)).find((r) => r.name === name);
async function courseRolesOf(i) {
  const mine = i.member?.roles || [];
  const roles = await api('GET', `/guilds/${GUILD_ID}/roles`);
  return roles.filter((r) => mine.includes(r.id) && COURSE_ROLE_MATCH.test(r.name)).map((r) => r.id);
}

// "/find resource" with a subcommand gives options nested one level down.
const optionsOf = (list) => Object.fromEntries((list || []).map((o) => [o.name, o.value]));
function parse(i) {
  const first = i.data.options?.[0];
  return first?.type === 1 ? { sub: first.name, o: optionsOf(first.options) } : { sub: null, o: optionsOf(i.data.options) };
}

// ── /find resource ──
async function findResource(query, kind) {
  const code = normaliseCode(query);
  const filters = [`channel_id=neq.${CHANNELS.toSort}`];
  if (kind && kind !== 'any') filters.push(`kind=eq.${kind}`);
  let words = [];
  if (code) filters.push(`unit_code=eq.${enc(code)}`);
  else {
    words = query.toLowerCase().replace(/[(),.*:]/g, ' ').split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
    if (!words.length) return say('Type a unit code (like `EMM 305`) or a few words from the title.');
    filters.push(`and=(${words.map((w) => `name.ilike.*${enc(w)}*`).join(',')})`);
  }
  const files = await db.select('files', `${filters.join('&')}&select=name,kind,unit_code,channel_id,message_id&order=created_at.desc&limit=10`);

  const lines = [`🔎 **${code || clean(query, 60)}**`];
  if (code) for (const p of await postsFor(code)) lines.push(`📌 Unit post: <#${p.id}>`);
  else for (const s of SHELVES.filter((x) => words.some((w) => x.name.toLowerCase().includes(w)))) lines.push(`📚 Shelf: <#${s.id}>`);
  for (const f of files) {
    const [icon, label] = KIND[f.kind] || KIND.other;
    lines.push(`${icon} [${clean(f.name)}](${jump(f.channel_id, f.message_id)}) · ${label}${f.unit_code && !code ? ` · ${f.unit_code}` : ''}`);
  }
  if (lines.length === 1) lines.push(`Nothing found yet. Try the unit code, or ask in your year's forum. Missing something? Staff can add it.`);
  else if (files.length === 10) lines.push('_Showing the 10 newest. Add words to narrow it down._');
  return say(lines.join('\n'));
}

// ── groups and squads ──
const joinRow = (groups) => ({ type: 1, components: groups.slice(0, 5).map((g) => ({ type: 2, style: 1, label: clean(`Join ${g.name}`, 80), custom_id: `grp:join:${g.id}` })) });
const groupLine = (g) => `${g.kind === 'squad' ? '🛠️' : '📖'} **${clean(g.name, 60)}**${g.unit_code ? ` · ${g.unit_code}` : ''} · ${g.group_members.length}/${g.max_members}${g.thread_id ? ` · <#${g.thread_id}>` : ''}`;

async function findGroup(i, user, unit, type = 'all') {
  const code = unit ? normaliseCode(unit) : null;
  const lines = [];
  let open = [];
  if (type !== 'classmates') {
    const f = [];
    if (type === 'study' || type === 'squad') f.push(`kind=eq.${type}`);
    if (code) f.push(`unit_code=eq.${enc(code)}`);
    else if (unit) f.push(`name=ilike.*${enc(unit)}*`);
    const groups = await db.select('groups', `${f.map((x) => `${x}&`).join('')}select=*,group_members(user_id)&order=created_at.desc&limit=10`);
    if (groups.length) lines.push(`**Groups${code ? ` for ${code}` : ''}**`, ...groups.map(groupLine));
    open = groups.filter((g) => g.group_members.length < g.max_members && !g.group_members.some((m) => m.user_id === user.id));
  }
  if (type === 'classmates' || type === 'all') {
    const course = await courseRolesOf(i);
    if (course.length) {
      const people = await db.select('findable', `course_roles=ov.${enc(`{${course.join(',')}}`)}&user_id=neq.${user.id}&order=at.desc&limit=15`);
      if (people.length) lines.push('**Classmates open to study together**', ...people.map((p) => `👋 <@${p.user_id}>${p.note ? `: ${clean(p.note, 100)}` : ''}`));
      else if (type === 'classmates') lines.push('No classmates have opted in yet. Be the first: `/classmates on`.');
    } else if (type === 'classmates') lines.push('Pick your course and year in onboarding (Channels & Roles), then try again.');
  }
  if (!lines.length) lines.push(`No groups yet${code ? ` for ${code}` : ''}. Start one with \`/group create\`.`);
  return say(lines.join('\n'), open.length ? [joinRow(open)] : []);
}

async function createGroup(i, user, o) {
  const kind = o.type === 'squad' ? 'squad' : 'study';
  if (kind === 'squad' && !isPremium(i)) return say('Build squads are part of Premium. Study groups are free: use `type: study`.');
  const code = o.unit ? normaliseCode(o.unit) : null;
  if (o.unit && !code) return say(`"${clean(o.unit, 20)}" isn't a unit code. Use three letters and three numbers, like EMM 305.`);
  const name = clean(o.name, 60);
  const max = Math.min(20, Math.max(2, Number(o.size) || 8));
  const ch = await channelByName(NAMES.groupsChannel);
  if (!ch) return say(`#${NAMES.groupsChannel} isn't set up yet. Staff: start the PC bot once and it creates it.`);

  const thread = await api('POST', `/channels/${ch.id}/threads`, {
    name: `${kind === 'squad' ? '🛠️' : '📖'} ${code ? `${code} · ` : ''}${name}`.slice(0, 100), type: 11, auto_archive_duration: 10080,
  });
  await api('PUT', `/channels/${thread.id}/thread-members/${user.id}`);
  const [g] = await db.insert('groups', [{ kind, name, unit_code: code, owner_id: user.id, max_members: max, thread_id: thread.id }]);
  await db.insert('group_members', [{ group_id: g.id, user_id: user.id }]);
  await api('POST', `/channels/${thread.id}/messages`, {
    content: `${kind === 'squad' ? '🛠️ **Build squad**' : '📖 **Study group**'}: **${name}**${code ? ` for ${code}` : ''}\nStarted by <@${user.id}>, up to ${max} members. Others find it with \`/find group\`.`,
    components: [joinRow([g])], allowed_mentions: { parse: [] },
  });
  return say(`✅ Created **${name}**: <#${thread.id}>. Share the link, or people can find it with \`/find group${code ? ` ${code}` : ''}\`.`);
}

async function myGroups(user) {
  const rows = await db.select('group_members', `user_id=eq.${user.id}&select=groups(*,group_members(user_id))`);
  const groups = rows.map((r) => r.groups).filter(Boolean);
  if (!groups.length) return say("You're not in any group yet. Try `/find group` or `/group create`.");
  return say(['**Your groups**', ...groups.map(groupLine)].join('\n'), [{
    type: 1, components: groups.slice(0, 5).map((g) => ({ type: 2, style: 4, label: clean(`Leave ${g.name}`, 80), custom_id: `grp:leave:${g.id}` })),
  }]);
}

async function joinGroup(i, user, id) {
  const [g] = await db.select('groups', `id=eq.${Number(id)}&select=*,group_members(user_id)`);
  if (!g) return say('That group no longer exists.');
  if (g.kind === 'squad' && !isPremium(i)) return say('Build squads are part of Premium. Upgrade in #upgrade-to-premium.');
  if (g.group_members.some((m) => m.user_id === user.id)) return say(`You're already in **${g.name}**: <#${g.thread_id}>`);
  if (g.group_members.length >= g.max_members) return say(`**${g.name}** is full. Start your own with \`/group create\`.`);
  await db.insert('group_members', [{ group_id: g.id, user_id: user.id }], { ignoreDuplicates: true });
  if (g.thread_id) {
    await api('PATCH', `/channels/${g.thread_id}`, { archived: false }).catch(() => {});
    await api('PUT', `/channels/${g.thread_id}/thread-members/${user.id}`).catch(() => {});
    await api('POST', `/channels/${g.thread_id}/messages`, { content: `👋 <@${user.id}> joined.`, allowed_mentions: { users: [user.id] } }).catch(() => {});
  }
  return say(`✅ You're in **${g.name}**: <#${g.thread_id}>`);
}

async function leaveGroup(user, id) {
  const [g] = await db.select('groups', `id=eq.${Number(id)}`);
  await db.remove('group_members', `group_id=eq.${Number(id)}&user_id=eq.${user.id}`);
  if (g?.thread_id) await api('DELETE', `/channels/${g.thread_id}/thread-members/${user.id}`).catch(() => {});
  return say(g ? `You left **${g.name}**.` : 'Done.');
}

// ── daily problem ──
async function answer(i, user, problemId, choice) {
  const [p] = await db.select('problems', `id=eq.${Number(problemId)}&select=id,day,answer`);
  if (!p) return say('That problem no longer exists.');
  if (p.day !== today()) return say("This one's closed. Today's problem is the newest post in this channel.");
  const correct = choice === p.answer;
  const added = await db.insert('answers', [{ problem_id: p.id, user_id: user.id, choice, correct }], { ignoreDuplicates: true });
  if (!added.length) return say("You've already answered today's problem. The worked answer comes out tomorrow morning.");

  const [pl] = await db.select('players', `user_id=eq.${user.id}`);
  const streak = pl?.last_day === yesterday() ? pl.streak + 1 : pl?.last_day === today() ? pl.streak : 1;
  const points = (pl?.points || 0) + POINTS.answered + (correct ? POINTS.correct : 0);
  await db.upsert('players', [{ user_id: user.id, name: nameOf(i, user), points, streak, best: Math.max(pl?.best || 0, streak), last_day: today() }], 'user_id');

  let earned = '';
  if (streak === 7 || streak === 30) {
    const role = await roleByName(streak === 7 ? NAMES.streak7 : NAMES.streak30);
    if (role) await api('PUT', `/guilds/${GUILD_ID}/members/${user.id}/roles/${role.id}`).catch(() => {});
    earned = `🎉 **${streak}-day streak!** You earned the ${role ? `<@&${role.id}>` : 'streak'} role.`;
  }
  const letter = 'ABCD'[choice];
  return say([
    correct ? `✅ **${letter} is right!** +${POINTS.answered + POINTS.correct} points.` : `❌ **${letter} isn't it.** +${POINTS.answered} for showing up. The worked answer comes out tomorrow morning.`,
    `🔥 Streak: **${streak} day${streak === 1 ? '' : 's'}** · ⭐ ${points} points`,
    earned,
  ].filter(Boolean).join('\n'));
}

async function setDailyRole(i, user, on) {
  const role = await roleByName(NAMES.dailyRole);
  if (!role) return say(`The ${NAMES.dailyRole} role isn't set up yet. Staff: start the PC bot once and it creates it.`);
  const want = on ?? !(i.member?.roles || []).includes(role.id);
  await api(want ? 'PUT' : 'DELETE', `/guilds/${GUILD_ID}/members/${user.id}/roles/${role.id}`);
  return say(want ? `🔔 You'll be pinged for each daily problem in #${NAMES.dailyChannel}.` : '🔕 No more daily pings. You can still answer any time.');
}

async function streak(user) {
  const [pl] = await db.select('players', `user_id=eq.${user.id}`);
  if (!pl) return say(`No streak yet. Answer today's problem in #${NAMES.dailyChannel} to start one.`);
  const alive = pl.last_day === today() || pl.last_day === yesterday();
  const done = pl.last_day === today();
  return say([
    `🔥 Streak: **${alive ? pl.streak : 0}** day${alive && pl.streak === 1 ? '' : 's'} · best ${pl.best}`,
    `⭐ ${pl.points} points`,
    done ? "✅ You've answered today." : `⏳ Today's problem is waiting in #${NAMES.dailyChannel}.`,
  ].join('\n'));
}

async function leaderboard() {
  const [top, streaks] = await Promise.all([
    db.select('players', 'order=points.desc&limit=10'),
    db.select('players', `last_day=gte.${yesterday()}&streak=gt.1&order=streak.desc&limit=5`),
  ]);
  if (!top.length) return say(`No one's on the board yet. Answer today's problem in #${NAMES.dailyChannel}!`);
  const medal = (n) => ['🥇', '🥈', '🥉'][n] || `${n + 1}.`;
  return say([
    '🏆 **Leaderboard**',
    ...top.map((p, n) => `${medal(n)} <@${p.user_id}> · ${p.points} pts`),
    ...(streaks.length ? ['', '🔥 **Longest live streaks**', ...streaks.map((p) => `<@${p.user_id}> · ${p.streak} days`)] : []),
  ].join('\n'));
}

// ── entry points used by api/interactions.js ──
export async function handleCommand(i, user) {
  const { sub, o } = parse(i);
  switch (i.data.name) {
    case 'find':
      if (sub === 'resource') return findResource(String(o.query || ''), o.kind);
      if (sub === 'group') return findGroup(i, user, o.unit, o.type);
      break;
    case 'group':
      if (sub === 'create') return createGroup(i, user, o);
      if (sub === 'mine') return myGroups(user);
      break;
    case 'classmates':
      if (sub === 'on') {
        const course = await courseRolesOf(i);
        if (!course.length) return say('Pick your course and year in onboarding (Channels & Roles) first, so classmates can find you.');
        await db.upsert('findable', [{ user_id: user.id, name: nameOf(i, user), course_roles: course, note: o.note ? clean(o.note, 100) : null, at: new Date().toISOString() }], 'user_id');
        return say("👋 You're findable: classmates in your course and year see you in `/find group`. Turn it off with `/classmates off`.");
      }
      if (sub === 'off') {
        await db.remove('findable', `user_id=eq.${user.id}`);
        return say("You're hidden from `/find group` now.");
      }
      break;
    case 'daily': return setDailyRole(i, user, sub === 'on');
    case 'nudges':
      await db.upsert('prefs', [{ user_id: user.id, nudges: sub === 'on' }], 'user_id');
      return say(sub === 'on' ? "👍 We'll check in now and then with what's new in your units." : "🔕 No more check-in DMs. You'll still get payment and trial messages.");
    case 'streak': return streak(user);
    case 'leaderboard': return leaderboard();
  }
  return say('Unknown command.');
}

export async function handleComponent(i, user) {
  const [ns, action, id, extra] = i.data.custom_id.split(':');
  if (ns === 'dp' && action === 'ans') return answer(i, user, id, Number(extra));
  if (ns === 'dp' && action === 'role') return setDailyRole(i, user, null);
  if (ns === 'grp' && action === 'join') return joinGroup(i, user, id);
  if (ns === 'grp' && action === 'leave') return leaveGroup(user, id);
  return say('Unknown button.');
}
