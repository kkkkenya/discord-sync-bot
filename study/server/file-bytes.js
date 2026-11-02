// Part of a hub file, for the in-app PDF viewer. Discord's file links can't be read by the app directly (no CORS, and
// they're marked as downloads), so the viewer asks for byte ranges here and this passes them on. Only Discord
// attachment links, and at most RANGE_MAX bytes a request, so a book is never fetched whole.
// GET /api/files/bytes?url=<a Discord attachment link>&from=<first byte>&to=<last byte> → 206 with the bytes and
// Content-Range (whose total is the file's size).
export const RANGE_MAX = 2 * 1024 * 1024;
const HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function checkLink(raw) {
  let u;
  try { u = new URL(raw); } catch { throw fail('That is not a file link.'); }
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname) || !u.pathname.startsWith('/attachments/')) throw fail('Only hub files can be opened here.');
  return u;
}

export async function fileBytes(query, fetcher = fetch) {
  const u = checkLink(query.get('url'));
  const from = Number(query.get('from'));
  const to = Number(query.get('to'));
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) throw fail('a byte range: from and to');
  const last = Math.min(to, from + RANGE_MAX - 1);
  const r = await fetcher(u, { headers: { Range: `bytes=${from}-${last}` } });
  if (r.status === 403 || r.status === 404) throw fail('The file link has expired. Open the file again.', 410);
  if (r.status !== 206 && r.status !== 200) throw fail(`Discord answered ${r.status}.`, 502);
  const bytes = new Uint8Array(await r.arrayBuffer());
  // a server that ignored the range sent the whole file: keep only the part asked for
  const part = r.status === 200 ? bytes.slice(from, last + 1) : bytes;
  const total = Number(r.headers.get('content-range')?.split('/')[1]) || (r.status === 200 ? bytes.length : NaN);
  return new Response(part, {
    status: 206,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${from}-${from + part.length - 1}/${Number.isFinite(total) ? total : '*'}`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
