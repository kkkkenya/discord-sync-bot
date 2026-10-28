import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './helpers.js';

let srv;
before(async () => { srv = await startServer('legacy-study.json'); });
after(() => srv.stop());

test('catalog follows the requested cohort', async () => {
  const { body } = await srv.call('GET', 'catalog?course=EMM&year=3');
  assert.equal(body.course, 'EMM');
  assert.ok(body.core.some((u) => u.code === 'EMM 302'));
  assert.ok(body.shared.some((u) => u.code === 'ECU 300'));
  assert.ok(body.courses.length >= 7);
  const ear = (await srv.call('GET', 'catalog?course=EAR&year=3')).body;
  assert.ok(ear.core.some((u) => u.code === 'EAR 302'));
});

test('cohort is validated and saved', async () => {
  assert.equal((await srv.call('POST', 'settings', { cohort: { course: 'EMM', year: 9, sem: 1 } })).status, 400);
  const { body } = await srv.call('POST', 'settings', { cohort: { course: 'EMM', year: 3, sem: 1 } });
  assert.deepEqual(body.settings.cohort, { course: 'EMM', year: 3, sem: 1 });
  assert.equal((await srv.call('GET', 'catalog')).body.year, 3);
});

test('unticking a unit keeps its date and topics; ticking it again brings the date back', async () => {
  let s = (await srv.call('PUT', 'units', [{ code: 'EMM 305', title: 'Thermo' }, { code: 'ECU 300', title: 'Maths' }, { code: 'EMM 312', title: 'Drawing' }])).body;
  assert.ok(!s.data.units.some((u) => u.code === 'EMM 302'));
  assert.equal(s.settings.unitArchive['EMM 302'].catDate, '2026-11-03');
  assert.ok(s.data.topics.some((t) => t.unit === 'EMM 302'), 'topics are never dropped');
  s = (await srv.call('PUT', 'units', [...s.data.units, { code: 'EMM 302', title: 'Solid Mechanics' }])).body;
  const u = s.data.units.find((x) => x.code === 'EMM 302');
  assert.equal(u.catDate, '2026-11-03');
  assert.equal(u.confidence, 2);
  assert.equal(s.settings.unitArchive['EMM 302'], undefined);
});

test('dates accept a day, TBA or nothing; TBA never counts down to the KU calendar', async () => {
  assert.equal((await srv.call('PATCH', 'units?code=EMM%20305', { catDate: 'soon' })).status, 400);
  for (const u of ['EMM 302', 'EMM 305', 'ECU 300', 'EMM 312']) {
    const r = await srv.call('PATCH', `units?code=${encodeURIComponent(u)}`, { catDate: 'TBA' });
    assert.equal(r.status, 200);
  }
  const s = (await srv.call('GET', 'state')).body;
  assert.ok(s.data.units.every((u) => u.catDate === 'TBA'));
  for (const p of s.plan) assert.equal(p.cat, null);
  assert.equal((await srv.call('PATCH', 'units?code=EMM%20305', { catDate: '2026-12-01' })).body.data.units.find((u) => u.code === 'EMM 305').catDate, '2026-12-01');
  assert.equal((await srv.call('PATCH', 'units?code=EMM%20305', { catDate: null })).status, 200);
});

test('sync explains itself without Supabase keys', async () => {
  const { body } = await srv.call('POST', 'library/ingest', { unit: 'EMM 302' });
  assert.match(body.note, /Supabase/);
  assert.equal((await srv.call('POST', 'library/ingest', { unit: 'XYZ 999' })).status, 400);
});

test('everything is on disk', () => {
  const d = JSON.parse(readFileSync(join(srv.dir, 'study.json'), 'utf8'));
  assert.equal(d.cards.length, 500);
  assert.deepEqual(d.settings.cohort, { course: 'EMM', year: 3, sem: 1 });
});
