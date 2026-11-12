import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isLocalHost, pendingPayments, tail } from '../dashboard/util.js';
import { todaysStage, validName } from '../../pc/announce/stage.js';

test('pendingPayments: only claims nobody approved or rejected, with the details and a Discord link', () => {
  const msgs = [
    { id: '1', timestamp: '2026-11-12T10:00:00Z', content: '💰 **Payment claim** from <@11> (amina)\nPlan: **Mimosa** (KES 500)\nM-Pesa code: `TJK4ABC12D`\nSent from: Amina' },
    { id: '2', timestamp: '2026-11-12T09:00:00Z', content: '💰 **Payment claim** from <@12> (brian)\nPlan: **Gacrux** (KES 50)\nM-Pesa code: `TJK4ABC12E`\n\n✅ **Approved basic** by <@1> on 2026-11-12' },
    { id: '3', timestamp: '2026-11-12T08:00:00Z', content: '💰 **Payment claim** from <@13> (chebet)\nPlan: **Gacrux** (KES 50)\nM-Pesa code: `X`\n\n❌ **Rejected** by <@1> on 2026-11-12' },
    { id: '4', timestamp: '2026-11-12T07:00:00Z', content: 'Some chat' },
    { id: '5', timestamp: '2026-11-12T06:00:00Z', content: '💰 **Payment claim** from <@14> (dan)\nPlan: **Upgrade to Mimosa** (KES 350)\nM-Pesa code: `TJK4ABC12D`\n⚠️ This code was already claimed: 💰 …' },
  ];
  const p = pendingPayments(msgs, 'G', 'C');
  assert.deepEqual(p.map((x) => x.who), ['amina', 'dan']);
  assert.deepEqual(p[0], { id: '1', at: '2026-11-12T10:00:00Z', who: 'amina', plan: 'Mimosa', amount: '500', code: 'TJK4ABC12D', reused: false, link: 'https://discord.com/channels/G/C/1' });
  assert.equal(p[1].reused, true);
  assert.equal(p[1].plan, 'Upgrade to Mimosa');
});

test('tail: the last lines of a file; a missing file is empty', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dash-')), 'x.log');
  fs.writeFileSync(f, 'a\nb\nc\n\nd\n');
  assert.deepEqual(tail(f, 2), ['c', 'd']);
  assert.deepEqual(tail(`${f}.missing`, 5), []);
});

test('isLocalHost: only this computer by name, on the dashboard port', () => {
  assert.equal(isLocalHost('localhost:4180', 4180), true);
  assert.equal(isLocalHost('127.0.0.1:4180', 4180), true);
  assert.equal(isLocalHost('evil.example:4180', 4180), false);
  assert.equal(isLocalHost('localhost:80', 4180), false);
  assert.equal(isLocalHost(undefined, 4180), false);
});

test('todaysStage: a third of the members left each day, skipping bots, opted out, sent and closed', () => {
  const m = (id, bot = false) => ({ user: { id, bot, username: `u${id}` } });
  const members = [m('01'), m('02'), m('03'), m('04'), m('05'), m('06'), m('07'), m('08'), m('09'), m('99', true)];
  const fresh = { sent: {}, closed: {}, stages: [] };
  const day1 = todaysStage(members, new Set(['02']), fresh);
  assert.equal(day1.everyone.length, 9, 'bots excluded');
  assert.deepEqual(day1.today.map((x) => x.user.id), ['01', '03', '04'], '8 left over 3 days: 3 today');
  const after1 = { sent: { '01': 1, '03': 1 }, closed: { '04': 1 }, stages: [{}] };
  const day2 = todaysStage(members, new Set(['02']), after1);
  assert.deepEqual(day2.today.map((x) => x.user.id), ['05', '06', '07'], '5 left over 2 days: 3 today');
  const after2 = { sent: { ...after1.sent, '05': 1, '06': 1, '07': 1 }, closed: after1.closed, stages: [{}, {}] };
  assert.deepEqual(todaysStage(members, new Set(['02']), after2).today.map((x) => x.user.id), ['08', '09'], 'the last day takes the rest');
  assert.equal(validName('desktop-2026-11'), true);
  assert.equal(validName('../secrets'), false);
});
