// Draws a PDF's pages as PNG pictures with pdf.js and @napi-rs/canvas, on the server, with nothing to install.
// A model that can see images (Claude Code here) then reads a scanned paper page by page, even when Gemini is busy:
// owner, 2026-11-12, "build a PDF viewer for when Gemini is too busy".

const MAX_PAGES = 40;
const MAX_SIDE = 1800; // px: sharp enough for small print and subscripts, small enough to read quickly

/** [{ page, png }] for the first `maxPages` pages. */
export async function renderPdfPages(buf, { maxPages = MAX_PAGES, maxSide = MAX_SIDE } = {}) {
  // loaded only when a page is drawn: Vercel never takes this path and need not load the native canvas
  const { createCanvas } = await import('@napi-rs/canvas');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, maxSide / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      pages.push({ page: n, png: canvas.toBuffer('image/png') });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return { pages, total: doc.numPages };
}
