import test from 'node:test';
import assert from 'node:assert/strict';
import { Collapser, nextDelay, redact } from '../supervise.js';

test('fast deaths back off 10 s, 30 s, 2 min, 5 min, then stay at 5 min', () => {
  let attempt = 0;
  const waits = [];
  for (let i = 0; i < 6; i++) ({ wait: waits[i], attempt } = nextDelay(attempt, 5e3));
  assert.deepEqual(waits, [10, 30, 120, 300, 300, 300]);
});

test('a bot that stayed up restarts after 10 s and the backoff starts over', () => {
  assert.deepEqual(nextDelay(3, 11 * 60e3), { wait: 10, attempt: 0 });
  assert.deepEqual(nextDelay(3, 5 * 60e3), { wait: 10, attempt: 0 });
});

test('identical lines within 60 s collapse into one count', () => {
  const out = [];
  const c = new Collapser((text) => out.push(text));
  c.line('watcher: UNKNOWN', 0);
  c.line('watcher: UNKNOWN', 1000);
  c.line('watcher: UNKNOWN', 2000);
  c.line('uploaded a.pdf', 3000);
  c.line('uploaded a.pdf', 70000); // outside the window: written again
  assert.deepEqual(out, ['watcher: UNKNOWN', '… repeated 2 times', 'uploaded a.pdf', 'uploaded a.pdf']);
});

test('a pending count is written once the window passes', () => {
  const out = [];
  const c = new Collapser((text) => out.push(text));
  c.line('x', 0); c.line('x', 10);
  c.flush(30e3); assert.deepEqual(out, ['x']);
  c.flush(61e3); assert.deepEqual(out, ['x', '… repeated 1 times']);
});

test('keys are redacted from alerts', () => {
  const s = redact('Bot abcdefghijklmnopqrstuvwx.ABCDEF.abcdefghijklmnopqrstuvwxyz0 key AIzaSyA1234567890abcdef and sk-abcdefghij1234567890');
  assert.doesNotMatch(s, /abcdefghijklmnop|AIzaSy|sk-abc/);
});
