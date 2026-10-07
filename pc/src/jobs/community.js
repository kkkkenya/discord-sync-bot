// Retention jobs: the Sunday digest, 14-day check-ins, exam revision packs, streak upkeep and the weekly leaderboard.
import { CALENDAR, CHANNELS } from '../../../lib/config.js';
import { db } from '../../../lib/db.js';
import { fmtDay, isoDay, sleep } from '../../../lib/discord.js';
import { forumsFor } from '../members.js';
import { save, state } from '../state.js';

const DAY = 24 * 3600 * 1000;
const QUIET_DAYS = 14;
const MAX_NUDGES_PER_RUN = 40;   // keeps DMs gentle; Discord flags bots that mass-DM
const MAX_PACKS_PER_DAY = 150;   // revision packs go out over a few days for the same reason
const LABEL = { paper: 'past paper', notes: 'notes', slides: 'slides', book: 'book', other: 'file' };
const plural = (n, word) => `${n} ${word}${n === 1 || word.endsWith('s') ? '' : 's'}`;

async function newFiles(sinceMs) {
  return db.select('files', `created_at=gte.${new Date(sinceMs).toISOString()}&channel_id=neq.${CHANNELS.toSort}&select=unit_code,kind,channel_id,forum,dest_name&limit=5000`);
}

async function optedOut() {
  return new Set((await db.select('prefs', 'nudges=eq.false&select=user_id')).map((p) => p.user_id));
}

// Split long text into Discord-sized messages on line breaks.
function chunks(lines, max = 1900) {
  const out = [''];
  for (const l of lines) {
    if ((out[out.length - 1] + l).length + 1 > max) out.push('');
    out[out.length - 1] += `${l}\n`;
  }
  return out.filter((c) => c.trim());
}

// ── Sunday digest in #new-this-week ──
export async function runDigest(ctx) {
  const files = await newFiles(Date.now() - 7 * DAY);
  if (!files.length) return;
  const units = new Map(); // code -> { channel, kinds }
  const books = new Map(); // shelf/channel name -> count
  for (const f of files) {
    if (f.unit_code) {
      const u = units.get(f.unit_code) || { channel: f.channel_id, kinds: {} };
      u.kinds[f.kind] = (u.kinds[f.kind] || 0) + 1;
      units.set(f.unit_code, u);
    } else books.set(f.dest_name || 'library', (books.get(f.dest_name || 'library') || 0) + 1);
  }
  const lines = [`📚 **New this week: ${plural(files.length, 'file')} across ${plural(units.size, 'unit')}**`, ''];
  for (const [code, u] of [...units].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`• **${code}** <#${u.channel}>: ${Object.entries(u.kinds).map(([k, n]) => `${n} ${LABEL[k]}${n > 1 && k !== 'notes' && k !== 'slides' ? 's' : ''}`).join(', ')}`);
  }
  if (books.size) lines.push('', `📖 **Books and general files**: ${[...books].map(([n, c]) => `${n} (${c})`).join(', ')}`);
  lines.push('', 'Search any time with `/find resource` + a unit code. Missing something? Tell staff and we\'ll add it.');
  for (const c of chunks(lines)) await ctx.setup.channels.digestChannel.send({ content: c, allowedMentions: { parse: [] } });
}

// ── 14-day check-ins ──
export async function runNudges(ctx) {
  const members = await ctx.guild.members.fetch();
  const out = await optedOut();
  const now = Date.now();
  let sent = 0;
  for (const m of members.values()) {
    if (sent >= MAX_NUDGES_PER_RUN) break;
    if (m.user.bot || out.has(m.id) || m.permissions.has('Administrator')) continue;
    const last = state.lastActive[m.id] ?? now;
    if (now - last < QUIET_DAYS * DAY) continue;
    if (now - (state.lastNudged[m.id] || 0) < QUIET_DAYS * DAY) continue;

    const files = await newFiles(last);
    const mine = new Set(forumsFor(m, ctx.index).map((f) => f.name));
    const inMine = files.filter((f) => mine.has(f.forum)).length;
    const lines = [
      `Hi ${m.displayName}, it's been a little while! Here's what's new on Engineering Study Hub since you last dropped by:`,
      files.length ? `📚 **${plural(files.length, 'new file')}** in the library${inMine ? `, ${inMine} of them in your year's forum` : ''}.` : '📚 The unit libraries are all there when you need them.',
      ctx.setup.channels.dailyChannel && `🧠 Today's practice problem is waiting in <#${ctx.setup.channels.dailyChannel.id}>. One tap to start a streak 🔥`,
      '🔎 Looking for something? Type `/find resource` and a unit code.',
      `👥 Revising with others helps: \`/find group\` shows study groups for your units.`,
      '',
      '_Rather not get these? Type `/nudges off` in the server._',
    ];
    const ok = await m.send(lines.filter((l) => l !== false && l !== undefined).join('\n')).then(() => true, () => false);
    state.lastNudged[m.id] = now;
    if (ok) sent++;
    await sleep(1500);
  }
  save();
  if (sent) ctx.log(`💌 Sent ${plural(sent, 'check-in')} to quiet members.`);
}

