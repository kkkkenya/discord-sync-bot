// Daily download limit (server/downloads.js), with the file lookup and Discord link faked.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRUX_STRICT = '1';
const { downloadLink, resetsAt } = await import('../server/downloads.js');
const { resetUsageForTests } = await import('../server/usage.js');

const deps = { lookup: async (id) => (id === '9' ? [] : [{ id, name: 'EMM 302 CAT 1.pdf', channel_id: 'c', message_id: 'm' }]), link: async () => 'https://cdn.discordapp.com/fresh.pdf' };

test('Basic gets 2 downloads a day; the third is refused with when it resets', async () => {
  resetUsageForTests();
  const basic = { id: 'b', tier: 'basic' };
  assert.deepEqual(await downloadLink(basic, '1', deps), { url: 'https://cdn.discordapp.com/fresh.pdf', name: 'EMM 302 CAT 1.pdf', left: 1 });
  assert.equal((await downloadLink(basic, '2', deps)).left, 0);
  await assert.rejects(downloadLink(basic, '3', deps), (e) => e.status === 429 && e.message === 'download-limit' && Boolean(e.resetsAt));
});

test('Premium and the owner have no limit', async () => {
  resetUsageForTests();
  for (const tier of ['premium', 'owner']) {
    for (let i = 0; i < 10; i++) assert.equal((await downloadLink({ id: tier, tier }, '1', deps)).left, null);
  }
});

test('a missing file is a 404 and costs nothing', async () => {
  resetUsageForTests();
  const basic = { id: 'b2', tier: 'basic' };
  await assert.rejects(downloadLink(basic, '9', deps), (e) => e.status === 404);
  assert.equal((await downloadLink(basic, '1', deps)).left, 1);
});

test('the count resets at Nairobi midnight', () => {
  assert.equal(resetsAt(new Date('2026-11-01T20:59:00Z')), '2026-11-01T21:00:00.000Z'); // 23:59 in Nairobi
  assert.equal(resetsAt(new Date('2026-11-01T21:00:00Z')), '2026-11-02T21:00:00.000Z'); // 00:00 next day
});
