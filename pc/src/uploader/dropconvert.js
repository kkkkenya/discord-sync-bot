// The Drop folder turns photos and Office files into PDFs before they're posted, so they open in Crux's viewer:
//   a PowerPoint or Word file              → a PDF of the same name, next to it
//   photos in a folder ("EMM 302 CAT 2023") → one PDF named after the folder, in file-name order
//   a photo straight in Drop                → a one-page PDF
// A file is left until it hasn't changed for SETTLE ms (Google Drive may still be syncing it; a folder of photos
// may still be filling). The originals move to Done\Originals\YYYY-MM; the uploader posts the PDFs (it leaves
// photos and Office files in Drop to this). Runs every minute with the Drop scan.
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { IMAGE, OFFICE, makePdf, naturally, officeToPdf } from '../convert.js';
import { donePath, monthOf } from './scanner.js';

export const SETTLE = 2 * 60e3;
export const converts = (path) => IMAGE.test(path) || OFFICE.test(path);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

// What to make, from the files in Drop now: [{ out, from: [paths] }]. Pure, so it can be tested.
export function plan(drop, files, mtime, now) {
  const jobs = [];
  const settled = (list) => list.every((f) => now - mtime(f) >= SETTLE);
  for (const f of files.filter((x) => OFFICE.test(x) && settled([x]))) jobs.push({ out: join(dirname(f), `${basename(f, extname(f))}.pdf`), from: [f] });
  const byFolder = new Map();
  for (const f of files.filter((x) => IMAGE.test(x))) byFolder.set(dirname(f), [...(byFolder.get(dirname(f)) || []), f]);
  for (const [folder, photos] of byFolder) {
    if (!settled(photos)) continue;
    if (folder.toLowerCase() === drop.toLowerCase()) for (const p of photos) jobs.push({ out: join(drop, `${basename(p, extname(p))}.pdf`), from: [p] });
    else jobs.push({ out: join(folder, `${basename(folder)}.pdf`), from: photos.sort(naturally) });
  }
  return jobs;
}

export async function convertDrop(dumper, log = console.log, { make = makePdf, now = Date.now() } = {}) {
  if (!existsSync(dumper.drop)) return 0;
  const jobs = plan(dumper.drop, walk(dumper.drop), (f) => statSync(f).mtimeMs, now);
  for (const job of jobs) {
    let out = job.out;
    for (let n = 2; existsSync(out); n++) out = job.out.replace(/\.pdf$/i, ` (${n}).pdf`);
    try {
      const { bytes, skipped } = await make(job.from, { office: officeToPdf });
      writeFileSync(out, bytes);
      for (const f of job.from) {
        const dest = donePath(join(dumper.done, 'Originals'), basename(f), monthOf());
        mkdirSync(dirname(dest), { recursive: true });
        renameSync(f, dest);
      }
      console.log(`↻ ${job.from.length} file${job.from.length === 1 ? '' : 's'} → ${basename(out)}${skipped.length ? ` (left out: ${skipped.join('; ')})` : ''}`);
    } catch (e) {
      log(`⚠️ Couldn't make ${basename(out)} from ${job.from.map((f) => basename(f)).join(', ')}: ${e.message}`);
      for (const f of job.from) { // to Problems, so it isn't tried every minute
        const dest = donePath(dumper.problems, basename(f), '');
        mkdirSync(dirname(dest), { recursive: true });
        renameSync(f, dest);
        writeFileSync(`${dest}.txt`, `${basename(f)} couldn't be turned into a PDF: ${e.message}\r\n`);
      }
    }
  }
  return jobs.length;
}
