// "Make PDF": drop photos, PDFs, PowerPoint or Word files (or a folder of them) onto Make PDF.bat or its desktop
// shortcut, and they become one PDF next to the first one, in file-name order (page 2 before page 10).
// Nothing is posted anywhere. Put the PDF in Hub Dumper\Drop to send it to the hub.
//   node make-pdf.js <file or folder> [more ...]
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { CAN, makePdf, naturally } from './src/convert.js';

const args = process.argv.slice(2).filter(Boolean);
if (!args.length) { console.log('Drag photos, PDFs, PowerPoint or Word files onto Make PDF, and they become one PDF.'); process.exit(0); }
const files = args.flatMap((a) => (statSync(a).isDirectory() ? readdirSync(a).map((f) => join(a, f)).filter((f) => statSync(f).isFile()) : [a]))
  .filter((f) => CAN.test(f)).sort(naturally);
if (!files.length) { console.log('None of those are photos (JPG, PNG), PDFs, PowerPoint or Word files.'); process.exit(1); }

// the name: a folder dropped on its own gives its name; one file keeps its own; several are "<first> (merged)"
const one = args.length === 1 && statSync(args[0]).isDirectory();
const stem = one ? basename(args[0]) : files.length === 1 ? basename(files[0], extname(files[0])) : `${basename(files[0], extname(files[0]))} (merged)`;
const folder = one ? dirname(args[0]) : dirname(files[0]);
let out = join(folder, `${stem}.pdf`);
for (let n = 2; existsSync(out); n++) out = join(folder, `${stem} (${n}).pdf`);

console.log(`Making one PDF from ${files.length} file${files.length === 1 ? '' : 's'}:`);
for (const f of files) console.log(`  ${basename(f)}`);
if (files.some((f) => /\.(pptx?|docx?)$/i.test(f))) console.log('PowerPoint and Word files go through Office: about a minute the first time.');
try {
  const { bytes, pages, skipped } = await makePdf(files);
  writeFileSync(out, bytes);
  console.log(`\nDone: ${out}\n${pages} page${pages === 1 ? '' : 's'}, ${Math.round(bytes.length / 1024)} KB.`);
  if (skipped.length) console.log(`Left out:\n${skipped.map((s) => `  ${s}`).join('\n')}`);
} catch (e) {
  console.error(`\n${e.message}`);
  process.exit(1);
}
