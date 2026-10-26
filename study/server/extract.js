// Text extraction for the context library. Same technique as the PC uploader (pc/src/uploader/extract.js),
// but works on a buffer and keeps far more text, so the AI can be grounded in the actual material.
// Never throws: an unreadable or scanned file comes back with empty text.
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_TEXT = 50000; // ~12k tokens per file is plenty for grounding; keeps the cache small
const MAX_PAGES = 100;
const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const xmlText = (xml) => squash([...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(' '));

async function pdfText(buf) {
  // new Uint8Array(buf) copies: pdf.js takes ownership of the bytes it is given
  const doc = await getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: true, verbosity: 0 }).promise;
  try {
    let text = '';
    for (let n = 1; n <= Math.min(MAX_PAGES, doc.numPages) && text.length < MAX_TEXT; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      text += `\n${content.items.map((it) => it.str).join(' ')}`;
    }
    return { pages: doc.numPages, text: squash(text).slice(0, MAX_TEXT) };
  } finally {
    await doc.destroy();
  }
}

// buf: downloaded bytes, name: filename. Returns { pages, text }. Images and scanned PDFs yield empty text.
export async function extract(buf, name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'pdf') return await pdfText(buf);
    if (ext === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return { pages: 0, text: squash(value).slice(0, MAX_TEXT) };
    }
    if (ext === 'pptx') {
      const zip = await JSZip.loadAsync(buf);
      const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      let text = '';
      for (const s of slides) { text += `\n${xmlText(await zip.file(s).async('string'))}`; if (text.length > MAX_TEXT) break; }
      return { pages: slides.length, text: squash(text).slice(0, MAX_TEXT) };
    }
    if (['txt', 'md', 'csv'].includes(ext)) return { pages: 0, text: squash(buf.toString('utf8').slice(0, MAX_TEXT * 2)).slice(0, MAX_TEXT) };
  } catch {
    // scanned, encrypted or broken files fall through to empty text
  }
  return { pages: 0, text: '' };
}
