// Reads one unit's hub files on this computer (into study/data/library.json), with OCR for scans:
//   node tools/prepare-unit.js "EMM 302"
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

for (const f of ['../.env', '../../pc/.env', '../../community/.env']) config({ path: fileURLToPath(new URL(f, import.meta.url)), quiet: true });
const { filesFor } = await import('../server/library.js');
const { library, prepareUnit } = await import('../server/ingest.js');

const unit = process.argv[2];
const { files, note } = await filesFor(unit);
if (note) { console.log(note); process.exit(1); }
for (let r = { pending: 1 }; r.pending;) {
  r = await prepareUnit(files, unit);
  for (const x of r.results) console.log(`${x.error ? '✗' : '✓'} ${x.name}: ${x.chars ?? 0} chars${x.method ? ` (${x.method})` : ''}${x.error ? `: ${x.error}` : ''}`);
  console.log(`${r.done} of ${r.total} read, ${r.pending} left`);
}
const mine = Object.values(library.files).filter((e) => e.unit === unit);
console.log(`${unit}: ${mine.filter((e) => e.text).length} of ${mine.length} files have text, ${mine.filter((e) => e.method === 'ocr').length} through OCR`);
