// Finds new files by walking the folders on a timer. It replaced chokidar, whose fs.watch broke thousands of times
// a day on Google Drive's virtual drive. Pure parts are tested in pc/test/scanner.test.js.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, sep } from 'node:path';

export const STABLE_MS = 10e3; // same size and mtime across two scans this far apart = finished copying

export const under = (child, parent) => child.toLowerCase().startsWith(parent.toLowerCase() + sep); // Windows paths ignore case

const SKIP_EXT = new Set(['.tmp', '.crdownload', '.part', '.partial', '.ini', '.lnk', '.db', '.ds_store',
  '.gdoc', '.gsheet', '.gslides', '.gform', '.gdraw', '.gmap', '.gsite', '.gjam']); // .g* are Drive links, not files

// SKIP_FOLDERS in pc/.env: folder names (separated by ;) to leave out wherever they appear.
export const skipFolders = (value = process.env.SKIP_FOLDERS) => new Set((value || '').split(';').map((s) => s.trim().toLowerCase()).filter(Boolean));
export const skip = (p, folders = skipFolders()) => {
  const name = basename(p);
  return name.startsWith('~$') || name.startsWith('.') || SKIP_EXT.has(extname(name).toLowerCase())
    || p.split(sep).some((part) => part === 'node_modules' || part === '.git' || part === '$RECYCLE.BIN' || folders.has(part.toLowerCase()));
};

// Walks the roots. Returns path → { size, mtimeMs }, plus the roots that weren't there (Drive not mounted).
export async function scan(roots, skip) {
  const files = new Map();
  const missing = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = join(dir, entry.name);
      if (skip(p)) continue;
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile()) {
        const s = await stat(p).catch(() => null);
        if (s?.size) files.set(p, { size: s.size, mtimeMs: s.mtimeMs });
      }
    }
  }
  for (const r of roots) { if (existsSync(r)) await walk(r); else missing.push(r); }
  return { files, missing };
}

// Merges one scan into the index and returns the files that are ready to handle.
// index: path → { size, mtimeMs, since, handled }. since = when this size+mtime was first seen.
// A file is ready once it hasn't changed for STABLE_MS and isn't handled yet. Entries under a root that was
// missing this time are kept, so Drive dropping out doesn't make every file look new again.
// seed: the first scan ever (no saved index): files already there count as settled.
export function update(index, { files, missing }, roots, now, { seed = false } = {}) {
  const ready = [];
  for (const [path, { size, mtimeMs }] of files) {
    const old = index[path];
    if (!old || old.size !== size || old.mtimeMs !== mtimeMs) {
      index[path] = { size, mtimeMs, since: seed ? now - STABLE_MS : now, handled: false };
      if (seed) ready.push(path);
      continue;
    }
    if (!old.handled && now - old.since >= STABLE_MS) ready.push(path);
  }
  const scanned = roots.filter((r) => !missing.includes(r));
  for (const path of Object.keys(index)) {
    if (!files.has(path) && scanned.some((r) => under(path, r))) delete index[path];
  }
  return ready;
}

// Where a posted Drop file goes: Done\YYYY-MM\name, or "name (2).ext" when that's taken.
export function donePath(doneDir, name, month, exists = existsSync) {
  const dir = join(doneDir, month);
  const ext = extname(name), stem = name.slice(0, name.length - ext.length);
  for (let n = 1; ; n++) {
    const p = join(dir, n === 1 ? name : `${stem} (${n})${ext}`);
    if (!exists(p)) return p;
  }
}

// Everything to scan: WATCH_DIRS and Drop, plus the folders that shortcuts in WATCH_DIRS and Sources point to.
// targets(lnkPaths) → their target paths (Windows resolves them; tests pass a fake).
export async function resolveSources({ watchDirs, sourcesDir, dropDir }, targets, { list = (d) => readdir(d).catch(() => []), isFolder, skip }) {
  const found = [...watchDirs, ...(dropDir ? [dropDir] : [])];
  for (const d of [...watchDirs, ...(sourcesDir ? [sourcesDir] : [])]) {
    const links = (await list(d)).filter((n) => n.toLowerCase().endsWith('.lnk')).map((n) => join(d, n));
    for (const t of await targets(links)) if (isFolder(t)) found.push(t);
  }
  const unique = [...new Map(found.map((r) => [r.toLowerCase(), r])).values()].filter((r) => !skip(r));
  return unique.filter((r) => !unique.some((o) => o !== r && under(r, o))); // a folder inside another is scanned once
}

// The Hub Dumper folder in Drive: Drop (files in), Sources (shortcuts to shared folders), Done, Problems.
export function dumperFolders(home, { create = true } = {}) {
  const f = { home, drop: join(home, 'Drop'), sources: join(home, 'Sources'), done: join(home, 'Done'), problems: join(home, 'Problems') };
  if (!create || !existsSync(dirname(home))) return f; // dry run, or Drive not mounted yet (made on a later scan)
  for (const d of [f.drop, f.sources, f.done, f.problems]) mkdirSync(d, { recursive: true });
  const readme = join(home, 'README.txt');
  if (!existsSync(readme)) writeFileSync(readme, [
    'Drop: put files here (phone: Drive app, +, Upload, Hub Dumper/Drop). They are posted to the server, then moved to Done.',
    'Sources: put shortcuts to shared folders here (phone: open the folder, the three dots, Add shortcut, Hub Dumper/Sources).',
    'Done: files from Drop that were posted, by month.',
    'Problems: files from Drop that failed 5 times, each with a note saying why.',
  ].join('\r\n') + '\r\n');
  return f;
}

// The index survives restarts in pc/data/scan-index.json (write-then-rename, so a crash never leaves half a file).
export function loadIndex(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}
export function saveIndex(file, index) {
  writeFileSync(file + '.tmp', JSON.stringify(index));
  renameSync(file + '.tmp', file);
}

export const monthOf = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }).slice(0, 7);
