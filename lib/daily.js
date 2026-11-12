// The once-a-day job: ends free trials, sends reminders, handles Basic's and Premium's semester renewals, and runs
// Study Hub Milestones: today's tasks in #daily-logs, streak-saver DMs, and the recap on Sundays.
// Every reminder uses a one-day window, so a job that runs daily sends each reminder exactly once.
// runDaily(now, { dry: true }) reports what it would do without changing anything.
import { api, dm, fmtDay, isoDay, sleep } from './discord.js';
import { morningPost, streakSavers, weeklyRecap } from './logbook.js';
import { access } from './plans.js';
import {
  CHANNELS, EXISTING, GUILD_ID, MPESA, PRICES, REMIND_DAYS_BEFORE, RENEW_REMIND_DAYS_BEFORE, ROLES, TRIAL_DAYS,
} from './config.js';

const DAY = 24 * 3600 * 1000;
const howToPay = `Send **KES ${PRICES.basic}** by M-Pesa to **${MPESA.number} (${MPESA.name})**, then press **I've paid** in #plans.`;

const MSG = {
  trialReminder: (name, end) => `Hi ${name}, your free week on Engineering Study Hub ends on **${fmtDay(end)}**.\nTo keep access to the unit libraries (past papers, CATs, notes), it's **KES ${PRICES.basic} for the whole semester**.\n${howToPay}`,
  trialEnded: (name) => `Hi ${name}, your 7-day free trial on Engineering Study Hub has ended.\nYou can still chat in the community channels and see every unit in your department's library.\nTo open the libraries again: ${howToPay}`,
  existingReminder: (role) => `<@&${role}> Reminder: free access to the unit libraries ends on **${fmtDay(EXISTING.deadline)}**, in 2 days.\n${howToPay}`,
  renewReminder: (name, due) => `Hi ${name}, your Engineering Study Hub semester access ends on **${fmtDay(due)}**.\nRenew for KES ${PRICES.basic}: ${howToPay}`,
  renewEnded: (name) => `Hi ${name}, your semester access to the unit libraries has ended.\nRenew any time: ${howToPay}`,
  premiumReminder: (name, due) => `Hi ${name}, your Mimosa plan ends on **${fmtDay(due)}**.\nKeep it next semester: send **KES ${PRICES.premium}** by M-Pesa to **${MPESA.number} (${MPESA.name})**, then press **I've paid** in #plans and pick Mimosa.`,
  premiumEnded: (name) => `Hi ${name}, your Mimosa plan for this semester has ended.\nMimosa is **KES ${PRICES.premium} a semester**, or **KES ${PRICES.upgrade}** to upgrade if you have Gacrux. Send it by M-Pesa to **${MPESA.number} (${MPESA.name})**, then press **I've paid** in #plans.`,
};

async function allMembers() {
  const out = [];
  for (let after = '0'; ;) {
    const page = await api('GET', `/guilds/${GUILD_ID}/members?limit=1000&after=${after}`);
    out.push(...page);
    if (page.length < 1000) return out;
    after = page[page.length - 1].user.id;
  }
}

// The latest approval of each plan per member, read from the #payments log written by /api/interactions.
async function approvals() {
  const latest = new Map(); // userId -> { basic, premium, upgrade } (dates)
  for (let before = ''; ;) {
    const page = await api('GET', `/channels/${CHANNELS.payments}/messages?limit=100${before ? `&before=${before}` : ''}`);
    for (const m of page) {
      const who = m.content.match(/from <@(\d+)>/);
      const ok = m.content.match(/✅ \*\*Approved (basic|premium|upgrade)\*\* by <@\d+> on (\d{4}-\d{2}-\d{2})/);
      if (!who || !ok) continue;
      const date = new Date(`${ok[2]}T12:00:00+03:00`);
      const rec = latest.get(who[1]) || {};
      if (!rec[ok[1]] || rec[ok[1]] < date) rec[ok[1]] = date;
      latest.set(who[1], rec);
    }
    if (page.length < 100) return latest;
    before = page[page.length - 1].id;
  }
}

