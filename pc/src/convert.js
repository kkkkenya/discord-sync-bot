// Turns files into PDFs and merges them, so everything on the hub opens in Crux's viewer:
//   photos (JPG, PNG) → one page each, fitted to A4 (landscape when the photo is wide)
//   PowerPoint and Word (.pptx .ppt .docx .doc) → PDF through Microsoft Office on this PC (PowerShell COM)
//   PDFs → merged as they are
// Used by the Drop folder (dropconvert.js) and by "Make PDF" on the desktop (make-pdf.js).
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';

export const IMAGE = /\.(jpe?g|png)$/i;
export const OFFICE = /\.(pptx?|docx?)$/i;
export const CAN = /\.(jpe?g|png|pdf|pptx?|docx?)$/i;
const A4 = [595.28, 841.89];
const MARGIN = 18;

// "page 10.jpg" after "page 9.jpg": names compared with their numbers as numbers
export const naturally = (a, b) => basename(a).localeCompare(basename(b), undefined, { numeric: true, sensitivity: 'base' });

// Office → PDF, by asking PowerPoint or Word to save a copy (they stay hidden). Resolves the PDF's path.
export function officeToPdf(input, outDir, run = execFile) {
  const out = join(outDir, `${basename(input, extname(input))}.pdf`);
  const q = (p) => `'${p.replace(/'/g, "''")}'`;
  const script = /\.pptx?$/i.test(input)
    ? `$a = New-Object -ComObject PowerPoint.Application; try { $p = $a.Presentations.Open(${q(input)}, $true, $false, $false); $p.SaveAs(${q(out)}, 32); $p.Close() } finally { $a.Quit() }`
    : `$w = New-Object -ComObject Word.Application; $w.Visible = $false; try { $d = $w.Documents.Open(${q(input)}, $false, $true); $d.SaveAs2(${q(out)}, 17); $d.Close(0) } finally { $w.Quit() }`;
  return new Promise((ok, fail) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 180000 },
    (e, stdout, stderr) => (e ? fail(new Error(`Office couldn't convert ${basename(input)}: ${String(stderr || e.message).trim().slice(0, 200)}`)) : ok(out))));
}

async function addImage(pdf, bytes, name) {
  const img = /\.png$/i.test(name) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const wide = img.width > img.height;
  const [w, h] = wide ? [A4[1], A4[0]] : A4;
  const scale = Math.min((w - 2 * MARGIN) / img.width, (h - 2 * MARGIN) / img.height);
  const page = pdf.addPage([w, h]);
  page.drawImage(img, { x: (w - img.width * scale) / 2, y: (h - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
}

// Any mix of photos, PDFs and Office files, in the order given, as one PDF (bytes). skipped: files it couldn't use.
export async function makePdf(paths, { office = officeToPdf } = {}) {
  const pdf = await PDFDocument.create();
  const skipped = [];
  const work = mkdtempSync(join(tmpdir(), 'make-pdf-'));
  try {
    for (const path of paths) {
      try {
        if (IMAGE.test(path)) await addImage(pdf, readFileSync(path), path);
        else if (/\.pdf$/i.test(path) || OFFICE.test(path)) {
          const src = await PDFDocument.load(readFileSync(OFFICE.test(path) ? await office(path, work) : path), { ignoreEncryption: true });
          for (const p of await pdf.copyPages(src, src.getPageIndices())) pdf.addPage(p);
        } else skipped.push(`${basename(path)} (not a photo, PDF or Office file)`);
      } catch (e) {
        skipped.push(`${basename(path)} (${e.message})`);
      }
    }
    if (!pdf.getPageCount()) throw new Error(`Nothing could be turned into a PDF${skipped.length ? `: ${skipped.join('; ')}` : ''}.`);
    return { bytes: await pdf.save(), pages: pdf.getPageCount(), skipped };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
