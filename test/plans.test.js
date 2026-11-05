// node --test test/   (the bot's plan rules: lifetime Premium, Premium by the semester, the upgrade)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, priceOf, planName } from '../lib/plans.js';

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
  assert.equal(planName('upgrade'), 'Upgrade to Premium');
});