// ── revision packs before exams ──
export async function runExamPush(ctx) {
  const start = Date.parse(`${CALENDAR.exams.start}T00:00:00+03:00`);
  const daysLeft = Math.round((start - Date.parse(`${isoDay(new Date())}T00:00:00+03:00`)) / DAY);
  // a three-day window starting examPushDaysBefore, so a PC that was off for a day still sends them
  if (daysLeft > CALENDAR.examPushDaysBefore || daysLeft < CALENDAR.examPushDaysBefore - 2) return;
  const key = CALENDAR.exams.start;
  const done = (state.examPushed[key] ||= {});
  const out = await optedOut();
  const members = await ctx.guild.members.fetch();
  let sent = 0;
  for (const m of members.values()) {
    if (sent >= MAX_PACKS_PER_DAY) break;
    if (m.user.bot || done[m.id] || out.has(m.id)) continue;
    const forums = forumsFor(m, ctx.index);
    const msg = [
      `📅 **${CALENDAR.exams.name} start ${fmtDay(new Date(start))}**, ${daysLeft} days from now. Here's your revision pack:`,
      forums.length ? `• **Your units**: ${forums.map((f) => `<#${f.id}>`).join(', ')}. Every unit post has its past papers and CATs.` : "• **Your units**: open your year's forum. Every unit post has its past papers and CATs.",
      '• **Past papers fast**: `/find resource EMM 305 kind:paper` (use your unit code).',
      '• **Revise with others**: `/find group`, or start one with `/group create`.',
      ctx.setup.channels.dailyChannel && `• **Daily practice**: <#${ctx.setup.channels.dailyChannel.id}>, one exam-style problem a day 🔥`,
      '',
      'You\'ve got this. 💪',
    ].filter((l) => l !== false && l !== undefined).join('\n');
    await m.send(msg).catch(() => {});
    done[m.id] = true;
    sent++;
    await sleep(1500);
  }
  save();
  if (sent) ctx.log(`📅 Sent ${plural(sent, 'revision pack')} (${daysLeft} days to exams).`);
}

// ── streaks: end the ones that lapsed and take back the streak roles ──
export async function runStreakUpkeep(ctx) {
  const yesterday = isoDay(new Date(Date.now() - DAY));
  const lapsed = await db.update('players', `last_day=lt.${yesterday}&streak=gt.0`, { streak: 0 });
  const roles = [ctx.setup.roles.streak7, ctx.setup.roles.streak30];
  for (const p of lapsed) {
    const m = await ctx.guild.members.fetch(p.user_id).catch(() => null);
    for (const r of roles) if (m?.roles.cache.has(r.id)) await m.roles.remove(r).catch(() => {});
  }
}

// ── Monday leaderboard in #daily-problems ──
export async function runLeaderboard(ctx) {
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const week = await db.select('answers', `at=gte.${since}&select=user_id,correct`);
  if (!week.length) return;
  const score = new Map();
  for (const a of week) {
    const s = score.get(a.user_id) || { answered: 0, right: 0 };
    s.answered++; if (a.correct) s.right++;
    score.set(a.user_id, s);
  }
  const top = [...score].sort(([, a], [, b]) => b.right - a.right || b.answered - a.answered).slice(0, 10);
  const streaks = await db.select('players', `last_day=gte.${isoDay(new Date(Date.now() - DAY))}&streak=gt.1&order=streak.desc&limit=5`);
  const medal = (n) => ['🥇', '🥈', '🥉'][n] || `${n + 1}.`;
  await ctx.setup.channels.dailyChannel.send({
    content: [
      `🏆 **Last week's top problem-solvers** (${plural(week.length, 'answer')} from ${plural(score.size, 'member')})`,
      ...top.map(([id, s], n) => `${medal(n)} <@${id}> · ${s.right}/${s.answered} right`),
      ...(streaks.length ? ['', '🔥 **Longest live streaks**', ...streaks.map((p) => `<@${p.user_id}> · ${p.streak} days`)] : []),
      '', 'New week, clean slate. `/streak` shows yours.',
    ].join('\n'),
    allowedMentions: { parse: [] },
  });
}
