// The PDF viewer's byte ranges: only Discord attachment links, a capped range, and the file's size passed on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANGE_MAX, fileBytes } from '../server/file-bytes.js';

const q = (o) => new URLSearchParams(o);
const LINK = 'https://cdn.discordapp.com/attachments/1/2/book.pdf?ex=abc';

test('only Discord attachment links are passed on', async () => {
  for (const url of ['https://evil.example/attachments/x.pdf', 'http://cdn.discordapp.com/attachments/x.pdf', 'https://cdn.discordapp.com/avatars/x.png', 'not a link']) {
    await assert.rejects(fileBytes(q({ url, from: 0, to: 10 }), async () => { throw new Error('fetched'); }), /hub files|not a file link/);
  }
});

test('a range is asked for, capped, and comes back with the file size', async () => {
  let asked;
  const fake = async (u, opts) => { asked = opts.headers.Range; return new Response(new Uint8Array(4), { status: 206, headers: { 'content-range': 'bytes 0-3/5000000' } }); };
  const r = await fileBytes(q({ url: LINK, from: 0, to: 99999999 }), fake);
  assert.equal(asked, `bytes=0-${RANGE_MAX - 1}`);
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), 'bytes 0-3/5000000');
});

test('an expired link says so', async () => {
  await assert.rejects(fileBytes(q({ url: LINK, from: 0, to: 9 }), async () => new Response('', { status: 404 })), /expired/);
});
