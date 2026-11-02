// Photos and Office files already on the server get a PDF version, posted right after them in the same unit post,
// so they open in Crux's viewer: the photos in one message become one PDF, each PowerPoint or Word file its own.
// The originals stay. Each PDF is recorded (files.source_path = converted:<original message id>), so running this
// again carries on where it stopped. #to-sort is left alone. Needs Office on this PC for PowerPoint and Word.
//   node convert-existing.js             shows what it would post, changes nothing
//   node convert-existing.js --go        posts them (about a minute per Office file, a few seconds per photo)
//   node convert-existing.js --go --limit 20   only the first 20 messages
import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
config({ path: new URL('./.env', import.meta.url), quiet: true });
const { api, sleep } = await import('../lib/discord.js');
const { db } = await import('../lib/db.js');
const { GUILD_ID } = await import('../lib/config.js');
const { IMAGE, OFFICE, makePdf, naturally } = await import('./src/convert.js');

const GO = process.argv.includes('--go');
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || Infinity;
const ICON = { paper: '📝', notes: '📒', slides: '📊', book: '📚', other: '📄' };

const all = [];
for (let o = 0; ; o += 1000) {
  const page = await db.select('files', `select=id,name,kind,unit_code,channel_id,message_id,size,dest_name,forum,source_path&order=id.asc&limit=1000&offset=${o}`);
  all.push(...page);
  if (page.length < 1000) break;
}
const done = new Set(all.filter((f) => f.source_path?.startsWith('converted:')).map((f) => f.source_path.slice(10)));
// what to make: one job per message of photos, one per Office file
const jobs = [];
const byMsg = new Map();
for (const f of all.filter((x) => (IMAGE.test(x.name) || OFFICE.test(x.name)) && x.dest_name !== 'to-sort')) {
  if (OFFICE.test(f.name)) { if (!done.has(`${f.message_id}:${f.name}`)) jobs.push({ key: `${f.message_id}:${f.name}`, files: [f] }); continue; }
  byMsg.set(f.message_id, [...(byMsg.get(f.message_id) || []), f]);
}
for (const [msg, files] of byMsg) if (!done.has(msg)) jobs.push({ key: msg, files });
const office = jobs.filter((j) => OFFICE.test(j.files[0].name)).length;
console.log(`${jobs.length} PDFs to make: ${office} from PowerPoint or Word, ${jobs.length - office} from photos (${done.size} made before).`);
if (!GO) {
  for (const j of jobs.slice(0, 15)) console.log(`  ${j.files[0].unit_code || '?'}  ${j.files.map((f) => f.name).join(', ').slice(0, 110)}`);
  if (jobs.length > 15) console.log(`  … and ${jobs.length - 15} more`);
  console.log('\nNothing posted. Run with --go to post them.');
  process.exit(0);
}

const tier = (await api('GET', `/guilds/${GUILD_ID}`)).premium_tier || 0;
const maxBytes = [10, 10, 50, 100][tier] * 1024 * 1024;
const work = mkdtempSync(join(tmpdir(), 'convert-existing-'));
let made = 0;
let skipped = 0;
try {
  for (const job of jobs.slice(0, LIMIT)) {
    const first = job.files[0];
    try {
      const msg = await api('GET', `/channels/${first.channel_id}/messages/${first.message_id}`);
      const paths = [];
      for (const f of job.files) {
        const att = msg.attachments.find((a) => a.filename === f.name || a.filename === f.name.replace(/ /g, '_')) || msg.attachments.find((a) => a.size === f.size);
        if (!att) continue;
        const p = join(work, `${paths.length}-${basename(f.name)}`);
        writeFileSync(p, Buffer.from(await (await fetch(att.url)).arrayBuffer()));
        paths.push(p);
      }
      if (!paths.length) throw new Error('the message has no attachments any more');
      const { bytes } = await makePdf(paths.sort(naturally));
      if (bytes.length > maxBytes) throw new Error(`the PDF is ${Math.round(bytes.length / 1048576)} MB, over Discord's limit`);
      const name = `${basename(first.name, extname(first.name))}${job.files.length > 1 ? ` (+${job.files.length - 1})` : ''}.pdf`;
      const form = new FormData();
      form.append('payload_json', JSON.stringify({ content: `${ICON[first.kind] || '📄'} **${name}** · PDF of ${job.files.length > 1 ? `the ${job.files.length} photos above` : `**${first.name}** above`}`, allowed_mentions: { parse: [] } }));
      form.append('files[0]', new Blob([bytes], { type: 'application/pdf' }), name);
      const r = await fetch(`https://discord.com/api/v10/channels/${first.channel_id}/messages`, { method: 'POST', headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }, body: form });
      const posted = await r.json();
      if (!r.ok) throw new Error(`Discord ${r.status}: ${posted.message || ''}`);
      await db.insert('files', [{
        hash: createHash('sha256').update(bytes).digest('hex'), name, kind: first.kind, unit_code: first.unit_code, channel_id: posted.channel_id, message_id: posted.id,
        size: bytes.length, source_path: `converted:${job.key}`, dest_name: first.dest_name, forum: first.forum,
      }], { ignoreDuplicates: true });
      made++;
      console.log(`✓ ${made}/${Math.min(jobs.length, LIMIT)} ${first.unit_code || ''} ${name}`);
    } catch (e) {
      skipped++;
      console.log(`✗ ${first.name}: ${e.message}`);
    }
    for (const f of job.files) rmSync(join(work, f.name), { force: true });
    await sleep(1500);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`\nPosted ${made} PDF${made === 1 ? '' : 's'}${skipped ? `, ${skipped} couldn't be made (listed above)` : ''}.`);
