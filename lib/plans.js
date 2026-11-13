// Who has what until when, from the approvals in #payments (lib/daily.js reads them).
// From PRICE_SWITCH: Basic KES 50 a semester, Premium KES 500 a semester, and Basic members upgrade for KES 350,
// which lasts until their Basic semester ends. Premium approved before the switch (KES 800, "for life") never ends,
// and neither does a Premium role given by hand.
// Acrux (vvip, from 2026-11-13): KES 999 a semester and includes Mimosa and Gacrux. Mimosa members upgrade for
// KES 499 (vvipup), which lasts until their Mimosa semester ends, or a semester when their Mimosa never ends.
import { PRICES, PRICE_SWITCH, SEMESTER_DAYS } from './config.js';

const DAY = 24 * 3600 * 1000;
const semesterFrom = (d) => (d ? new Date(d.getTime() + SEMESTER_DAYS * DAY) : null);
const latest = (...dates) => dates.filter(Boolean).sort((a, b) => b - a)[0] || null;

// rec: the latest approval date of each plan, { basic, premium, upgrade, vvip, vvipup } (Dates or undefined), and
// vvipHadMimosa: the latest Acrux claim said the member held Mimosa then ("Has Mimosa now: yes")
// → { lifetime: true[, vvipDue] } when Mimosa never ends, else { lifetime: false, premiumDue, paidDue, vvipDue }
//   (null where there's nothing to end)
export function access(rec, { premiumRole = false, switchDay = PRICE_SWITCH } = {}) {
  const premium = rec.premium >= switchDay ? rec.premium : null;
  const upgrade = rec.upgrade >= switchDay ? rec.upgrade : null;
  // Mimosa held with no Mimosa payment from the switch: lifetime, unless the role came from buying Acrux outright
  // without Mimosa (pre-switch Mimosa, Mimosa given by hand and the Acrux upgrade all mean Mimosa was there first)
  const oldPremium = rec.premium && rec.premium < switchDay;
  const lifetime = premiumRole && !premium && !upgrade && (oldPremium || rec.vvipup || rec.vvipHadMimosa || !rec.vvip);
  const basicDue = semesterFrom(rec.basic);
  const upgradeDue = upgrade ? (basicDue > upgrade ? basicDue : semesterFrom(upgrade)) : null;
  const ownPremiumDue = lifetime ? null : latest(semesterFrom(premium), upgradeDue);
  const vvipupDue = rec.vvipup ? (ownPremiumDue > rec.vvipup ? ownPremiumDue : semesterFrom(rec.vvipup)) : null;
  const vvipDue = latest(semesterFrom(rec.vvip), vvipupDue);
  if (lifetime) return vvipDue ? { lifetime: true, vvipDue } : { lifetime: true };
  const premiumDue = latest(ownPremiumDue, vvipDue); // Acrux includes Mimosa
  return { lifetime: false, premiumDue, paidDue: latest(basicDue, premiumDue), vvipDue };
}

// what a payment was worth when it was approved (Premium was KES 800 before the switch)
export const priceOf = (plan, date, switchDay = PRICE_SWITCH) => (plan === 'premium' && date < switchDay ? 800 : PRICES[plan] ?? 0);
// Plans are named after the Southern Cross (lib/plan-names.js): basic = Gacrux, premium = Mimosa, vvip = Acrux.
export const planName = (plan) => ({ premium: 'Mimosa', upgrade: 'Upgrade to Mimosa', vvip: 'Acrux', vvipup: 'Upgrade to Acrux' })[plan] || 'Gacrux';
// The approval line in #payments ("✅ **Approved vvip** by <@1> on 2026-11-13"), read by the daily job and dashboards
export const APPROVED = /✅ \*\*Approved (basic|premium|upgrade|vvip|vvipup)\*\* by <@\d+> on (\d{4}-\d{2}-\d{2})/;
// What a member typed in the payment form → the plan. "Upgrade" alone means the next plan up from what they hold.
export function planFromForm(text, roles = [], { premiumRole, vvipRole } = {}) {
  const t = String(text || '');
  const acrux = /\bacr|vvip/i.test(t); // \b: not the "acr" in Gacrux
  if (/upg/i.test(t)) return acrux || roles.includes(premiumRole) || roles.includes(vvipRole) ? 'vvipup' : 'upgrade';
  if (acrux) return 'vvip';
  return /prem|mimo/i.test(t) ? 'premium' : 'basic';
}
// The roles an approved plan gives (Acrux includes Mimosa, Mimosa includes Gacrux).
export const rolesFor = (plan, R) => (plan === 'basic' ? [R.paid] : plan === 'premium' || plan === 'upgrade' ? [R.premium, R.paid] : [R.vvip, R.premium, R.paid]);
