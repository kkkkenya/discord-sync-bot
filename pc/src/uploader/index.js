// Scans the Hub Dumper folder in Drive (Drop, plus the shared folders shortcut into Sources) and the folders in
// WATCH_DIRS with the shortcuts inside them (scanner.js). Every file that appears, including everything already
// there on the first run, is sorted and uploaded once:
//   unit code found -> that unit's post (created if missing), forwarded to its other-year post too
//   book, no code   -> the best topic shelf
//   anything else   -> #to-sort with the Sort buttons, and reps and admins get a ping
// Files too big for Discord are compressed or split into parts (shrink.js). Files stay where they are, except Drop
// files, which move to Done (or Problems). The sha256 of each one is kept in Supabase so nothing is uploaded twice.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { open, stat } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNELS, SORTER_ROLE_MATCH } from '../../../lib/config.js';
import { db } from '../../../lib/db.js';
import { sleep } from '../../../lib/discord.js';
import { forwardTo } from '../../../lib/sorting.js';
import { save, state } from '../state.js';
import { classify } from './classify.js';
import { convertDrop, converts } from './dropconvert.js';
import { collectFromCrux } from './fromcrux.js';
import { fingerprint, onServer } from './existing.js';
import { dumperFolders, donePath, loadIndex, monthOf, resolveSources, saveIndex, scan, skip, under, update } from './scanner.js';
import { mb, PIECES_HELP, shrink } from './shrink.js';

const ICON = { paper: '📝', notes: '📒', slides: '📊', book: '📚', other: '📄' };
const LABEL = { paper: 'Past paper', notes: 'Notes', slides: 'Slides', book: 'Book', other: 'File' };
const LIMIT_BY_TIER = [10, 10, 50, 100]; // MB a bot can upload, by server boost level
const NONE = { parse: [] };

// Files with no extension ("Photo from Amos (4)", a phone export) get one from their first bytes, so Discord
// shows them properly.
async function withExtension(path, name) {
  if (extname(name)) return name;
  const fh = await open(path, 'r');
  try {
    const { buffer } = await fh.read(Buffer.alloc(8), 0, 8, 0);
    const sig = buffer.toString('hex');
    const ext = sig.startsWith('ffd8ff') ? '.jpg' : sig.startsWith('89504e47') ? '.png' : sig.startsWith('25504446') ? '.pdf'
      : sig.startsWith('47494638') ? '.gif' : sig.startsWith('504b0304') ? '.zip' : sig.startsWith('d0cf11e0') ? '.doc' : '';
    return name + ext;
  } finally {
    await fh.close();
  }
}

function sha256(path) {
  return new Promise((ok, fail) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail);
  });
}

// Drive for Desktop shows shortcuts to shared folders as .lnk files; Windows knows where they point.
function shortcutTargets(paths) {
  if (!paths.length) return Promise.resolve([]);
  const list = paths.map((p) => `'${p.replace(/'/g, "''")}'`).join(',');
  const script = `[Console]::OutputEncoding = [Text.Encoding]::UTF8; $s = New-Object -ComObject WScript.Shell; @(${list}) | ForEach-Object { $s.CreateShortcut($_).TargetPath }`;
  return new Promise((ok) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, maxBuffer: 1 << 20 },
    (e, out) => ok(e ? [] : String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean))));
}
const isFolder = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

