// node --test test/   (the bot's plan rules: lifetime Premium, Premium by the semester, the upgrade)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED, access, planFromForm, planName, priceOf, rolesFor } from '../lib/plans.js';

const S = new Date('2026-11-05T00:00:00+03:00'); // the switch
const d = (s) => new Date(`${s}T12:00:00+03:00`);
const day = (x) => x?.toISOString().slice(0, 10);

test('Premium bought before the switch, or given by hand, never ends', () => {
  assert.deepEqual(access({ premium: d('2026-10-01') }, { premiumRole: true, switchDay: S }), { lifetime: true });
  assert.deepEqual(access({}, { premiumRole: true, switchDay: S }), { lifetime: true });
  assert.deepEqual(access({ basic: d('2026-10-01'), premium: d('2026-09-20') }, { premiumRole: true, switchDay: S }), { lifetime: true });
});

test('Premium bought from the switch lasts a semester (120 days)', () => {
  const a = access({ premium: d('2026-11-10') }, { premiumRole: true, switchDay: S });
  assert.equal(a.lifetime, false);
  assert.equal(day(a.premiumDue), '2027-03-10');
  assert.equal(day(a.paidDue), '2027-03-10');
});

test('the upgrade lasts until the Basic semester ends', () => {
  const a = access({ basic: d('2026-10-01'), upgrade: d('2026-11-12') }, { premiumRole: true, switchDay: S });
  assert.equal(day(a.premiumDue), '2027-01-29'); // 1 Oct + 120 days
  assert.equal(day(a.paidDue), '2027-01-29');
});

test('an upgrade after the Basic semester already ended gets a semester of its own', () => {
  const a = access({ basic: d('2026-05-01'), upgrade: d('2026-11-12') }, { premiumRole: true, switchDay: S });
  assert.equal(day(a.premiumDue), '2027-03-12');
});

test('Basic alone: only the paid role ends', () => {
  const a = access({ basic: d('2026-11-06') }, { switchDay: S });
  assert.equal(a.premiumDue, null);
  assert.equal(day(a.paidDue), '2027-03-06');
});

test('prices: old Premium payments stay KES 800, new ones are KES 500, the upgrade KES 350', () => {
  assert.equal(priceOf('premium', d('2026-10-01'), S), 800);
  assert.equal(priceOf('premium', d('2026-11-06'), S), 500);
  assert.equal(priceOf('upgrade', d('2026-11-06'), S), 350);
  assert.equal(priceOf('basic', d('2026-11-06'), S), 50);
  assert.equal(planName('upgrade'), 'Upgrade to Mimosa');
  assert.equal(planName('premium'), 'Mimosa');
  assert.equal(planName('basic'), 'Gacrux');
});

const R = { trial: 't', paid: 'g', premium: 'm', vvip: 'a' };

test('Acrux bought outright lasts a semester and carries Mimosa and Gacrux with it', () => {
  const a = access({ vvip: d('2026-11-13') }, { premiumRole: true, switchDay: S });
  assert.equal(a.lifetime, false);
  assert.equal(day(a.vvipDue), '2027-03-13');
  assert.equal(day(a.premiumDue), '2027-03-13');
  assert.equal(day(a.paidDue), '2027-03-13');
});

test('the Acrux upgrade lasts until the Mimosa semester ends', () => {
  const a = access({ premium: d('2026-11-06'), vvipup: d('2026-11-20') }, { premiumRole: true, switchDay: S });
  assert.equal(day(a.vvipDue), '2027-03-06');
  assert.equal(day(a.premiumDue), '2027-03-06');
});

test('lifetime Mimosa keeps Mimosa for good; its Acrux upgrade gets one semester', () => {
  assert.deepEqual(access({ premium: d('2026-10-01'), vvipup: d('2026-11-20') }, { premiumRole: true, switchDay: S }).lifetime, true);
  assert.equal(day(access({ premium: d('2026-10-01'), vvipup: d('2026-11-20') }, { premiumRole: true, switchDay: S }).vvipDue), '2027-03-20');
  assert.equal(day(access({ vvipup: d('2026-11-20') }, { premiumRole: true, switchDay: S }).vvipDue), '2027-03-20'); // Mimosa given by hand
  assert.equal(day(access({ premium: d('2026-10-01'), vvip: d('2026-11-20') }, { premiumRole: true, switchDay: S }).vvipDue), '2027-03-20');
});

test('Acrux bought later than Mimosa extends Mimosa to the Acrux end', () => {
  const a = access({ premium: d('2026-11-06'), vvip: d('2026-12-01') }, { premiumRole: true, switchDay: S });
  assert.equal(day(a.premiumDue), '2027-03-31');
});

test('prices and names for Acrux', () => {
  assert.equal(priceOf('vvip', d('2026-11-13'), S), 999);
  assert.equal(priceOf('vvipup', d('2026-11-13'), S), 499);
  assert.equal(planName('vvip'), 'Acrux');
  assert.equal(planName('vvipup'), 'Upgrade to Acrux');
});

test('the payment form reads the plan, and "Upgrade" means the next plan up', () => {
  const opts = { premiumRole: R.premium, vvipRole: R.vvip };
  assert.equal(planFromForm('Gacrux', [R.paid], opts), 'basic');
  assert.equal(planFromForm('mimosa', [], opts), 'premium');
  assert.equal(planFromForm('Acrux', [], opts), 'vvip');
  assert.equal(planFromForm('Upgrade', [R.paid], opts), 'upgrade');
  assert.equal(planFromForm('Upgrade', [R.paid, R.premium], opts), 'vvipup');
  assert.equal(planFromForm('Acrux upgrade', [R.paid], opts), 'vvipup');
  assert.equal(planFromForm('upgrade to acrux', [], opts), 'vvipup');
  assert.equal(planFromForm('Upgrade', [R.paid, R.premium, R.vvip], opts), 'vvipup'); // already Acrux: flagged for staff
  assert.equal(planFromForm('Gacrux upgrade', [R.paid], opts), 'upgrade');
});

test('roles each approval gives', () => {
  assert.deepEqual(rolesFor('basic', R), ['g']);
  assert.deepEqual(rolesFor('upgrade', R), ['m', 'g']);
  assert.deepEqual(rolesFor('vvipup', R), ['a', 'm', 'g']);
  assert.deepEqual(rolesFor('vvip', R), ['a', 'm', 'g']);
});

test('approval lines in #payments are read for every plan', () => {
  assert.deepEqual(APPROVED.exec('✅ **Approved vvipup** by <@1> on 2026-11-13').slice(1), ['vvipup', '2026-11-13']);
  assert.deepEqual(APPROVED.exec('✅ **Approved vvip** by <@1> on 2026-11-13').slice(1), ['vvip', '2026-11-13']);
  assert.equal(APPROVED.exec('✅ **Approved premium** by <@1> on 2026-11-13')[1], 'premium');
});

test('Mimosa given by hand stays for life when its holder buys Acrux outright', () => {
  const a = access({ vvip: d('2026-11-13'), vvipHadMimosa: true }, { premiumRole: true, switchDay: S });
  assert.equal(a.lifetime, true);
  assert.equal(day(a.vvipDue), '2027-03-13');
  assert.equal(access({ vvip: d('2026-11-13'), vvipHadMimosa: false }, { premiumRole: true, switchDay: S }).lifetime, false);
});
