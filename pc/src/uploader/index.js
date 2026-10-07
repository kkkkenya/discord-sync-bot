// Watches the folders in WATCH_DIRS and follows the Drive shortcuts (.lnk) inside them, so a folder of shortcuts
// to shared course folders works. Every file that appears, including everything already there on first start,
// is sorted and uploaded once:
//   unit code found -> that unit's post (created if missing), forwarded to its other-year post too
//   book, no code   -> the best topic shelf
//   anything else   -> #to-sort with the Sort buttons, and reps and admins get a ping
// Files too big for Discord are compressed or split into parts (shrink.js). Files stay where they are;
// the sha256 of each one is kept in Supabase so nothing is uploaded twice.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import chokidar from 'chokidar';
import { CHANNELS, SORTER_ROLE_MATCH } from '../../../lib/config.js';
import { db } from '../../../lib/db.js';
import { sleep } from '../../../lib/discord.js';
import { forwardTo } from '../../../lib/sorting.js';
import { save, state } from '../state.js';
import { classify } from './classify.js';
import { fingerprint, onServer } from './existing.js';
import { mb, PIECES_HELP, shrink } from './shrink.js';

const SKIP_EXT = new Set(['.tmp', '.crdownload', '.part', '.partial', '.ini', '.lnk', '.db', '.ds_store',
  '.gdoc', '.gsheet', '.gslides', '.gform', '.gdraw', '.gmap', '.gsite', '.gjam']); // .g* are Drive links, not files
const ICON = { paper: '📝', notes: '📒', slides: '📊', book: '📚', other: '📄' };
const LABEL = { paper: 'Past paper', notes: 'Notes', slides: 'Slides', book: 'Book', other: 'File' };
const LIMIT_BY_TIER = [10, 10, 50, 100]; // MB a bot can upload, by server boost level
const NONE = { parse: [] };

// SKIP_FOLDERS in pc/.env: folder names (separated by ;) to leave out wherever they appear.
const skipFolders = () => new Set((process.env.SKIP_FOLDERS || '').split(';').map((s) => s.trim().toLowerCase()).filter(Boolean));
const skip = (p) => {
  const name = basename(p);
  const folders = skipFolders();
  return name.startsWith('~$') || name.startsWith('.') || SKIP_EXT.has(extname(name).toLowerCase())
    || p.split(sep).some((part) => part === 'node_modules' || part === '.git' || part === '$RECYCLE.BIN' || folders.has(part.toLowerCase()));
};
const under = (child, parent) => child.toLowerCase().startsWith(parent.toLowerCase() + sep); // Windows paths ignore case

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

async function findRoots(dirs) {
  const found = [...dirs];
  for (const d of dirs) {
    const links = (await readdir(d).catch(() => [])).filter((n) => n.toLowerCase().endsWith('.lnk')).map((n) => join(d, n));
    for (const t of await shortcutTargets(links)) if (isFolder(t)) found.push(resolve(t));
  }
  const unique = [...new Map(found.map((r) => [r.toLowerCase(), r])).values()].filter((r) => !skip(r)); // SKIP_FOLDERS
  return unique.filter((r) => !unique.some((o) => o !== r && under(r, o))); // a folder inside another is watched once
}

export async function startUploader(ctx) {
  const dirs = (process.env.WATCH_DIRS || '').split(';').map((d) => d.trim()).filter(Boolean).map((d) => resolve(d));
  if (!dirs.length) { ctx.log('⚠️ No WATCH_DIRS set in pc/.env, so the uploader is off.'); return; }
  // Right after Windows starts, Google Drive may not have mounted G: yet: missing folders are checked every
  // minute and picked up when they appear (a warning only if they're still missing after 30 minutes).
  let missing = dirs.filter((d) => !existsSync(d));
  if (missing.length) console.log(`Waiting for ${missing.join(', ')} (Google Drive may still be starting)`);
  const roots = await findRoots(dirs.filter((d) => existsSync(d)));
  console.log(`Watching ${roots.length} folder${roots.length === 1 ? '' : 's'}:\n${roots.map((r) => `  ${r}`).join('\n')}`);

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
    const recent = await target.messages.fetch({ limit: 20 }).catch(() => null);
    return recent?.find((m) => m.author.id === ctx.client.user.id && m.createdTimestamp >= since - 60000 && m.attachments.some((a) => a.size === bytes)) || null;
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

  async function handle(path) {
    const root = roots.find((r) => under(path, r)) || roots[0];
    const s = await stat(path);
    if (!s.isFile() || !s.size) return;
    const fp = fingerprint(s.size, basename(path));
    if (state.unplaceable?.[fp]) return; // couldn't be made small enough last time either

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

    const label = `${ICON[info.kind]} **${info.name}** · ${LABEL[info.kind]}`;
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
  const enqueue = (path) => {
    pending++;
    queue = queue.then(() => handle(path))
      .catch((e) => { report.failed.push(`${path}: ${e.message}`); console.error(`upload failed: ${path}:`, e); })
      .then(() => sleep(ctx.dry ? 0 : 1200)) // stay well under Discord's upload rate limits
      .finally(() => { if (--pending === 0 && ready) done(); });
  };

  const watcher = chokidar.watch(roots, {
    ignored: (p) => skip(p),
    awaitWriteFinish: { stabilityThreshold: 5000, pollInterval: 500 }, // wait until a copy or Drive sync finishes
    ignorePermissionErrors: true,
  });
  watcher.on('add', enqueue).on('error', (e) => ctx.log(`⚠️ Watcher: ${e.message}`))
    .on('ready', () => { ready = true; if (pending === 0) done(); });

  if (missing.length && !ctx.dry) {
    const since = Date.now();
    const timer = setInterval(async () => {
      const appeared = missing.filter((d) => existsSync(d));
      if (appeared.length) {
        missing = missing.filter((d) => !appeared.includes(d));
        const fresh = (await findRoots(appeared)).filter((r) => !roots.some((o) => o.toLowerCase() === r.toLowerCase() || under(r, o)));
        roots.push(...fresh);
        watcher.add(fresh);
        console.log(`Now watching ${fresh.length} more folder${fresh.length === 1 ? '' : 's'}: ${fresh.join(', ')}`);
      }
      if (!missing.length) clearInterval(timer);
      else if (Date.now() - since > 30 * 60 * 1000) {
        ctx.log(`⚠️ These WATCH_DIRS still don't exist after 30 minutes: ${missing.join(', ')}. Is Google Drive running?`);
        clearInterval(timer);
      }
    }, 60 * 1000);
  }

  // a shortcut added later to a WATCH_DIRS folder starts being watched too
  if (!ctx.dry) {
    chokidar.watch(dirs, { depth: 0, ignoreInitial: true }).on('add', async (p) => {
      if (!p.toLowerCase().endsWith('.lnk')) return;
      const [target] = await shortcutTargets([p]);
      if (target && isFolder(target) && !roots.some((r) => r.toLowerCase() === target.toLowerCase() || under(target, r))) {
        roots.push(resolve(target));
        watcher.add(target);
        ctx.log(`📂 Now also watching ${basename(target)} (new shortcut in ${basename(dirname(p))}).`);
      }
    });
  }
}