export async function startUploader(ctx) {
  const dirs = (process.env.WATCH_DIRS || '').split(';').map((d) => d.trim()).filter(Boolean).map((d) => resolve(d));
  const home = resolve(process.env.DUMPER_DIR || 'G:\\My Drive\\Hub Dumper');
  let dumper = dumperFolders(home, { create: !ctx.dry });
  const findRoots = () => resolveSources({ watchDirs: dirs, sourcesDir: dumper.sources, dropDir: dumper.drop }, shortcutTargets, { isFolder, skip });
  // Right after Windows starts, Google Drive may not have mounted G: yet: missing folders are scanned again every
  // 10 minutes (a warning only if they're still missing after 30 minutes).
  let roots = await findRoots();
  const missing = roots.filter((d) => !existsSync(d));
  if (missing.length) console.log(`Waiting for ${missing.join(', ')} (Google Drive may still be starting)`);
  console.log(`Scanning ${roots.length} folder${roots.length === 1 ? '' : 's'}:\n${roots.map((r) => `  ${r}`).join('\n')}`);

  const maxBytes = LIMIT_BY_TIER[ctx.guild.premiumTier || 0] * 1024 * 1024;
  const seen = new Set();
  const fresh = () => ({ unit: 0, shelf: 0, toSort: 0, dupes: 0, shrunk: [], tooBig: [], failed: [], created: [] });
  const relOf = (path, root) => relative(dirname(root), path); // "Notes\Year 2\EMM 200\x.pdf"
  let report = fresh();
  const dryRows = [];
  let queue = Promise.resolve();
  let pending = 0;
  let ready = false;

  // On a slow line Discord can take a file and still have the reply time out. Before trying again, look for
  // it in the channel, so an upload that "failed" is never posted a second time.
  const transient = (e) => e?.name === 'AbortError' || ['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_SOCKET', 'EPIPE'].includes(e?.code) || e?.status >= 500;
  async function landed(target, bytes, since) {
    await sleep(4000);
    try {
      const recent = await target.messages.fetch({ limit: 20 });
      return recent.find((m) => m.author.id === ctx.client.user.id && m.createdTimestamp >= since - 60000 && m.attachments.some((a) => a.size === bytes)) || null;
    } catch {
      return null; // can't look (offline): treat as not landed; the outage pause retries it later
    }
  }
  async function send(target, payload, bytes) {
    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      try {
        return await target.send(payload);
      } catch (e) {
        if (bytes) { const msg = await landed(target, bytes, started); if (msg) return msg; }
        if (attempt >= 3 || !transient(e)) throw e;
        console.error(`send to ${target.name} timed out or dropped (try ${attempt} of 3), retrying: ${e.message}`);
        await sleep(10000 * attempt);
      }
    }
  }

  // Upload one file (in parts if it's too big). Returns every message posted, in order.
  async function post(target, label, path, size, info) {
    if (size <= maxBytes) return [await send(target, { content: label || undefined, files: [{ attachment: path, name: info.name }], allowedMentions: NONE }, size)];
    const out = await shrink(path, maxBytes);
    const msgs = [];
    for (const [n, f] of out.files.entries()) {
      const help = out.how === 'pieces' && n === out.files.length - 1 ? `\n🧩 ${PIECES_HELP}` : '';
      msgs.push(await send(target, { content: `${label || `📄 **${info.name}**`}${f.label ? ` · ${f.label}` : ''}${help}`, files: [{ attachment: f.data, name: f.name }], allowedMentions: NONE }, f.data.length));
      await sleep(800);
    }
    report.shrunk.push(`${info.name} (${mb(size)}): ${out.how === 'split' ? `${out.files.length} parts` : out.how === 'pieces' ? `${out.files.length} zip pieces` : `${out.how} to ${mb(out.files[0].data.length)}`}`);
    return msgs;
  }

  // A file that fails is forgotten again, so a retry (after a dropped connection) isn't mistaken for a duplicate.
  async function handle(path) {
    const mark = {};
    try { await handleFile(path, mark); } catch (e) { if (mark.key) seen.delete(mark.key); throw e; }
    return mark;
  }

  // A Drop file moves out once it's posted (Done\YYYY-MM) or has failed for good (Problems, with a note).
  function settleDrop(path, problem) {
    if (ctx.dry || !under(path, dumper.drop)) return;
    try {
      const dest = problem ? donePath(dumper.problems, basename(path), '') : donePath(dumper.done, basename(path), monthOf());
      mkdirSync(dirname(dest), { recursive: true });
      renameSync(path, dest);
      if (problem) writeFileSync(`${dest}.txt`, `${basename(path)} wasn't posted: ${problem}\r\n`);
      delete index[path];
      saveSoon();
    } catch (e) {
      console.error(`couldn't move ${basename(path)} out of Drop: ${e.message}`);
    }
  }

  async function handleFile(path, mark) {
    const root = roots.find((r) => under(path, r)) || roots[0];
    const s = await stat(path);
    if (!s.isFile() || !s.size) return;
    const fp = fingerprint(s.size, basename(path));
    if (state.unplaceable?.[fp]) { mark.problem = "couldn't be made small enough for Discord"; return; } // last time either

    // no duplicates, cheapest check first:
    // 1. already on the server (old uploads, files posted by hand, or uploaded by this bot before)
    if (ctx.dry ? ctx.existing?.has(fp) : await onServer(s.size, basename(path))) {
      if (ctx.dry) dryRows.push({ dest: 'skip: already on the server', rel: relOf(path, root), kind: '', size: s.size });
      return;
    }
    // 2. the same file twice in your folders (same content, any name)
    const key = ctx.dry ? fp : await sha256(path);
    if (seen.has(key)) {
      report.dupes++;
      if (ctx.dry) dryRows.push({ dest: 'skip: duplicate of another file in your folders', rel: relOf(path, root), kind: '', size: s.size });
      return;
    }
    seen.add(key);
    mark.key = key;
    if (!ctx.dry && (await db.select('files', `hash=eq.${key}&select=id`)).length) return;

    const info = await classify(path, root, s.size, ctx.index);
    info.name = await withExtension(path, info.name);
    let posts = info.code ? ctx.index.pick(info.code, info.hints) : [];
    const newForum = info.code && !posts.length ? ctx.index.forumFor(info.code, info.hints) : null;

    if (ctx.dry) {
      const dest = posts.length ? posts.map((p) => `${p.forum} › ${p.name}`).join(' + ')
        : newForum ? `NEW post "${info.code}" in ${newForum.name}`
          : info.shelf ? `📚 shelf: ${info.shelf.name}` : '#to-sort';
      dryRows.push({ dest, kind: info.kind, code: info.code, from: info.from, rel: info.rel, size: s.size, big: s.size > maxBytes });
      return;
    }

    const from = info.rel.match(/\(from ([^)\/]{1,60})\)/)?.[1]; // added by a student in Crux (fromcrux.js)
    const label = `${ICON[info.kind]} **${info.name}** · ${LABEL[info.kind]}${from ? ` · shared by **${from}** via Crux` : ''}`;
    const record = (msg, extra) => db.insert('files', [{
      hash: key, name: info.name, kind: info.kind, unit_code: info.code, channel_id: msg.channelId, message_id: msg.id,
      size: s.size, source_path: info.rel, ...extra,
    }], { ignoreDuplicates: true });

    try {
      if (info.code && !posts.length && newForum) {
        posts = await ctx.index.createPost(info.code, info.hints).catch((e) => { report.failed.push(`${info.rel}: couldn't create a post (${e.message})`); return []; });
        if (posts.length) report.created.push(`${info.code} in ${posts[0].forum}`);
      }
      if (posts.length) {
        const msgs = await post(posts[0].thread, label, path, s.size, info);
        await record(msgs[0], { dest_name: posts[0].name, forum: posts[0].forum }); // straight away, so a crash can't mean a second copy
        for (const other of posts.slice(1)) for (const m of msgs) await forwardTo(other.id, m.id, m.channelId).catch(() => {});
        console.log(`↑ ${info.rel} -> ${posts[0].forum} › ${posts[0].name}`);
        report.unit++;
        return;
      }
      if (info.shelf) {
        const shelf = await ctx.client.channels.fetch(info.shelf.id);
        const msgs = await post(shelf, `${label}${info.title ? `\n_${info.title.slice(0, 150)}_` : ''}`, path, s.size, info);
        await record(msgs[0], { dest_name: info.shelf.name });
        console.log(`↑ ${info.rel} -> shelf ${info.shelf.name}`);
        report.shelf++;
        return;
      }

      // couldn't place it: #to-sort, in the format the Sort buttons and the dashboard read
      const toSort = await ctx.client.channels.fetch(CHANNELS.toSort);
      const msgs = await post(toSort, '', path, s.size, info);
      await record(msgs[0], { dest_name: 'to-sort' }); // recorded first: a failed note never means a second copy
      console.log(`↑ ${info.rel} -> #to-sort`);
      const reason = info.code ? `${info.code} has no forum to put a new post in`
        : info.kind === 'book' ? 'a book that matches no shelf' : 'no unit code in the name, folders or page 1';
      const hints = [info.hints.dept, info.hints.year && `year ${info.hints.year}`, info.hints.sem && `sem ${info.hints.sem}`].filter(Boolean).join(', ');
      await send(toSort, {
        content: [
          `⚠️ **Couldn't place this file**: ${reason}`,
          info.code ? `💡 Suggestion: ${info.code}` : '',
          info.snippet ? `Page 1 starts: "${info.snippet.replace(/"/g, "'").replace(/\s+/g, ' ').slice(0, 200)}"` : '',
          `📁 From: \`${info.rel.slice(0, 300)}\`${hints ? ` (${hints})` : ''}`,
          msgs.length > 1 ? `🧩 Parts: ${msgs.map((m) => m.id).join(' ')}` : '',
        ].filter(Boolean).join('\n'),
        components: [{ type: 1, components: [
          { type: 2, style: 1, label: 'Sort into a unit', custom_id: `sort:start:${msgs[0].id}` },
          { type: 2, style: 2, label: 'Not a unit: #pdf-library', custom_id: `sort:library:${msgs[0].id}` },
        ] }],
        allowedMentions: NONE,
      });
      report.toSort++;
    } catch (e) {
      if (!/limit/.test(e.message)) throw e;
      report.tooBig.push(`${info.rel} (${mb(s.size)}): ${e.message}`);
      mark.problem = `too big for Discord, even compressed or split (${e.message})`;
      (state.unplaceable ||= {})[fp] = info.rel; // don't retry on every start
      save();
    }
  }

  // reps and admins: roles named like "Rep"/"Class Reps", plus admin roles
  const sorterRoles = () => [...ctx.guild.roles.cache.values()].filter((r) => !r.managed && r.id !== ctx.guild.id
    && (SORTER_ROLE_MATCH.test(r.name) || r.permissions.has('Administrator')));

  async function summarise() {
    const r = report;
    report = fresh();
    const placed = r.unit + r.shelf + r.toSort;
    if (!placed && !r.tooBig.length && !r.failed.length) return;
    const lines = [`📥 **Uploaded ${placed} file${placed === 1 ? '' : 's'}**: ${r.unit} to unit posts, ${r.shelf} to shelves, ${r.toSort} to <#${CHANNELS.toSort}>.`];
    if (r.dupes) lines.push(`♻️ Skipped ${r.dupes} duplicate${r.dupes === 1 ? '' : 's'} (the same file in more than one folder).`);
    if (r.created.length) lines.push(`🆕 New unit posts: ${r.created.join(', ')}`);
    if (r.shrunk.length) lines.push('🗜️ Too big for one upload, so compressed or split:', ...r.shrunk.slice(0, 15).map((f) => `• ${f}`));
    if (r.tooBig.length) lines.push("🐘 Couldn't make these small enough:", ...r.tooBig.slice(0, 15).map((f) => `• ${f}`));
    if (r.failed.length) lines.push('❌ Failed:', ...r.failed.slice(0, 10).map((f) => `• ${f}`));
    ctx.log(lines.join('\n'));
    if (r.toSort) {
      const roles = sorterRoles();
      const toSort = await ctx.client.channels.fetch(CHANNELS.toSort);
      await toSort.send({
        content: `${roles.map((x) => `<@&${x.id}>`).join(' ')} 📥 **${r.toSort} new file${r.toSort === 1 ? '' : 's'} need${r.toSort === 1 ? 's' : ''} sorting.** Tap **Sort into a unit** under each one, or use the dashboard.`.trim(),
        allowedMentions: { roles: roles.map((x) => x.id) },
      }).catch(() => {});
    }
  }

  function finishDryRun() {
    const out = new URL('../../data/', import.meta.url);
    mkdirSync(out, { recursive: true });
    const byDest = new Map();
    for (const row of dryRows) byDest.set(row.dest, [...(byDest.get(row.dest) || []), row]);
    const lines = [];
    for (const [dest, rows] of [...byDest].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`\n## ${dest}  (${rows.length})`);
      for (const r of rows) lines.push(`  ${r.kind.padEnd(6)} ${r.code ? `${r.code} from ${r.from}` : ''}${r.big ? `  [${mb(r.size)}: will be compressed/split]` : ''}\n      ${r.rel}`);
    }
    const file = new URL('dry-run.txt', out);
    writeFileSync(file, `Dry run ${new Date().toISOString()}: where each file would go\n${lines.join('\n')}\n`);
    const count = (f) => dryRows.filter(f).length;
    const created = new Set(dryRows.filter((r) => r.dest.startsWith('NEW')).map((r) => r.dest));
    const special = (d) => d.startsWith('NEW') || d.startsWith('📚') || d.startsWith('skip') || d === '#to-sort';
    console.log([
      '',
      `Dry run: ${dryRows.length} files`,
      `  to existing unit posts: ${count((r) => !special(r.dest))}`,
      `  to new unit posts:      ${count((r) => r.dest.startsWith('NEW'))} (${created.size} new posts)`,
      `  to book shelves:        ${count((r) => r.dest.startsWith('📚'))}`,
      `  to #to-sort:            ${count((r) => r.dest === '#to-sort')}`,
      `  skipped, already on the server: ${count((r) => r.dest === 'skip: already on the server')}`,
      `  skipped, duplicates in your folders: ${count((r) => r.dest.startsWith('skip: duplicate'))}`,
      `  over ${maxBytes / 1024 / 1024} MB (will be split into parts): ${count((r) => r.big)}`,
      `Full list: ${file.pathname.replace(/^\//, '').replace(/\//g, '\\')}`,
    ].join('\n'));
    ctx.onDryRunDone?.();
  }

  const done = () => { if (ctx.dry) finishDryRun(); else summarise().catch((e) => console.error(e)); };

  // ── the internet or Google Drive dropped: pause the queue, wait for both, retry ──
  const offline = (e) => /fetch failed|getaddrinfo|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|socket hang up|other side closed/i
    .test(`${e?.code || ''} ${e?.message || ''} ${e?.cause?.code || ''} ${e?.cause?.message || ''}`);
  const driveGone = (path, e) => e?.code === 'ENOENT' && !existsSync(roots.find((r) => under(path, r)) || roots[0]);
  let down = 0; // when it dropped (0 = all fine)
  async function untilBack() {
    for (;;) {
      const net = await lookup('discord.com').then(() => true, () => false);
      if (net && existsSync(dirname(home))) return; // Drive is mounted again
      await sleep(30000);
    }
  }
  const tries = new Map();
  const queued = new Set();    // waiting in the queue
  const finished = new Set();  // uploaded, skipped, or failed for good this run
  const enqueue = (path) => {
    if (queued.has(path) || finished.has(path)) return; // a scan can offer a file that's still in the queue
    if (!ctx.dry && converts(path) && under(path, dumper.drop)) return; // photos and Office files in Drop become PDFs first (dropconvert.js)
    queued.add(path);
    pending++;
    queue = queue
      .then(async () => {
        if (down) {
          await untilBack();
          ctx.log(`🔌 The internet and Google Drive are back (down about ${Math.max(1, Math.round((Date.now() - down) / 60000))} min). Carrying on with the uploads.`);
          down = 0;
          if (!ctx.dry) scanNow(true).catch((e) => console.error('scan:', e.message)); // folders may have changed while Drive was away
        }
        const mark = await handle(path);
        finished.add(path);
        if (index[path]) { index[path].handled = true; saveSoon(); }
        settleDrop(path, mark.problem);
      })
      .catch((e) => {
        const n = (tries.get(path) || 0) + 1;
        tries.set(path, n);
        if ((offline(e) || driveGone(path, e)) && n <= 5) {
          if (!down) { down = Date.now(); console.error(`internet or Google Drive dropped (${e.message}): uploads paused until both are back`); }
          queued.delete(path);
          enqueue(path); // again, once they're back
          return;
        }
        if (under(path, dumper.drop) && n < 5) { console.error(`upload failed (try ${n} of 5, again next scan): ${path}: ${e.message}`); return; }
        finished.add(path);
        report.failed.push(`${path}: ${e.message}`);
        console.error(`upload failed: ${path}:`, e);
        settleDrop(path, e.message);
      })
      .then(() => sleep(ctx.dry ? 0 : 1200)) // stay well under Discord's upload rate limits
      .finally(() => { queued.delete(path); if (--pending === 0 && ready) done(); });
  };

  // ── scanning: Drop every minute, everything every 10 minutes and straight after the laptop wakes ──
  const INDEX_FILE = fileURLToPath(new URL('../../data/scan-index.json', import.meta.url));
  const saved = ctx.dry ? null : loadIndex(INDEX_FILE);
  const index = saved || {};
  let seed = !saved; // first run with the scanner: what's already there counts as settled
  let saveTimer;
  const saveSoon = () => { if (ctx.dry) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { saveIndex(INDEX_FILE, index); } catch (e) { console.error(`scan index: ${e.message}`); } }, 2000); };

  if (ctx.dry) { // every file once, wherever it stands
    const { files } = await scan(roots, skip);
    for (const p of files.keys()) enqueue(p);
    ready = true;
    if (pending === 0) done();
    return;
  }

  let scanning = false;
  let missingSince = missing.length ? Date.now() : 0;
  async function scanNow(full) {
    if (scanning) return;
    scanning = true;
    try {
      if (full) {
        dumper = dumperFolders(home);
        const next = await findRoots();
        for (const r of next) if (!roots.some((o) => o.toLowerCase() === r.toLowerCase())) ctx.log(`📂 Now also watching ${basename(r)}.`);
        for (const r of roots) if (!next.some((o) => o.toLowerCase() === r.toLowerCase())) console.log(`No longer watching ${r} (shortcut removed).`);
        roots = next;
      }
      if (!ctx.dry) await convertDrop(dumper, ctx.log).catch((e) => console.error('drop convert:', e.message));
      const targets = full ? roots : [dumper.drop];
      const started = Date.now();
      const result = await scan(targets, skip);
      const fresh = update(index, result, targets, Date.now(), { seed: full && seed });
      if (full) {
        seed = false;
        const secs = Math.round((Date.now() - started) / 1000);
        console.log(`scan: ${result.files.size} files in ${targets.length} folders, ${secs}s${fresh.length ? `, ${fresh.length} to check` : ''}`);
        if (secs > 120) ctx.log(`🐢 A full scan of the upload folders took ${secs}s. Too many files in WATCH_DIRS or Sources?`);
        if (!result.missing.length) missingSince = 0;
        else if (missingSince && Date.now() - missingSince > 30 * 60e3) {
          ctx.log(`⚠️ These folders still don't exist after 30 minutes: ${result.missing.join(', ')}. Is Google Drive running?`);
          missingSince = 0;
        }
      }
      saveSoon();
      for (const p of fresh) enqueue(p);
    } finally {
      scanning = false;
    }
  }

  await scanNow(true);
  ready = true;
  if (pending === 0) done();
  const rescan = (full) => () => { if (!down) scanNow(full).catch((e) => console.error('scan:', e.message)); };
  setInterval(rescan(false), 60e3);
  setInterval(() => { if (!down) collectFromCrux(dumper, ctx.log).catch((e) => console.error('from Crux:', e.message)); }, 2 * 60e3);
  setInterval(rescan(true), 10 * 60e3);
  let tick = Date.now(); // a long gap between ticks means the laptop slept
  setInterval(() => { const gap = Date.now() - tick; tick = Date.now(); if (gap > 90e3) rescan(true)(); }, 15e3);
}
