// Claude Code as the AI on the owner's own computer: only with CRUX_AI=claude-code, never on Vercel, and its JSON
// answer (structured_output) comes back as the result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

const { aiReady, claudeCodeCall, provider } = await import('../server/ai.js');
const { emptyDoc, withDoc } = await import('../server/store.js');

// a stand-in for spawn: records the arguments and stdin, then prints `reply`
const fakeSpawn = (reply, seen = {}) => (bin, args) => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  child.stdin = { end: (text) => { seen.stdin = text; setImmediate(() => { child.stdout.emit('data', reply); child.emit('close', 0); }); } };
  Object.assign(seen, { bin, args });
  return child;
};

test('Claude Code is the AI only when asked for, and never on Vercel', () => withDoc(emptyDoc(), () => {
  assert.notEqual(provider(), 'claude-code');
  process.env.CRUX_AI = 'claude-code';
  try {
    assert.equal(provider(), 'claude-code');
    assert.equal(aiReady(), true);
    process.env.VERCEL = '1';
    assert.notEqual(provider(), 'claude-code');
  } finally { delete process.env.CRUX_AI; delete process.env.VERCEL; }
}));

test('a Claude Code answer: the question on stdin, no tools, the structured output returned', async () => {
  const seen = {};
  const out = await claudeCodeCall({ type: 'object' }, 'tutor', 'Find the stress.', 2000, fakeSpawn(JSON.stringify({ is_error: false, structured_output: { answer: '31.8 MPa' } }), seen));
  assert.deepEqual(out, { answer: '31.8 MPa' });
  assert.equal(seen.stdin, 'Find the stress.');
  assert.equal(seen.args[seen.args.indexOf('--tools') + 1], '');
  assert.ok(seen.args.includes('--no-session-persistence'));
});

test('a Claude Code error or a non-JSON reply is a clear error', async () => {
  await assert.rejects(claudeCodeCall({}, 's', 'q', 100, fakeSpawn(JSON.stringify({ is_error: true, result: 'Usage limit reached' }))), /Claude Code: Usage limit reached/);
  await assert.rejects(claudeCodeCall({}, 's', 'q', 100, fakeSpawn('Please run claude login')), /Claude Code gave no answer: Please run claude login/);
});
