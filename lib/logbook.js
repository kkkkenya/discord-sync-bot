// Study Hub Milestones commands, answered on Vercel:
//   /log  /unlog  /goal  /progress  /board  /milestone done|own|undo|list  /interest add|remove|list  /suggest
//   (+ autocomplete for tracks and milestone names)
// and, for the daily job, the Sunday recap and the streak-saver DMs. Free for everyone until MILESTONES_FREE_UNTIL,
// then logging is a Premium feature (progress, the board and the recap stay open to all). Tracks, milestones and date maths live in lib/milestones.js.
import { api, dm, sleep } from './discord.js';
import { db, enc } from './db.js';
import { GUILD_ID, MILESTONES_FREE_UNTIL, NAMES, PRICES, ROLES } from './config.js';
import {
  CYCLE, MILESTONES, MS, TRACK, TRACKS as TRACKS_LIST, addDays, dayLabel, daysWithin, diffDays, hours, streakOf, summarise, today,
} from './milestones.js';

export const BOARD_URL = 'https://discord-sync-bot.vercel.app/board/';

const json = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });
const say = (content) => json({ type: 4, data: { content: content.slice(0, 2000), flags: 64, allowed_mentions: { parse: [] } } });
const shout = (content) => json({ type: 4, data: { content: content.slice(0, 2000), allowed_mentions: { parse: [] } } });
const nameOf = (i, user) => i.member?.nick || user.global_name || user.username;
const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const fmtFree = () => new Date(`${MILESTONES_FREE_UNTIL}T12:00:00+03:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Africa/Nairobi' });

// ── Premium gate: free for everyone until MILESTONES_FREE_UNTIL ──
const isPremium = (i) => (i.member?.roles || []).includes(ROLES.premium) || (BigInt(i.member?.permissions || '0') & ((1n << 3n) | (1n << 28n))) !== 0n;
export const isFreePeriod = (day = today()) => day <= MILESTONES_FREE_UNTIL;
const paywall = () => say([
  `🔒 Study Hub Milestones was free for everyone until ${fmtFree()}. Logging is now part of **Premium** (KES ${PRICES.premium}, yours for life).`,
  'Upgrade in #upgrade-to-premium and your streak, milestones and board history carry straight on.',
  `You can still see everyone's progress with \`/board\` and ${BOARD_URL}`,
].join('\n'));

// A track is a preset id, one of the member's own interests ('own:<slug>'), or new text, which becomes an interest.
async function resolveTrack(user, raw) {
  const v = clean(raw, 60);
  if (TRACK[v]) return { id: v, name: TRACK[v].name };
  const mine = await db.select('log_tracks', `user_id=eq.${user.id}`);
  const typed = v.replace(/^new:/, '');
  const hit = mine.find((t) => t.id === v || t.name.toLowerCase() === typed.toLowerCase());
  if (hit) return { id: hit.id, name: hit.name };
  const preset = Object.values(TRACK).find((t) => t.name.toLowerCase() === typed.toLowerCase());
  if (preset) return { id: preset.id, name: preset.name };
  const name = clean(typed, 40);
  if (name.length < 2) return { error: 'Pick a track from the list, or type a name for your own interest (2 to 40 letters).' };
  if (mine.length >= 10) return { error: 'You have 10 interests already. Remove one with `/interest remove` first.' };
  const id = `own:${slug(name) || Date.now().toString(36)}`;
  await db.insert('log_tracks', [{ user_id: user.id, id, name }], { ignoreDuplicates: true });
  return { id, name, added: true };
}
const roleByName = async (name) => (await api('GET', `/guilds/${GUILD_ID}/roles`)).find((r) => r.name === name);

async function touchMember(i, user) {
  const [m] = await db.select('log_members', `user_id=eq.${user.id}&select=joined`);
  await db.upsert('log_members', [{
    user_id: user.id, name: clean(nameOf(i, user), 60), avatar: user.avatar || null, joined: m?.joined || today(), updated_at: new Date().toISOString(),
  }], 'user_id');
}

