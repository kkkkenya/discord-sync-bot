// Watches the folders in WATCH_DIRS (a PC folder and the Google Drive for Desktop folder). Every file that appears,
// including everything already there on first start, is sorted and uploaded once:
//   unit code found -> that unit's post (created if missing), forwarded to its other-year post too
//   book, no code   -> the best topic shelf
//   anything else   -> #to-sort with the Sort buttons (Vercel / dashboard)
// Files stay where they are; the sha256 of each one is kept in Supabase so nothing is uploaded twice.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import chokidar from 'chokidar';
import { CHANNELS } from '../../../lib/config.js';
import { db } from '../../../lib/db.js';
import { sleep } from '../../../lib/discord.js';
import { forwardTo } from '../../../lib/sorting.js';
import { classify } from './classify.js';

const SKIP_EXT = new Set(['.tmp', '.crdownload', '.part', '.partial', '.ini', '.lnk', '.db', '.ds_store',
  '.gdoc', '.gsheet', '.gslides', '.gform', '.gdraw', '.gmap', '.gsite', '.gjam']); // .g* are Drive shortcuts, not files
const ICON = { paper: '📝', notes: '📒', slides: '📊', book: '📚', other: '📄' };
const LABEL = { paper: 'Past paper', notes: 'Notes', slides: 'Slides', book: 'Book', other: 'File' };
const LIMIT_BY_TIER = [10, 10, 50, 100]; // MB a bot can upload, by server boost level

const skip = (p) => {
  const name = basename(p);
  return name.startsWith('~$') || name.startsWith('.') || SKIP_EXT.has(extname(name).toLowerCase())
    || p.split(sep).some((part) => part === 'node_modules' || part === '.git' || part === '$RECYCLE.BIN');
};

