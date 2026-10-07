// Member side of the PC bot: the welcome guide DM, and noticing who's active (for the 14-day nudges).
import { Events } from 'discord.js';
import { PRICES, WHATSAPP } from '../../lib/config.js';
import { save, state, touch } from './state.js';

const DEPTS = [['mech', /mech|aero/i], ['abe', /agric|biosystem|abe/i], ['civil', /civil/i], ['eee', /electric|eee|biomed/i], ['egp', /egp|petroleum|energy|geospatial/i]];

// The forums that match a member's onboarding roles, e.g. "Mechanical Year 3" -> mech-year-3.
export function forumsFor(member, index) {
  const out = [];
  for (const role of member.roles.cache.values()) {
    const dept = DEPTS.find(([, re]) => re.test(role.name))?.[0];
    const year = Number((role.name.match(/([1-5])/) || [])[1]);
    const forum = dept && year && index.forums.get(`${dept}-year-${year}`);
    if (forum && !out.includes(forum)) out.push(forum);
  }
  return out;
}

export function welcomeGuide(name, ch) {
  const tips = [
    `**Your free week.** You've got 7 days of full access to the unit libraries. After that it's KES ${PRICES.basic} a semester (Basic) or KES ${PRICES.premium} once for the whole degree (Premium). Pay in #upgrade-to-premium.`,
    "**Find your units.** Each course and year has a forum (like `mech-year-2`) with one post per unit: past papers, CATs and notes. Fastest way: type `/find resource EMM 305` anywhere.",
    '**Books.** Textbooks sit on the topic shelves and in #pdf-library.',
    ch.dailyChannel && `**Practise daily.** A new problem from real KU past papers lands in <#${ch.dailyChannel.id}> every morning. Answer to build a streak 🔥 Want a ping? \`/daily on\`.`,
    `**Study with people.** \`/find group\` shows study groups and classmates; \`/group create\` starts one in <#${ch.groupsChannel.id}>.`,
    `**What's new.** Every Sunday <#${ch.digestChannel.id}> lists the files added that week.`,
  ].filter(Boolean);
  return [
    `👋 **Welcome to Engineering Study Hub, ${name}!** Here's how to get the most out of it:`,
    '',
    ...tips.map((t, n) => `**${n + 1}.** ${t}`),
    '',
    `Stuck or missing a unit? Ask in your year's forum, or WhatsApp us: ${WHATSAPP}`,
  ].join('\n');
}

export function wireMembers(client, setup, log) {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    touch(member.id);
    const sent = await member.send(welcomeGuide(member.displayName, setup.channels)).then(() => true, () => false);
    if (!sent) log(`📭 Couldn't DM the welcome guide to ${member.user.tag} (DMs closed).`);
  });
  client.on(Events.MessageCreate, (m) => { if (m.guildId && !m.author.bot) touch(m.author.id); });
  client.on(Events.MessageReactionAdd, (_r, user) => { if (!user.bot) touch(user.id); });
  client.on(Events.VoiceStateUpdate, (_old, now) => { if (now.channelId && !now.member?.user.bot) touch(now.id); });
}

// First start only: count everyone as active today, so nobody gets a "we miss you" DM until 14 days from now.
export async function seedActivity(guild) {
  if (state.seeded) return;
  const members = await guild.members.fetch();
  for (const m of members.values()) if (!m.user.bot) state.lastActive[m.id] ??= Date.now();
  state.seeded = true;
  save();
}
