import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { makeGateway, studyCommand } from '../../lib/study-gateway.js';
import { fakeDb, startServer } from './helpers.js';

// A friend's Study Desk end to end: the real gateway code on a local port (fake database, Discord and AI), and a real
// Study Desk in friend mode pointed at it, with no Study Hub keys of its own.
const sha = (s) => createHash('sha256').update(String(s).trim().toUpperCase()).digest('hex');
const db = fakeDb();
const edits = [];
const aiCalls = [];
const handle = makeGateway({
  db, appId: 'APP',
  discord: async (method, path, body) => { edits.push([method, path, body]); return { attachments: [{ url: 'https://cdn/x.pdf', filename: 'x.pdf' }] }; },
  dm: async () => true,
  ai: async (body) => { aiCalls.push(body); return { result: { topics: [{ name: 'Simple torsion', from: 'outline' }] }, tokens: 50 }; },
});
let hubServer;
let srv;
before(async () => {
  await db.insert('study_friends', [{ name: 'Amos', token_hash: sha('tok-amos'), discord_id: 'u-amos' }]);
  await db.insert('files', [{ id: 'hubfile1', name: 'EMM 302 CAT 1 2024.pdf', kind: 'paper', unit_code: 'EMM 302', channel_id: 'c1', message_id: 'm1' }]);
  hubServer = createServer(async (req, res) => {
    const body = JSON.parse(Buffer.concat(await req.toArray()).toString() || '{}');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
    try { res.end(JSON.stringify(await handle(body.action, body, token))); } catch (e) { res.writeHead(e.status || 500).end(JSON.stringify({ error: e.message })); }
  }).listen(0);
  srv = await startServer('legacy-study.json', { STUDY_HUB_TOKEN: 'tok-amos', STUDY_HUB_URL: `http://127.0.0.1:${hubServer.address().port}`, AI_PROVIDER: 'hub' });
});
after(() => { srv?.stop(); hubServer?.close(); });

test('a friend\'s Study Desk knows it is linked, and who to', async () => {
  const s = (await srv.call('GET', 'state')).body;
  assert.equal(s.friend, true);
  assert.equal((await srv.call('GET', 'hub')).body.name, 'Amos');
});

test('the Study Hub AI works through the gateway, with no AI key on the laptop', async () => {
  await srv.call('POST', 'settings', { aiProvider: 'hub' });
  const s = (await srv.call('GET', 'state')).body;
  assert.equal(s.ai, true);
  assert.deepEqual(s.media, { image: true, audio: true });
  const r = await srv.call('POST', 'topics/suggest', { unit: 'EMM 302' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.suggestions.map((x) => x.name), ['Simple torsion']);
  assert.equal(aiCalls.length, 1);
});

test('the Study Hub\'s files come through the gateway', async () => {
  const lib = (await srv.call('GET', 'library?unit=EMM%20302')).body;
  assert.ok(lib.files.some((f) => f.name === 'EMM 302 CAT 1 2024.pdf' && f.paper), JSON.stringify(lib));
});

test('a /study command in Discord is picked up and answered by the running Study Desk', async () => {
  const queued = await studyCommand({ db, premiumRole: 'P' }, { token: 'itok-today' }, { id: 'u-amos' }, 'today', {});
  assert.equal(queued.type, 5, 'Study Desk is running (it has been asking), so Discord shows "thinking…"');
  for (let i = 0; i < 40 && !edits.some((e) => e[1].includes('itok-today')); i++) await new Promise((r) => setTimeout(r, 250));
  const edit = edits.find((e) => e[1].includes('itok-today'));
  assert.ok(edit, 'the answer came back');
  assert.match(edit[2].content, /Today|units|plan|Stages/i);
});