export async function runDaily(now = new Date(), { dry = false } = {}) {
  const report = { now: now.toISOString(), dry, trialReminders: [], trialsEnded: [], existingReminder: false, renewalReminders: [], renewalsEnded: [] };
  const roles = await api('GET', `/guilds/${GUILD_ID}/roles`);
  const staff = new Set(roles.filter((r) => BigInt(r.permissions) & (1n << 3n)).map((r) => r.id));
  const members = await allMembers();
  const name = (m) => m.nick || m.user.global_name || m.user.username;
  const isPaid = (m) => m.roles.some((r) => r === ROLES.paid || r === ROLES.premium || staff.has(r));

  // 1. free trials
  for (const m of members) {
    if (m.user.bot || !m.roles.includes(ROLES.trial) || isPaid(m)) continue;
    const existing = new Date(m.joined_at) < EXISTING.cutoff;
    const end = existing ? EXISTING.deadline : new Date(new Date(m.joined_at).getTime() + TRIAL_DAYS * DAY);
    const left = end - now;
    if (left <= 0) {
      if (existing && !EXISTING.announced) continue;
      report.trialsEnded.push(name(m));
      if (dry) continue;
      await api('DELETE', `/guilds/${GUILD_ID}/members/${m.user.id}/roles/${ROLES.trial}`);
      if (!existing) await dm(m.user.id, MSG.trialEnded(name(m))); // existing members were told in #announcements
      await sleep(300);
    } else if (!existing && left <= REMIND_DAYS_BEFORE * DAY && left > (REMIND_DAYS_BEFORE - 1) * DAY) {
      report.trialReminders.push(name(m));
      if (!dry) await dm(m.user.id, MSG.trialReminder(name(m), end));
    }
  }

  // 2. one reminder in #announcements for the members who had free access before the trial existed
  const remindFrom = EXISTING.deadline.getTime() - (REMIND_DAYS_BEFORE + 1) * DAY;
  if (EXISTING.announced && now >= remindFrom && now < remindFrom + DAY) {
    report.existingReminder = true;
    if (!dry) {
      const chans = await api('GET', `/guilds/${GUILD_ID}/channels`);
      const ann = chans.find((c) => c.name === 'announcements');
      if (ann) await api('POST', `/channels/${ann.id}/messages`, { content: MSG.existingReminder(ROLES.trial), allowed_mentions: { roles: [ROLES.trial] } });
    }
  }

  // 3. Basic and Premium last a semester from approval (the upgrade until the Basic semester ends). Premium bought
  //    before the price switch, or given by hand, never ends (lib/plans.js).
  const byId = new Map(members.map((m) => [m.user.id, m]));
  const windowOf = (due) => {
    const left = due - now;
    return left <= 0 ? 'ended' : left <= RENEW_REMIND_DAYS_BEFORE * DAY && left > (RENEW_REMIND_DAYS_BEFORE - 1) * DAY ? 'remind' : null;
  };
  for (const [uid, rec] of await approvals()) {
    const m = byId.get(uid);
    if (!m || m.roles.some((r) => staff.has(r))) continue;
    const a = access(rec, { premiumRole: m.roles.includes(ROLES.premium) });
    if (a.lifetime) continue;
    const premium = a.premiumDue && m.roles.includes(ROLES.premium) ? windowOf(a.premiumDue) : null;
    const paid = a.paidDue && m.roles.includes(ROLES.paid) ? windowOf(a.paidDue) : null;
    // one message when Premium and the libraries end on the same day: Premium's
    const sameDay = a.premiumDue && a.paidDue && a.premiumDue.getTime() === a.paidDue.getTime();
    if (premium === 'ended') {
      report.renewalsEnded.push(`${name(m)} (Mimosa)`);
      if (dry) continue;
      await api('DELETE', `/guilds/${GUILD_ID}/members/${uid}/roles/${ROLES.premium}`);
      if (paid === 'ended') await api('DELETE', `/guilds/${GUILD_ID}/members/${uid}/roles/${ROLES.paid}`);
      await dm(uid, MSG.premiumEnded(name(m)));
      await sleep(300);
      continue;
    }
    if (premium === 'remind') {
      report.renewalReminders.push(`${name(m)} (Mimosa)`);
      if (!dry) await dm(uid, MSG.premiumReminder(name(m), a.premiumDue));
      if (sameDay) continue;
    }
    if (paid === 'ended') {
      report.renewalsEnded.push(name(m));
      if (dry) continue;
      await api('DELETE', `/guilds/${GUILD_ID}/members/${uid}/roles/${ROLES.paid}`);
      await dm(uid, MSG.renewEnded(name(m)));
      await sleep(300);
    } else if (paid === 'remind' && !sameDay) {
      report.renewalReminders.push(name(m));
      if (!dry) await dm(uid, MSG.renewReminder(name(m), a.paidDue));
    }
  }

  // 4. Study Hub Milestones: streak-saver DMs every day, and the Sunday recap of the week in #daily-logs
  report.morningPost = await morningPost(isoDay(now), { dry }).catch((e) => ({ error: String(e.message).slice(0, 200) }));
  report.streakSavers = await streakSavers(isoDay(now), { dry }).catch((e) => ({ error: String(e.message).slice(0, 200) }));
  if (now.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Africa/Nairobi' }) === 'Sunday') {
    report.milestonesRecap = await weeklyRecap(isoDay(now), { dry }).catch((e) => ({ error: String(e.message).slice(0, 200) }));
  }
  return report;
}
