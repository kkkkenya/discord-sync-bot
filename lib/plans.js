// Who has what until when, from the approvals in #payments (lib/daily.js reads them).
// From PRICE_SWITCH: Basic KES 50 a semester, Premium KES 500 a semester, and Basic members upgrade for KES 350,
// which lasts until their Basic semester ends. Premium approved before the switch (KES 800, "for life") never ends,
// and neither does a Premium role given by hand.
import { PRICES, PRICE_SWITCH, SEMESTER_DAYS } from './config.js';

const DAY = 24 * 3600 * 1000;
const semesterFrom = (d) => (d ? new Date(d.getTime() + SEMESTER_DAYS * DAY) : null);
const latest = (...dates) => dates.filter(Boolean).sort((a, b) => b - a)[0] || null;

// rec: the latest approval date of each plan, { basic, premium, upgrade } (Dates or undefined)
// → { lifetime: true } or { lifetime: false, premiumDue, paidDue } (null where there's nothing to end)
export function access(rec, { premiumRole = false, switchDay = PRICE_SWITCH } = {}) {
  const premium = rec.premium >= switchDay ? rec.premium : null;
  const upgrade = rec.upgrade >= switchDay ? rec.upgrade : null;
  if (premiumRole && !premium && !upgrade) return { lifetime: true };
  const basicDue = semesterFrom(rec.basic);
  const upgradeDue = upgrade ? (basicDue > upgrade ? basicDue : semesterFrom(upgrade)) : null;
  const premiumDue = latest(semesterFrom(premium), upgradeDue);
  return { lifetime: false, premiumDue, paidDue: latest(basicDue, premiumDue) };
}

// what a payment was worth when it was approved (Premium was KES 800 before the switch)
export const priceOf = (plan, date, switchDay = PRICE_SWITCH) => (plan === 'premium' && date < switchDay ? 800 : PRICES[plan] ?? 0);
// Plans are named after the Southern Cross (lib/plan-names.js): basic = Gacrux, premium = Mimosa.
export const planName = (plan) => ({ premium: 'Mimosa', upgrade: 'Upgrade to Mimosa' })[plan] || 'Gacrux';
