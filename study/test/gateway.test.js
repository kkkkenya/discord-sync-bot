import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeGateway, studyCommand } from '../../lib/study-gateway.js';
import { fakeDb as makeDb } from './helpers.js';

let now = Date.parse('2026-10-28T10:00:00Z');
const sha = (s) => createHash('sha256').update(String(s).trim().toUpperCase()).digest('hex');
const setup = () => {
  const db = makeDb(() => now);
  const sent = [];
  const edits = [];
  const gw = makeGateway({
    db, appId: 'APP', now: () => now,
    discord: async (method, path, body) => { edits.push([method, path, body]); return { attachments: [{ url: 'https://cdn/x.pdf', filename: 'x.pdf' }] }; },
    dm: async (id, text) => { sent.push([id, text]); return true; },
    ai: async () => ({ result: { ok: true }, tokens: 120 }),
  });
  return { db, gw, sent, edits };
};

test('an invite code links a Study Desk once; the token is what signs it in after', async () => {
  const { db, gw } = setup();
  await db.insert('study_friends', [{ name: 'Amos', invite_hash: sha('SD-AAAA-BBBB') }]);
  const { token, name } = await gw('link', { code: 'sd-aaaa-bbbb' });
  assert.equal(name, 'Amos');
  await assert.rejects(gw('link', { code: 'SD-AAAA-BBBB' }), /already used/);
  assert.equal((await gw('me', {}, token)).name, 'Amos');
  await assert.rejects(gw('me', {}, 'stolen'), /not linked/);
  db.t.study_friends[0].active = false;
  await assert.rejects(gw('me', {}, token), /switched off/);
});

test('the Study Hub AI stops at the daily cap and says how to keep going', async () => {
  const { db, gw } = setup();
  await db.insert('study_friends', [{ name: 'Amos', invite_hash: sha('SD-1'), ai_daily_cap: 2 }]);
  const { token } = await gw('link', { code: 'SD-1' });
  await assert.rejects(gw('ai', { content: 'x', media: [{ data: 'x'.repeat(5 * 1024 * 1024) }] }, token), /too big/);
  assert.deepEqual((await gw('ai', { content: 'x' }, token)).result, { ok: true });
  assert.equal((await gw('ai', { content: 'x' }, token)).aiToday, 2);
  await assert.rejects(gw('ai', { content: 'x' }, token), (e) => e.status === 429 && /own free Gemini key/.test(e.message));
});

test('Discord: /study connect pairs with the code from Study Desk; /study link needs Premium', async () => {
  const { db, gw } = setup();
  await db.insert('study_friends', [{ name: 'Amos', invite_hash: sha('SD-2') }]);
  const { token } = await gw('link', { code: 'SD-2' });
  const { code } = await gw('pair', {}, token);
  const amos = { id: 'u-amos', username: 'amos' };
  const r = await studyCommand({ db, now: () => now, premiumRole: 'P' }, {}, amos, 'connect', { code });
  assert.match(r.data.content, /Connected/);
  assert.equal((await gw('me', {}, token)).discordLinked, true);
  const notPremium = await studyCommand({ db, now: () => now, premiumRole: 'P' }, { member: { roles: [] } }, { id: 'u-x' }, 'link', {});
  assert.match(notPremium.data.content, /Premium/);
  const premium = await studyCommand({ db, now: () => now, premiumRole: 'P' }, { member: { roles: ['P'] } }, { id: 'u-p', username: 'pat' }, 'link', {});
  const premiumCode = premium.data.content.match(/SD-[0-9A-F]{4}-[0-9A-F]{4}/)[0];
  assert.equal((await gw('link', { code: premiumCode })).name, 'pat');
});

test('a /study command waits for the friend\'s Study Desk, which answers by editing the reply', async () => {
  const { db, gw, edits, sent } = setup();
  await db.insert('study_friends', [{ name: 'Amos', invite_hash: sha('SD-3'), discord_id: 'u-amos' }]);
  const { token } = await gw('link', { code: 'SD-3' });
  const ctx = { db, now: () => now, premiumRole: 'P' };
  const closed = await studyCommand(ctx, { token: 'itok-1' }, { id: 'u-amos' }, 'today', {});
  assert.match(closed.data.content, /isn.t open/, 'Study Desk not running: says so, still queued');
  assert.deepEqual((await gw('inbox', {}, token)).items.map((x) => x.command), ['today'], 'Study Desk starts and picks up what waited');
  const open = await studyCommand(ctx, { token: 'itok-2', data: { resolved: { attachments: { a1: { url: 'https://cdn/p.jpg', content_type: 'image/jpeg' } } } } }, { id: 'u-amos' }, 'mark', { unit: 'EMM 302', photo: 'a1' });
  assert.equal(open.type, 5, 'thinking…');
  const { items } = await gw('inbox', {}, token);
  assert.deepEqual(items.map((x) => x.command), ['mark']);
  assert.equal(items[0].args.photo.url, 'https://cdn/p.jpg');
  assert.deepEqual((await gw('inbox', {}, token)).items, [], 'taken once');
  await gw('reply', { id: items[0].id, text: 'Matches the key.' }, token);
  assert.deepEqual(edits.at(-1), ['PATCH', '/webhooks/APP/itok-2/messages/@original', { content: 'Matches the key.', allowed_mentions: { parse: [] } }]);
  const first = db.t.study_inbox[0];
  now += 20 * 60000; // Discord's 15 minutes are over: the old one goes as a DM
  await gw('reply', { id: first.id, text: 'Your plan' }, token);
  assert.deepEqual(sent.at(-1), ['u-amos', 'Your plan']);
});
