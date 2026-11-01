import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { donePath, resolveSources, STABLE_MS, update } from '../src/uploader/scanner.js';

const R = join('G:', 'My Drive', 'Notes');
const f = (name) => join(R, name);
const scanOf = (entries, missing = []) => ({ files: new Map(entries), missing });

test('a new file waits for a second scan with the same size and mtime', () => {
  const index = {};
  assert.deepEqual(update(index, scanOf([[f('a.pdf'), { size: 10, mtimeMs: 1 }]]), [R], 0), []);
  assert.deepEqual(update(index, scanOf([[f('a.pdf'), { size: 10, mtimeMs: 1 }]]), [R], STABLE_MS - 1), []);
  assert.deepEqual(update(index, scanOf([[f('a.pdf'), { size: 10, mtimeMs: 1 }]]), [R], STABLE_MS), [f('a.pdf')]);
});

test('a file still being copied (size changes) starts its wait again', () => {
  const index = {};
  update(index, scanOf([[f('a.pdf'), { size: 10, mtimeMs: 1 }]]), [R], 0);
  assert.deepEqual(update(index, scanOf([[f('a.pdf'), { size: 20, mtimeMs: 2 }]]), [R], 20e3), []);
  assert.deepEqual(update(index, scanOf([[f('a.pdf'), { size: 20, mtimeMs: 2 }]]), [R], 30e3), [f('a.pdf')]);
});

test('handled files are not offered again until they change', () => {
  const index = { [f('a.pdf')]: { size: 10, mtimeMs: 1, since: 0, handled: true } };
  assert.deepEqual(update(index, scanOf([[f('a.pdf'), { size: 10, mtimeMs: 1 }]]), [R], 60e3), []);
  update(index, scanOf([[f('a.pdf'), { size: 11, mtimeMs: 5 }]]), [R], 70e3);
  assert.equal(index[f('a.pdf')].handled, false);
});

test('the first scan ever counts existing files as settled', () => {
  assert.deepEqual(update({}, scanOf([[f('a.pdf'), { size: 10, mtimeMs: 1 }]]), [R], 0, { seed: true }), [f('a.pdf')]);
});

test('deleted files leave the index, but not when their root is missing (Drive dropped)', () => {
  const index = { [f('a.pdf')]: { size: 10, mtimeMs: 1, since: 0, handled: true } };
  update(index, scanOf([], [R]), [R], 1);
  assert.ok(index[f('a.pdf')]);
  update(index, scanOf([]), [R], 2);
  assert.equal(index[f('a.pdf')], undefined);
});

test('Done path by month, with (2), (3) on a name clash', () => {
  const done = join('G:', 'Hub Dumper', 'Done');
  const taken = new Set([join(done, '2026-11', 'EMM 302.pdf'), join(done, '2026-11', 'EMM 302 (2).pdf')]);
  assert.equal(donePath(done, 'x.pdf', '2026-11', (p) => taken.has(p)), join(done, '2026-11', 'x.pdf'));
  assert.equal(donePath(done, 'EMM 302.pdf', '2026-11', (p) => taken.has(p)), join(done, '2026-11', 'EMM 302 (3).pdf'));
});

test('sources: WATCH_DIRS, Drop and shortcut targets, each folder once, skipped names left out', async () => {
  const watch = join('G:', 'My Drive', 'Notes');
  const sources = join('G:', 'Hub Dumper', 'Sources');
  const drop = join('G:', 'Hub Dumper', 'Drop');
  const T = (id, name) => join('G:', '.shortcut-targets-by-id', id, name);
  const dirs = {
    [watch]: ['Thermo.lnk', 'paper.pdf', 'J22.lnk'],
    [sources]: ['ODE.lnk', 'Thermo again.lnk', 'broken.lnk'],
  };
  const targetOf = {
    [join(watch, 'Thermo.lnk')]: T('1', 'Thermo'), [join(watch, 'J22.lnk')]: T('2', 'J22 Course Materials'),
    [join(sources, 'ODE.lnk')]: T('3', 'ODE'), [join(sources, 'Thermo again.lnk')]: T('1', 'Thermo'),
    [join(sources, 'broken.lnk')]: T('9', 'gone'),
  };
  const roots = await resolveSources({ watchDirs: [watch], sourcesDir: sources, dropDir: drop },
    async (links) => links.map((l) => targetOf[l]),
    { list: async (d) => dirs[d] || [], isFolder: (p) => !p.endsWith('gone'), skip: (p) => p.endsWith('J22 Course Materials') });
  assert.deepEqual(roots, [watch, drop, T('1', 'Thermo'), T('3', 'ODE')]);
});

test('skip rules: temp and Drive-link files, hidden names, skipped folders', async () => {
  const { skip, skipFolders } = await import('../src/uploader/scanner.js');
  const folders = skipFolders('J22 Course Materials; old ');
  assert.equal(skip(join(R, 'a.pdf'), folders), false);
  for (const name of ['~$draft.docx', '.hidden.pdf', 'x.crdownload', 'link.gdoc', 'shortcut.lnk', 'desktop.ini']) assert.equal(skip(join(R, name), folders), true, name);
  assert.equal(skip(join(R, 'J22 Course Materials', 'a.pdf'), folders), true);
  assert.equal(skip(join(R, 'OLD', 'a.pdf'), folders), true);
});
