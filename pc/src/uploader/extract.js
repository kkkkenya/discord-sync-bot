// Reads just enough of a file to sort it: the title, page count, and the text of the first page or slide.
// Never throws: an unreadable file just comes back with empty text.
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_TEXT = 3000;
const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const xmlText = (xml) => squash([...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(' '));
const xmlTitle = (xml) => squash((xml.match(/<dc:title>([^<]*)<\/dc:title>/) || [])[1]);

export async function pdfInfo(buf, pages = 1) {
  // new Uint8Array(buf) copies: pdf.js takes ownership of the bytes it's given
  const doc = await getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: true, verbosity: 0 }).promise;
  try {
    const meta = await doc.getMetadata().catch(() => null);
    let text = '';
    for (let n = 1; n <= Math.min(pages, doc.numPages) && text.length < MAX_TEXT; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      text += ` ${content.items.map((it) => it.str).join(' ')}`;
      if (pages === 1 && squash(text).length < 80 && doc.numPages > 1) pages = 2; // page 1 is a cover: read page 2 too
    }
    return { title: squash(meta?.info?.Title), pages: doc.numPages, text: squash(text).slice(0, MAX_TEXT) };
  } finally {
    await doc.destroy();
  }
}

export async function extract(path) {
  const ext = extname(path).toLowerCase();
  try {
    if (ext === '.pdf') return await pdfInfo(await readFile(path));
    if (ext === '.docx') {
      const buf = await readFile(path);
      const { value } = await mammoth.extractRawText({ buffer: buf });
      const zip = await JSZip.loadAsync(buf);
      const core = await zip.file('docProps/core.xml')?.async('string');
      return { title: core ? xmlTitle(core) : '', pages: 0, text: squash(value).slice(0, MAX_TEXT) };
    }
    if (ext === '.pptx') {
      const zip = await JSZip.loadAsync(await readFile(path));
      const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      let text = '';
      for (const s of slides.slice(0, 2)) text += ` ${xmlText(await zip.file(s).async('string'))}`;
      const core = await zip.file('docProps/core.xml')?.async('string');
      return { title: core ? xmlTitle(core) : '', pages: slides.length, text: squash(text).slice(0, MAX_TEXT) };
    }
    if (['.txt', '.md', '.csv'].includes(ext)) {
      return { title: '', pages: 0, text: squash((await readFile(path, 'utf8')).slice(0, MAX_TEXT * 2)).slice(0, MAX_TEXT) };
    }
  } catch {
    // scanned, encrypted or broken files fall through to name-and-folder sorting
  }
  return { title: '', pages: 0, text: '' };
}
