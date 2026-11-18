// The Hub files desk (study/server/hub-desk-routes.js, lib/hub-desk.js): staff only, the checksum check, the queue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hubRoute, useHubDeskForTests } from '../server/hub-desk-routes.js';
import { forgetStaffForTests, isStaff } from '../../lib/hub-desk.js';

const q = (s) => new URLSearchParams(s);
const rows = { files: [{ name: 'EMM 302 CAT 1 2024.pdf', kind: 'paper', unit_code: 'EMM 302', dest_name: 'EMM 302 Strength of Materials', channel_id: '11', message_id: '22', created_at: '2026-11-18T08:00:00Z', size: 900 }],
  crux_uploads: [{ id: 5, user_name: 'Brian', unit_code: 'EMM 302', name: 'tut 3.pdf', size: 10, status: 'posted', note: null, created_at: 'x', updated_at: 'y' }] };
const fakeDb = { select: async (table, qs) => (table === 'files' && qs.startsWith('hash=eq.') ? (qs.includes('a'.repeat(64)) ? rows.files : []) : rows[table] || []) };

test('the desk is staff only; staff get the queue, recent posts with links, and students\' uploads', async () => {
  useHubDeskForTests({ db: fakeDb, remote: () => true, isStaff: async (id) => id === 'owner', deskQueue: async () => [{ fileMsgId: '1', name: 'mystery.pdf' }] });
  try {
    await assert.rejects(hubRoute('GET', '/api/hub/desk', q(''), null, { id: 'student' }), (e) => e.status === 403);
    await assert.rejects(hubRoute('POST', '/api/hub/sort', q(''), {}, { id: 'student' }), (e) => e.status === 403);
    const d = await hubRoute('GET', '/api/hub/desk', q(''), null, { id: 'owner' });
    assert.equal(d.queue[0].name, 'mystery.pdf');
    assert.match(d.recent[0].link, /^https:\/\/discord\.com\/channels\/\d+\/11\/22$/);
    assert.deepEqual(d.students[0], { id: 5, by: 'Brian', unit: 'EMM 302', name: 'tut 3.pdf', size: 10, status: 'posted', note: null, at: 'y' });
    assert.ok(d.units.length > 0 && d.units[0].code);
  } finally { useHubDeskForTests(null); }
});

test('anyone signed in can ask whether a file is already on the Hub, by its sha256', async () => {
  useHubDeskForTests({ db: fakeDb, remote: () => true });
  try {
    assert.equal((await hubRoute('GET', '/api/hub/has', q(`hash=${'a'.repeat(64)}`), null, { id: 's' })).exists, true);
    assert.equal((await hubRoute('GET', '/api/hub/has', q(`hash=${'b'.repeat(64)}`), null, { id: 's' })).exists, false);
    await assert.rejects(hubRoute('GET', '/api/hub/has', q('hash=nope'), null, { id: 's' }), /64 hex/);
  } finally { useHubDeskForTests(null); }
});

test('staff: the server owner, or a role with Administrator or Manage Roles; members otherwise are not', async () => {
  forgetStaffForTests();
  const discord = async (m, path) => path.endsWith('/roles') ? [{ id: 'r-admin', permissions: String(1n << 3n) }, { id: 'r-mod', permissions: String(1n << 28n) }, { id: 'r-rep', permissions: '0' }]
    : path.includes('/members/') ? { roles: path.endsWith('/a') ? ['r-admin'] : path.endsWith('/m') ? ['r-mod'] : ['r-rep'] } : { owner_id: 'o' };
  assert.equal(await isStaff('o', { discord }), true);
  assert.equal(await isStaff('a', { discord }), true);
  assert.equal(await isStaff('m', { discord }), true);
  assert.equal(await isStaff('r', { discord }), false);
  assert.equal(await isStaff('', { discord }), false);
});