// PostgREST returns at most 1000 rows per request, so page through bigger reads.
export async function selectAll(table, qs) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await db.select(table, `${qs}&limit=1000&offset=${offset}`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// Every log of one member, newest first.
const logsOf = (userId) => selectAll('log_entries', `user_id=eq.${userId}&select=user_id,day,minutes,track,track_name&order=day.desc,id.desc`);

// ── /log ──
async function log(i, user, o) {
  const what = clean(o.what, 280);
  if (what.length < 3) return say('Write a line about what you did, e.g. `Finished MATLAB Onramp module 4`.');
  const link = o.link ? clean(o.link, 300) : null;
  if (link && !/^https?:\/\/\S+$/i.test(link)) return say('The proof link should be a web address starting with https://');
  const day = o.day === 'yesterday' ? addDays(today(), -1) : today();
  const minutes = Math.max(0, Math.min(720, Number(o.minutes) || 0));

  await touchMember(i, user);
  const t = await resolveTrack(user, o.track);
  if (t.error) return say(t.error);
  await db.insert('log_entries', [{ user_id: user.id, day, track: t.id, track_name: t.name, what, minutes, link }]);
  const logs = await logsOf(user.id);
  const streak = streakOf(summarise(logs).get(user.id).days);
  // 7- and 30-day streak roles, once, on the first log that reaches them
  let earned = null;
  const roleName = streak === 30 ? NAMES.logStreak30 : streak === 7 ? NAMES.logStreak7 : null;
  if (roleName && logs.filter((l) => l.day === day).length === 1) {
    const role = await roleByName(roleName).catch(() => null);
    if (role) {
      await api('PUT', `/guilds/${GUILD_ID}/members/${user.id}/roles/${role.id}`).catch(() => {});
      earned = `🎉 **${streak}-day streak!** That earns the <@&${role.id}> role.`;
    }
  }
  return shout([
    `📝 **${clean(nameOf(i, user), 60)}** · ${dayLabel(day)}${o.day === 'yesterday' ? ' (yesterday)' : ''} · 🔥 ${streak}-day streak`,
    `> **[${t.name}]** ${minutes ? `${minutes} min · ` : ''}${what}`,
    link ? `> <${link}>` : null,
    t.added ? `_New interest: **${t.name}**. It's in your \`/log\` track list from now on._` : null,
    earned,
  ].filter(Boolean).join('\n'));
}

async function unlog(user) {
  const [last] = await db.select('log_entries', `user_id=eq.${user.id}&select=id,day,what&order=created_at.desc&limit=1`);
  if (!last) return say("You haven't logged anything yet. Start with `/log`.");
  await db.remove('log_entries', `id=eq.${last.id}`);
  return say(`🗑️ Deleted your log from ${last.day}: "${clean(last.what, 80)}". The message in the channel stays; delete it by hand if you want.`);
}

async function goal(i, user, text) {
  await touchMember(i, user);
  await db.update('log_members', `user_id=eq.${user.id}`, { goal: clean(text, 140) });
  return say(`🎯 Goal saved: **${clean(text, 140)}**. It shows on the board: ${BOARD_URL}`);
}

// ── /progress ──
async function progress(i, user, o) {
  const target = o.member || user.id;
  const [[m], logs, ms] = await Promise.all([
    db.select('log_members', `user_id=eq.${target}`),
    logsOf(target),
    db.select('log_milestones', `user_id=eq.${target}&order=day.desc`),
  ]);
  if (!m) return say(target === user.id ? 'No logs yet. Start with `/log` and your progress shows up here.' : `<@${target}> hasn't logged anything yet.`);
  const s = summarise(logs).get(target) || { days: new Set(), mins: 0, minsByDay: new Map() };
  const byTrack = {};
  const tname = {};
  for (const l of logs) { byTrack[l.track] = (byTrack[l.track] || 0) + (l.minutes || 0); if (l.track_name) tname[l.track] = l.track_name; }
  // last 4 weeks, oldest first, one square per day
  const squares = [];
  for (let k = 27; k >= 0; k--) {
    const d = addDays(today(), -k), mins = s.minsByDay.get(d);
    squares.push(mins == null ? '⬛' : mins >= 120 ? '🟪' : mins >= 60 ? '🟦' : '🟩');
  }
  const weeks = [0, 7, 14, 21].map((k) => squares.slice(k, k + 7).join('')).join('\n');
  const text = [
    `📈 **${m.name}** · ${dayLabel(today())}`,
    m.goal ? `🎯 ${m.goal}` : null,
    `🔥 ${streakOf(s.days)}-day streak · ${s.days.size} day${s.days.size === 1 ? '' : 's'} logged · ${hours(s.mins)} h · ${ms.length} milestone${ms.length === 1 ? '' : 's'}`,
    Object.keys(byTrack).length ? Object.entries(byTrack).sort((a, b) => b[1] - a[1]).map(([t, mins]) => `${tname[t] || TRACK[t]?.name || t}: ${hours(mins)} h`).join(' · ') : null,
    `Last 4 weeks:\n${weeks}`,
    ms.length ? `🏁 Latest: ${ms.slice(0, 3).map((x) => x.title).join(' · ')}` : null,
    `Full year: ${BOARD_URL}`,
  ].filter(Boolean).join('\n');
  return o.share ? shout(text) : say(text);
}

// ── /board ──
async function board() {
  const since = addDays(today(), -60);
  const [members, logs] = await Promise.all([
    db.select('log_members', 'select=user_id,name'),
    selectAll('log_entries', `day=gte.${since}&select=user_id,day,minutes&order=id`),
  ]);
  if (!members.length) return say('Nobody has logged yet. Be the first: `/log`.');
  const sum = summarise(logs);
  const rows = members.map((m) => {
    const s = sum.get(m.user_id) || { days: new Set() };
    return { ...m, streak: streakOf(s.days), d30: daysWithin(s.days, 30) };
  }).filter((r) => r.d30 > 0).sort((a, b) => b.streak - a.streak || b.d30 - a.d30).slice(0, 10);
  const medal = (n) => ['🥇', '🥈', '🥉'][n] || `${n + 1}.`;
  return say([
    `🏆 **Study Hub Milestones** · ${dayLabel(today())}`,
    ...(rows.length ? rows.map((r, n) => `${medal(n)} <@${r.user_id}> · 🔥 ${r.streak} · ${r.d30}/30 days`) : ['Nobody has logged in the last 30 days.']),
    `Everyone's year: ${BOARD_URL}`,
  ].join('\n'));
}

// ── /milestone ──
async function milestone(i, user, sub, o) {
  if (sub === 'list') {
    const done = new Map((await db.select('log_milestones', `user_id=eq.${user.id}`)).map((r) => [r.milestone_id, r]));
    const tracks = o.track ? [o.track] : Object.keys(MILESTONES);
    const lines = [];
    for (const t of tracks) {
      if (!MILESTONES[t]) continue;
      lines.push(`**${TRACK[t].name}**`, ...MILESTONES[t].map(([id, title, by]) => (done.has(id) ? `✅ ~~${title}~~ (${done.get(id).day})` : `⬜ ${title} · target ${by}`)));
    }
    const own = [...done.values()].filter((r) => r.milestone_id.startsWith('own:'));
    if (own.length && !o.track) lines.push('**Your own**', ...own.map((r) => `✅ ${r.title} (${r.day})`));
    if (!lines.length) lines.push('"My field" has no preset milestones. Add yours with `/milestone own`.');
    return say(lines.join('\n'));
  }
  if (sub === 'done' || sub === 'own') {
    let row;
    if (sub === 'done') {
      const ms = MS[o.milestone];
      if (!ms) return say('Pick a milestone from the list that pops up as you type.');
      row = { milestone_id: ms.id, title: ms.title, track: ms.track };
    } else {
      const title = clean(o.title, 100);
      if (title.length < 3) return say('Give your milestone a name, e.g. `Passed Thermodynamics II`.');
      row = { milestone_id: `own:${slug(title) || Date.now()}`, title, track: TRACK[o.track] ? o.track : 'other' };
    }
    await touchMember(i, user);
    const added = await db.insert('log_milestones', [{ user_id: user.id, day: today(), ...row }], { ignoreDuplicates: true });
    if (!added.length) return say(`You already ticked **${row.title}**.`);
    const others = sub === 'done' ? (await db.select('log_milestones', `milestone_id=eq.${enc(row.milestone_id)}&select=user_id`)).length : 0;
    const nth = others > 1 ? ` · ${ordinal(others)} in the server to get here` : others === 1 && sub === 'done' ? ' · first in the server!' : '';
    return shout(`🏁 **${clean(nameOf(i, user), 60)}** hit a milestone: **${row.title}** (${TRACK[row.track]?.name || row.track}) · ${dayLabel(today())}${nth}`);
  }
  if (sub === 'undo') {
    const gone = await db.remove('log_milestones', `user_id=eq.${user.id}&milestone_id=eq.${enc(o.milestone || '')}`);
    return say(gone.length ? `↩️ Unticked **${gone[0].title}**.` : "That milestone isn't ticked.");
  }
  return say('Unknown milestone action.');
}
// ── /interest: members' own tracks, and /suggest for new presets ──
async function interest(i, user, sub, o) {
  if (sub === 'add') {
    await touchMember(i, user);
    const t = await resolveTrack(user, `new:${o.name || ''}`);
    if (t.error) return say(t.error);
    if (!t.added) return say(`**${t.name}** is already in your \`/log\` track list.`);
    return say(`✅ Added **${t.name}**. Pick it in \`/log\` from now on. Want it as a track with milestones for everyone? \`/suggest\` it.`);
  }
  if (sub === 'remove') {
    const gone = await db.remove('log_tracks', `user_id=eq.${user.id}&id=eq.${enc(o.name || '')}`);
    return say(gone.length ? `Removed **${gone[0].name}** from your list. Your old logs keep it.` : "That isn't one of your interests. `/interest list` shows them.");
  }
  const mine = await db.select('log_tracks', `user_id=eq.${user.id}&order=name`);
  return say(mine.length ? ['**Your own interests**', ...mine.map((t) => `• ${t.name}`), '', 'Add more with `/interest add`, or just type a new name in `/log`.'].join('\n')
    : 'No interests of your own yet. Add one with `/interest add`, or type any name in the track box of `/log`.');
}

async function suggest(i, user, text) {
  const idea = clean(text, 300);
  if (idea.length < 3) return say('Tell us the course, skill or milestone you want added.');
  const ch = (await api('GET', `/guilds/${GUILD_ID}/channels`)).find((c) => c.name === NAMES.botLog);
  if (!ch) return say("Thanks! The suggestions inbox isn't set up yet, so post it in the server chat for now.");
  await api('POST', `/channels/${ch.id}/messages`, { content: `💡 **Milestones suggestion** from <@${user.id}> (${clean(nameOf(i, user), 60)}):\n> ${idea}`, allowed_mentions: { parse: [] } });
  return say('💡 Thanks! Staff read every suggestion. Popular ones become tracks or milestones for everyone.');
}

const ordinal = (n) => `${n}${(n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

// ── entry points used by lib/commands.js and api/interactions.js ──
export const LOG_COMMANDS = ['log', 'unlog', 'goal', 'progress', 'board', 'milestone', 'interest', 'suggest'];

export function handleLogCommand(i, user, sub, o) {
  const name = i.data.name;
  const writes = ['log', 'goal'].includes(name) || (name === 'milestone' && ['done', 'own'].includes(sub)) || (name === 'interest' && sub === 'add');
  if (writes && !isFreePeriod() && !isPremium(i)) return paywall();
  switch (name) {
    case 'interest': return interest(i, user, sub, o);
    case 'suggest': return suggest(i, user, o.text);
    case 'log': return log(i, user, o);
    case 'unlog': return unlog(user);
    case 'goal': return goal(i, user, o.text);
    case 'progress': return progress(i, user, o);
    case 'board': return board();
    case 'milestone': return milestone(i, user, sub, o);
  }
  return say('Unknown command.');
}

// Autocomplete (Discord sends interaction type 4 while typing): /log track, /interest remove, /milestone done|undo.
export async function handleLogAutocomplete(i, user) {
  const sub = i.data.options?.[0];
  if (i.data.name === 'log' || i.data.name === 'interest') {
    const opts = i.data.name === 'log' ? i.data.options : sub?.options;
    const q = clean((opts || []).find((x) => x.focused)?.value, 40);
    const mine = (await db.select('log_tracks', `user_id=eq.${user.id}&order=name`)).map((t) => ({ name: t.name, value: t.id }));
    const presets = i.data.name === 'log' ? TRACKS_LIST.map((t) => ({ name: t.name, value: t.id })) : [];
    const list = [...presets, ...mine].filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
    if (i.data.name === 'log' && q.length >= 2 && !list.some((c) => c.name.toLowerCase() === q.toLowerCase())) list.push({ name: `➕ Add "${q}" as your own interest`, value: `new:${q}` });
    return json({ type: 8, data: { choices: list.slice(0, 25).map((c) => ({ name: c.name.slice(0, 100), value: c.value.slice(0, 100) })) } });
  }
  const focused = (sub?.options || []).find((x) => x.focused);
  const q = String(focused?.value || '').toLowerCase();
  let pool;
  if (sub?.name === 'undo') {
    pool = (await db.select('log_milestones', `user_id=eq.${user.id}&select=milestone_id,title,track`)).map((r) => ({ id: r.milestone_id, title: r.title, track: r.track }));
  } else {
    const done = new Set((await db.select('log_milestones', `user_id=eq.${user.id}&select=milestone_id`)).map((r) => r.milestone_id));
    pool = Object.values(MS).filter((m) => !done.has(m.id));
  }
  const choices = pool
    .filter((m) => !q || m.title.toLowerCase().includes(q) || (TRACK[m.track]?.name || '').toLowerCase().includes(q))
    .slice(0, 25)
    .map((m) => ({ name: `${TRACK[m.track]?.name || m.track}: ${m.title}`.slice(0, 100), value: m.id }));
  return json({ type: 8, data: { choices } });
}

// ── Sunday recap, posted by the daily job in #daily-logs ──
export async function weeklyRecap(now = today(), { dry = false } = {}) {
  const from = addDays(now, -7), to = addDays(now, -1); // the week that just ended (Sun–Sat)
  const [members, logs, ms] = await Promise.all([
    db.select('log_members', 'select=user_id,name'),
    selectAll('log_entries', `day=gte.${addDays(now, -60)}&select=user_id,day,minutes&order=id`),
    db.select('log_milestones', `day=gte.${from}&day=lte.${to}&select=user_id,title`),
  ]);
  const week = logs.filter((l) => l.day >= from && l.day <= to);
  const sum = summarise(logs);
  const active = new Set(week.map((l) => l.user_id));
  const name = new Map(members.map((m) => [m.user_id, m.name]));
  const top = members.map((m) => [m.user_id, streakOf(sum.get(m.user_id)?.days || new Set(), to)]).filter(([, s]) => s > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const content = [
    `📊 **Study Hub Milestones · week of ${from} to ${to}** · ${dayLabel(to)}`,
    `${active.size} member${active.size === 1 ? '' : 's'} logged · ${new Set(week.map((l) => `${l.user_id}:${l.day}`)).size} days · ${hours(week.reduce((n, l) => n + (l.minutes || 0), 0))} hours`,
    top.length ? `\n🔥 **Top streaks**\n${top.map(([id, s], n) => `${n + 1}. ${name.get(id) || 'Someone'}: ${s} days`).join('\n')}` : null,
    ms.length ? `\n🏁 **Milestones this week**\n${ms.map((x) => `• ${name.get(x.user_id) || 'Someone'}: ${x.title}`).join('\n')}` : null,
    isFreePeriod(now) && diffDays(now, MILESTONES_FREE_UNTIL) <= 21 ? `\n⏳ Free for everyone until ${fmtFree()}. After that, logging is part of Premium.` : null,
    `\nNew week, new streak. \`/log\` what you do today. Everyone's year: ${BOARD_URL}`,
  ].filter(Boolean).join('\n');
  const report = { posted: false, active: active.size };
  if (dry || (!active.size && diffDays(CYCLE.start, now) < 0)) return { ...report, content };
  const ch = (await api('GET', `/guilds/${GUILD_ID}/channels`)).find((c) => c.name === NAMES.logsChannel);
  if (!ch) return { ...report, error: `#${NAMES.logsChannel} not found` };
  await api('POST', `/channels/${ch.id}/messages`, { content: content.slice(0, 2000), allowed_mentions: { parse: [] } });
  return { ...report, posted: true };
}


