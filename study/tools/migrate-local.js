// Moves your local Study Desk data into Crux: study/data/study.json becomes your document in crux_docs, and the
// text already read from hub files (data/library.json) goes into crux_file_text for everyone.
// Backs both files up first (data/backups/pre-crux-<day>-*.json). Safe to run twice: your document is only
// written when Crux doesn't have one yet (--force replaces it), and file text is upserted.
//   node tools/migrate-local.js [--force]
import { config } from 'dotenv';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

for (const f of ['../.env', '../../pc/.env']) config({ path: fileURLToPath(new URL(f, import.meta.url)), quiet: true });
const { db } = await import('../../lib/db.js');
const { normalize } = await import('../server/store.js');

const DATA = new URL('../data/', import.meta.url);
const owner = process.env.OWNER_ID;
if (!owner) { console.error('OWNER_ID is missing in study/.env. Run setup-web.bat first.'); process.exit(1); }

const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
mkdirSync(new URL('backups/', DATA), { recursive: true });
for (const f of ['study', 'library']) {
  const from = new URL(`${f}.json`, DATA);
  if (existsSync(from)) copyFileSync(from, new URL(`backups/pre-crux-${day}-${f}.json`, DATA));
}
console.log(`Backed up to study/data/backups/pre-crux-${day}-*.json`);

// 1. your document
await db.upsert('crux_users', [{ id: owner, name: 'Owner', tier: 'owner', tier_checked_at: new Date().toISOString() }], 'id');
const doc = normalize(JSON.parse(readFileSync(new URL('study.json', DATA), 'utf8')));
const [have] = await db.select('crux_docs', `user_id=eq.${owner}&select=rev`);
if (have && !process.argv.includes('--force')) {
  console.log(`Crux already has your document (rev ${have.rev}): left as it is. Use --force to replace it with the local one.`);
} else if (have) {
  await db.update('crux_docs', `user_id=eq.${owner}&select=rev`, { doc, rev: have.rev + 1, updated_at: new Date().toISOString() });
  console.log(`Replaced your Crux document: ${doc.units.length} units, ${doc.paperq.length} past-paper questions.`);
} else {
  await db.insert('crux_docs', [{ user_id: owner, doc, rev: 1 }]);
  console.log(`Saved your Crux document: ${doc.units.length} units, ${doc.paperq.length} past-paper questions.`);
}

// 2. file text, for files the hub index knows (files you added from this computer stay local)
const METHOD = { '.pdf': 'pdf', '.docx': 'docx', '.pptx': 'pptx', '.txt': 'text', '.md': 'text' };
const lib = existsSync(new URL('library.json', DATA)) ? JSON.parse(readFileSync(new URL('library.json', DATA), 'utf8')).files || {} : {};
const ids = Object.keys(lib).filter((id) => /^\d+$/.test(id));
const known = new Set();
for (let i = 0; i < ids.length; i += 100) {
  for (const r of await db.select('files', `id=in.(${ids.slice(i, i + 100).join(',')})&select=id`)) known.add(String(r.id));
}
const rows = ids.filter((id) => known.has(id)).map((id) => {
  const e = lib[id];
  const text = (e.text || '').replace(/\u0000/g, '').trim(); // some PDFs give NUL characters; Postgres text can't hold them
  return {
    file_id: Number(id), unit_code: e.unit || null, name: e.name || null, paper: Boolean(e.paper),
    status: text ? 'done' : 'new', method: text ? METHOD[extname(e.name || '').toLowerCase()] || 'text' : null,
    pages: e.pages || null, chars: text.length, text: text || null, page_starts: e.pageStarts || null, updated_at: new Date().toISOString(),
  };
});
for (let i = 0; i < rows.length; i += 25) await db.upsert('crux_file_text', rows.slice(i, i + 25), 'file_id');
const skipped = Object.keys(lib).length - rows.length;
console.log(`File text: ${rows.length} files (${rows.filter((r) => r.status === 'done').length} with text, ${rows.filter((r) => r.status === 'new').length} waiting for OCR).${skipped ? ` ${skipped} local-only files skipped.` : ''}`);
