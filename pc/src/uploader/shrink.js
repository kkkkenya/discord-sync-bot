// Makes a file small enough for Discord. Tried in order:
//   PDF:   1. compress with Ghostscript (if installed; ghostscript.com), 150 dpi images, fine for reading
//          2. split into parts by pages ("part 1 of 3, pages 1-180"), each under the limit
//   other: 3. zip it, 4. if still too big, cut the zip into pieces 7-Zip can open (name.zip.001, .002, ...)
// Returns { how, files: [{ name, data, label }] } with the data in memory; nothing is written next to the original.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

const SAFETY = 0.95; // leave room for the message itself
export const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const run = (cmd, args) => new Promise((ok, fail) =>
  execFile(cmd, args, { timeout: 15 * 60 * 1000, windowsHide: true, maxBuffer: 1024 * 1024 }, (e) => (e ? fail(e) : ok())));

let gsPath; // undefined: not looked for yet; null: not installed
export async function ghostscript() {
  if (gsPath !== undefined) return gsPath;
  for (const base of ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs']) {
    if (!existsSync(base)) continue;
    for (const version of readdirSync(base).sort().reverse()) {
      for (const exe of ['gswin64c.exe', 'gswin32c.exe']) {
        const p = join(base, version, 'bin', exe);
        if (existsSync(p)) return (gsPath = p);
      }
    }
  }
  for (const name of ['gswin64c', 'gs']) if (await run(name, ['-v']).then(() => true, () => false)) return (gsPath = name);
  return (gsPath = null);
}

async function compressPdf(path) {
  const gs = await ghostscript();
  if (!gs) return null;
  const out = join(tmpdir(), `esh-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  try {
    await run(gs, ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', '-dPDFSETTINGS=/ebook', '-dDetectDuplicateImages=true',
      '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${out}`, path]);
    return await readFile(out);
  } catch {
    return null; // a PDF Ghostscript can't handle still gets split below
  } finally {
    await rm(out, { force: true });
  }
}

// Split by pages so every part fits: start with even parts, halve any part that's still too big.
async function splitPdf(bytes, limit) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const total = src.getPageCount();
  const perPart = Math.max(1, Math.ceil(total / Math.ceil(bytes.length / (limit * 0.85))));
  const todo = [];
  for (let from = 0; from < total; from += perPart) todo.push([from, Math.min(total, from + perPart)]);
  const parts = [];
  while (todo.length) {
    const [from, to] = todo.shift();
    const doc = await PDFDocument.create();
    for (const page of await doc.copyPages(src, Array.from({ length: to - from }, (_, n) => from + n))) doc.addPage(page);
    const data = Buffer.from(await doc.save({ useObjectStreams: true }));
    if (data.length <= limit) parts.push({ from, to, data });
    else if (to - from === 1) throw new Error(`page ${from + 1} on its own is ${mb(data.length)}, over the ${mb(limit)} limit`);
    else { const mid = Math.floor((from + to) / 2); todo.unshift([from, mid], [mid, to]); } // keeps page order
  }
  return parts;
}

async function zipAndCut(path, name, limit) {
  const zip = new JSZip();
  zip.file(name, await readFile(path));
  const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  const zipName = `${name}.zip`;
  if (data.length <= limit) return { how: 'zipped', files: [{ name: zipName, data, label: 'zipped' }] };
  const size = Math.floor(limit);
  const count = Math.ceil(data.length / size);
  const files = [];
  for (let n = 0; n < count; n++) {
    files.push({ name: `${zipName}.${String(n + 1).padStart(3, '0')}`, data: data.subarray(n * size, (n + 1) * size), label: `piece ${n + 1} of ${count}` });
  }
  return { how: 'pieces', files };
}

export async function shrink(path, limitBytes) {
  const limit = Math.floor(limitBytes * SAFETY);
  const name = basename(path);
  if (extname(name).toLowerCase() === '.pdf') {
    const original = await readFile(path);
    const compressed = await compressPdf(path);
    const best = compressed && compressed.length < original.length ? compressed : original;
    const note = best === compressed ? `compressed from ${mb(original.length)}` : '';
    if (best.length <= limit) return { how: 'compressed', files: [{ name, data: best, label: note }] };
    try {
      const parts = await splitPdf(best, limit);
      const stem = name.replace(/\.pdf$/i, '');
      return {
        how: 'split',
        files: parts.map((p, n) => ({
          name: `${stem} (part ${n + 1} of ${parts.length}).pdf`,
          data: p.data,
          label: `part ${n + 1} of ${parts.length}, pages ${p.from + 1}-${p.to}${note ? `, ${note}` : ''}`,
        })),
      };
    } catch (e) {
      if (/limit/.test(e.message)) throw e; // one enormous page: nothing more we can do
      // a damaged or unusual PDF: fall back to zip pieces
    }
  }
  return zipAndCut(path, name, limit);
}

// How to put the pieces back together, shown under cut-up uploads.
export const PIECES_HELP = 'Download every piece into one folder, then open the `.001` file with 7-Zip (or run `copy /b name.zip.001+name.zip.002 name.zip`).';