// ── Streak savers, sent by the daily job at 09:00: you logged the day before yesterday but not yesterday, so the streak
// breaks tonight unless you log yesterday now. Members who turned nudges off are skipped.
export async function streakSavers(now = today(), { dry = false } = {}) {
  const y = addDays(now, -1), d2 = addDays(now, -2);
  const [logs, off] = await Promise.all([
    selectAll('log_entries', `day=gte.${addDays(now, -120)}&select=user_id,day,minutes&order=id`),
    db.select('prefs', 'nudges=eq.false&select=user_id'),
  ]);
  const quiet = new Set(off.map((p) => p.user_id));
  const due = [];
  for (const [uid, s] of summarise(logs)) {
    if (quiet.has(uid) || s.days.has(y) || s.days.has(now) || !s.days.has(d2)) continue;
    const n = streakOf(s.days, d2);
    if (n >= 3) due.push({ uid, n });
  }
  const report = { due: due.length, sent: 0 };
  if (dry) return report;
  for (const { uid, n } of due.slice(0, 60)) {
    if (!isFreePeriod(now)) {
      const m = await api('GET', `/guilds/${GUILD_ID}/members/${uid}`).catch(() => null);
      if (!m || !m.roles.includes(ROLES.premium)) continue;
    }
    if (await dm(uid, `🔥 Your ${n}-day Study Hub streak breaks tonight: nothing was logged yesterday. Use \`/log\` with \`day: yesterday\` today to keep it going. (Turn these off with \`/nudges off\`.)`)) report.sent++;
    await sleep(300);
  }
  return report;
}
