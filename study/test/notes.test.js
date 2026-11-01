// Importing notes from Obsidian and Notion: parsing (web/src/notes-parse.js) and the server side (notes-store.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { startServer } from './helpers.js';
import { cleanMarkdown, readNotes } from '../web/src/notes-parse.js';

const bytes = async (zip) => zip.generateAsync({ type: 'uint8array' });

async function obsidianVault() {
  const z = new JSZip();
  z.file('Vault/.obsidian/app.json', '{"theme":"dark"}');
  z.file('Vault/EMM 302/Torsion.md', '---\ntags: [cat]\n---\n# Torsion\nShear stress is [[Polar moment|J]] times... ![[shaft.png]]\nSee [[Angle of twist]].\n');
  z.file('Vault/Revision/Beams.md', '---\nunit: EMM 302\n---\nBending moment diagrams, sign convention sagging positive.');
  z.file('Vault/Random thoughts.md', 'A note with no unit code anywhere at all.');
  z.file('Vault/shaft.png', new Uint8Array([137, 80, 78, 71]));
  return bytes(z);
}

async function notionExport() {
  const inner = new JSZip();
  const id = '0123456789abcdef0123456789abcdef';
  inner.file(`Metrology ${id}/EMM 305 Slip gauges ${id}.md`, '# EMM 305 Slip gauges\nWringing, grades and calibration of [slip gauges](Slip%20gauges%20' + id + '.md).');
  inner.file(`Metrology ${id}.md`, '# Metrology\nIndex page for the unit EMM 305 with enough words.');
  const outer = new JSZip();
  outer.file('Export-6f2a.zip', await bytes(inner));
  return bytes(outer);
}

test('markdown is cleaned: no front matter, embeds, or link brackets', () => {
  assert.equal(cleanMarkdown('---\na: 1\n---\nSee [[Note|this]] and [[Other]] ![[img.png]]'), 'See this and Other');
});

test('an Obsidian vault zip: units from the path, front matter or the dialog; .obsidian and images skipped', async () => {
  const notes = await readNotes([{ path: 'vault.zip', data: await obsidianVault() }], { JSZip, fallbackUnit: 'EMM 308' });
  const by = Object.fromEntries(notes.map((n) => [n.title, n]));
  assert.deepEqual(Object.keys(by).sort(), ['Beams', 'Random thoughts', 'Torsion']);
  assert.equal(by.Torsion.unit, 'EMM 302');
  assert.equal(by.Beams.unit, 'EMM 302');
  assert.equal(by['Random thoughts'].unit, 'EMM 308');
  assert.match(by.Torsion.text, /Shear stress is J times/);
  assert.doesNotMatch(by.Torsion.text, /\[\[|shaft\.png|tags:/);
  assert.equal(by.Torsion.source, 'obsidian');
});

test('a Notion export: the zip inside the zip is opened and the ids come off the names', async () => {
  const notes = await readNotes([{ path: 'Notion export.zip', data: await notionExport() }], { JSZip, fallbackUnit: 'EMM 305' });
  const titles = notes.map((n) => n.title).sort();
  assert.deepEqual(titles, ['EMM 305 Slip gauges', 'Metrology']);
  assert.ok(notes.every((n) => n.unit === 'EMM 305' && n.source === 'notion'));
  assert.match(notes.find((n) => n.title === 'EMM 305 Slip gauges').text, /calibration of slip gauges\./);
});

test('importing: replaces by unit and title, refuses unknown units and anything over the limits, and Study shows your notes first', async () => {
  const srv = await startServer();
  try {
    await srv.call('PUT', 'units', [{ code: 'EMM 302', title: 'Strength of Materials' }]);
    const one = { unit: 'EMM 302', title: 'Torsion', text: 'Torsion of shafts: shear stress tau = T r / J, angle of twist theta = T L / G J.', source: 'obsidian' };
    assert.deepEqual((await srv.call('POST', 'notes/import', { notes: [one] })).body, { imported: 1, replaced: 0 });
    assert.deepEqual((await srv.call('POST', 'notes/import', { notes: [{ ...one, text: `${one.text} Hollow shafts too.` }] })).body, { imported: 1, replaced: 1 });
    const list = (await srv.call('GET', 'notes?unit=EMM%20302')).body;
    assert.equal(list.length, 1);
    assert.equal((await srv.call('POST', 'notes/import', { notes: [{ ...one, unit: 'XYZ 999' }] })).status, 400);
    const many = Array.from({ length: 300 }, (_, i) => ({ ...one, title: `Note ${i}` }));
    assert.match((await srv.call('POST', 'notes/import', { notes: many })).body.error, /limit is 300/);
    assert.match((await srv.call('POST', 'notes/import', { notes: [{ ...one, title: 'Huge', text: 'x'.repeat(5.5 * 1024 * 1024) }] })).body.error, /5 MB/);

    const topic = (await srv.call('POST', 'topics', { unit: 'EMM 302', name: 'Torsion' })).body;
    const learn = (await srv.call('GET', `learn?unit=EMM%20302&topicId=${topic.id}`)).body;
    assert.equal(learn.read[0].own, true, 'your own note is the first thing to read');
    assert.equal(learn.read[0].name, 'Torsion');

    const del = (await srv.call('DELETE', `notes/${list[0].id}`)).body;
    assert.deepEqual(del, { removed: true });
  } finally { srv.stop(); }
});