function sha256(path) {
  return new Promise((ok, fail) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail);
  });
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const quote = (s) => s.replace(/"/g, "'").replace(/\s+/g, ' ').slice(0, 200);

export function startUploader(ctx) {
  const roots = (process.env.WATCH_DIRS || '').split(';').map((d) => d.trim()).filter(Boolean).map((d) => resolve(d));
  if (!roots.length) { ctx.log('⚠️ No WATCH_DIRS set in pc/.env, so the uploader is off.'); return; }

  const maxBytes = LIMIT_BY_TIER[ctx.guild.premiumTier] * 1024 * 1024;
  const seen = new Set();
  const report = { unit: 0, shelf: 0, toSort: 0, tooBig: [], failed: [], created: [] };
  let queue = Promise.resolve();
  let pending = 0;

  async function handle(path) {
    const root = roots.find((r) => path.toLowerCase().startsWith((r + sep).toLowerCase())) || roots[0]; // Windows paths ignore case
    const { size, isFile } = await stat(path).then((s) => ({ size: s.size, isFile: s.isFile() }));
    if (!isFile || !size) return;
    const hash = await sha256(path);
    if (seen.has(hash)) return;
    seen.add(hash);
    if (!ctx.dry && (await db.select('files', `hash=eq.${hash}&select=id`)).length) return;

    const info = await classify(path, root, size, ctx.index);
    let posts = info.code ? ctx.index.pick(info.code, info.hints) : [];
    const willCreate = info.code && !posts.length ? ctx.index.forumFor(info.code, info.hints) : null;

    if (ctx.dry) {
      const dest = posts.length ? posts.map((p) => `${p.forum} › ${p.name}`).join(' + ')
        : willCreate ? `NEW post ${info.code} in ${willCreate.name}`
          : info.shelf ? `shelf: ${info.shelf.name}` : '#to-sort';
      console.log(`[dry] ${info.rel}\n      ${info.kind}${info.code ? ` · ${info.code} (from ${info.from})` : ''} · ${mb(size)} → ${size > maxBytes ? 'TOO BIG for Discord' : dest}`);
      return;
    }
    if (size > maxBytes) { report.tooBig.push(`${info.rel} (${mb(size)})`); return; }

    const label = `${ICON[info.kind]} **${info.name}** · ${LABEL[info.kind]}`;
    const file = { attachment: path, name: info.name };
    const record = (msg, extra) => db.insert('files', [{
      hash, name: info.name, kind: info.kind, unit_code: info.code, channel_id: msg.channelId, message_id: msg.id,
      size, source_path: info.rel, ...extra,
    }], { ignoreDuplicates: true });

    if (info.code && !posts.length && willCreate) {
      posts = await ctx.index.createPost(info.code, info.hints).catch((e) => { report.failed.push(`${info.rel}: couldn't create a post (${e.message})`); return []; });
      if (posts.length) report.created.push(`${info.code} in ${posts[0].forum}`);
    }
    if (posts.length) {
      const msg = await posts[0].thread.send({ content: label, files: [file], allowedMentions: { parse: [] } });
      for (const other of posts.slice(1)) await forwardTo(other.id, msg.id, msg.channelId).catch(() => {});
      await record(msg, { dest_name: posts[0].name, forum: posts[0].forum });
      report.unit++;
      return;
    }
    if (info.shelf) {
      const shelf = await ctx.client.channels.fetch(info.shelf.id);
      const msg = await shelf.send({ content: `${label}${info.title ? `\n_${info.title.slice(0, 150)}_` : ''}`, files: [file], allowedMentions: { parse: [] } });
      await record(msg, { dest_name: info.shelf.name });
      report.shelf++;
      return;
    }

    // couldn't place it: #to-sort, in the format the Sort buttons and the dashboard read
    const toSort = await ctx.client.channels.fetch(CHANNELS.toSort);
    const fileMsg = await toSort.send({ files: [file], allowedMentions: { parse: [] } });
    const reason = info.code ? `${info.code} has no forum to put a new post in`
      : info.kind === 'book' ? 'a book that matches no shelf' : 'no unit code in the name, folders or page 1';
    const suggestion = [info.hints.dept && `${info.hints.dept}`, info.hints.year && `year ${info.hints.year}`, info.hints.sem && `sem ${info.hints.sem}`].filter(Boolean).join(', ');
    await toSort.send({
      content: [
        `⚠️ **Couldn't place this file**: ${reason}`,
        info.code ? `💡 Suggestion: ${info.code}` : '',
        info.snippet ? `Page 1 starts: "${quote(info.snippet)}"` : '',
        `📁 From: \`${info.rel.slice(0, 300)}\`${suggestion ? ` (${suggestion})` : ''}`,
      ].filter(Boolean).join('\n'),
      components: [{ type: 1, components: [
        { type: 2, style: 1, label: 'Sort into a unit', custom_id: `sort:start:${fileMsg.id}` },
        { type: 2, style: 2, label: 'Not a unit: #pdf-library', custom_id: `sort:library:${fileMsg.id}` },
      ] }],
      allowedMentions: { parse: [] },
    });
    await record(fileMsg, { dest_name: 'to-sort' });
    report.toSort++;
  }

  function summarise() {
    const placed = report.unit + report.shelf + report.toSort;
    if (!placed && !report.tooBig.length && !report.failed.length) return;
    const lines = [`📥 **Uploaded ${placed} file${placed === 1 ? '' : 's'}**: ${report.unit} to unit posts, ${report.shelf} to shelves, ${report.toSort} to <#${CHANNELS.toSort}>.`];
    if (report.created.length) lines.push(`🆕 New unit posts: ${report.created.join(', ')}`);
    if (report.tooBig.length) lines.push(`🐘 Too big for Discord (limit ${LIMIT_BY_TIER[ctx.guild.premiumTier]} MB, boost the server to raise it):`, ...report.tooBig.slice(0, 15).map((f) => `• ${f}`));
    if (report.failed.length) lines.push('❌ Failed:', ...report.failed.slice(0, 10).map((f) => `• ${f}`));
    ctx.log(lines.join('\n'));
    Object.assign(report, { unit: 0, shelf: 0, toSort: 0, tooBig: [], failed: [], created: [] });
  }

  const enqueue = (path) => {
    if (skip(path)) return;
    pending++;
    queue = queue.then(() => handle(path))
      .catch((e) => { report.failed.push(`${path}: ${e.message}`); if (ctx.dry) console.error(`[dry] ${path}: ${e.message}`); })
      .then(() => sleep(ctx.dry ? 0 : 1200)) // stay well under Discord's upload rate limits
      .finally(() => { if (--pending === 0 && !ctx.dry) summarise(); });
  };

  chokidar.watch(roots, {
    ignored: (p) => skip(p),
    awaitWriteFinish: { stabilityThreshold: 5000, pollInterval: 500 }, // wait until a copy or Drive sync finishes
    ignorePermissionErrors: true,
  }).on('add', enqueue).on('error', (e) => ctx.log(`⚠️ Watcher: ${e.message}`))
    .on('ready', () => console.log(`Watching ${roots.join(' and ')}`));
}
