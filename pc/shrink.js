// Make one file small enough for Discord by hand: compress it, or split it into parts.
//   npm run shrink -- "C:\path\to\book.pdf"        (10 MB limit)
//   npm run shrink -- "C:\path\to\book.pdf" 50     (limit in MB, e.g. a boosted server)
// The results go in a folder next to the file: "<name> (for Discord)". The uploader does this automatically.
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { ghostscript, mb, PIECES_HELP, shrink } from './src/uploader/shrink.js';

const [file, limitArg] = process.argv.slice(2);
if (!file) { console.log('Usage: npm run shrink -- "C:\\path\\to\\file.pdf" [limit in MB]'); process.exit(1); }
const limit = Number(limitArg || 10) * 1024 * 1024;
const size = statSync(file).size;
console.log(`${basename(file)}: ${mb(size)}, limit ${mb(limit)}`);
if (extname(file).toLowerCase() === '.pdf' && !(await ghostscript())) console.log('(Ghostscript not found, so PDFs are split but not compressed. Install it from ghostscript.com to compress too.)');

const out = await shrink(file, limit);
const dir = join(dirname(file), `${basename(file, extname(file))} (for Discord)`);
mkdirSync(dir, { recursive: true });
for (const f of out.files) {
  writeFileSync(join(dir, f.name), f.data);
  console.log(`  ${f.name}  ${mb(f.data.length)}${f.label ? `  (${f.label})` : ''}`);
}
if (out.how === 'pieces') console.log(PIECES_HELP);
console.log(`Saved to ${dir}`);
