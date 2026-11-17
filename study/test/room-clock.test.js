// The hosted room clock (web/src/room-clock.js, fixplan-f 2.2 and 2.9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { actions, cleanPlan, idle, next, phaseAt, settle } from '../web/src/room-clock.js';

const M = 60e3;
const T0 = Date.parse('2026-11-17T17:00:00Z');
const started = (plan = {}) => actions.start(idle(plan), T0);

test('an idle room shows a full focus block and does not count down', () => {
  const c = idle({});
  assert.deepEqual(phaseAt(c, T0 + 99 * M), { state: 'idle', mode: 'focus', left: 25 * M, total: 25 * M, round: 1, rounds: 0 });
});

test('the cycle: focus, short break, and a long break after every fourth focus block', () => {
  const c = started();
  assert.equal(phaseAt(c, T0 + 24 * M).mode, 'focus');
  assert.equal(phaseAt(c, T0 + 25 * M).mode, 'short');
  assert.equal(phaseAt(c, T0 + 30 * M).round, 2);
  const fourth = T0 + 3 * 30 * M; // round 4 starts at 90 min
  assert.equal(phaseAt(c, fourth + 25 * M).mode, 'long');
  assert.equal(phaseAt(c, fourth + 25 * M + 15 * M).round, 5);
  assert.equal(phaseAt(c, fourth + 25 * M + 15 * M).mode, 'focus');
});

test('a phone asleep through three phases lands on the right one', () => {
  const p = phaseAt(started(), T0 + 75 * M + 30e3); // focus 0-25, short 25-30, focus 30-55, short 55-60, focus 60-85
  assert.equal(p.mode, 'focus');
  assert.equal(p.round, 3);
  assert.equal(p.left, 10 * M - 30e3);
});

test('never a long break, and no short break at all', () => {
  assert.deepEqual(next(cleanPlan({ longEvery: 0 }), 'focus', 4), { phase: 'short', round: 4 });
  const c = started({ short: 0, longEvery: 0 });
  assert.deepEqual([phaseAt(c, T0 + 26 * M).mode, phaseAt(c, T0 + 26 * M).round], ['focus', 2]);
});

test('rounds: the room is done after the last focus block', () => {
  const c = started({ rounds: 2 });
  assert.equal(phaseAt(c, T0 + 54 * M).state, 'running');
  assert.equal(phaseAt(c, T0 + 55 * M).state, 'done');
});

test('pause keeps the time left; resume carries on from it', () => {
  const p = actions.pause(started(), T0 + 10 * M);
  assert.equal(p.state, 'paused');
  assert.equal(phaseAt(p, T0 + 60 * M).left, 15 * M); // an hour later, still 15 min left
  const r = actions.resume(p, T0 + 60 * M);
  assert.equal(phaseAt(r, T0 + 70 * M).left, 5 * M);
});

test('skip while running, while paused, and from a break', () => {
  const s = actions.skip(started(), T0 + 5 * M);
  assert.equal(s.phase, 'short');
  assert.equal(phaseAt(s, T0 + 5 * M).left, 5 * M);
  const back = actions.skip(s, T0 + 6 * M);
  assert.deepEqual([back.phase, back.round], ['focus', 2]);
  const paused = actions.skip(actions.pause(started(), T0 + M), T0 + 2 * M);
  assert.deepEqual([paused.state, paused.phase, paused.leftMs], ['paused', 'short', 5 * M]);
});

test('wait for the host: the clock stops at the end of a phase until the host starts the next one', () => {
  const c = started({ wait: true });
  const w = phaseAt(c, T0 + 40 * M);
  assert.deepEqual([w.state, w.mode, w.left], ['waiting', 'short', 5 * M]);
  const go = actions.start(settle(c, T0 + 40 * M), T0 + 40 * M);
  assert.equal(phaseAt(go, T0 + 44 * M).left, M);
  assert.equal(phaseAt(go, T0 + 45 * M).state, 'waiting');
});

test('a settings change keeps the current phase end time and applies from the next phase', () => {
  const c = actions.settings(started(), T0 + 20 * M, { focus: 50, short: 10 });
  assert.equal(phaseAt(c, T0 + 20 * M).left, 5 * M); // still ends at 25 min
  assert.equal(phaseAt(c, T0 + 25 * M).mode, 'short');
  assert.equal(phaseAt(c, T0 + 34 * M).mode, 'short'); // the break is now 10 min
  assert.equal(phaseAt(c, T0 + 35 * M).total, 50 * M);
  const p = actions.settings(actions.pause(started(), T0 + M), T0 + 2 * M, { focus: 10 });
  assert.equal(p.leftMs, 10 * M); // 24 min left, cut to the new 10
});

test('a phone clock 7 minutes wrong shows the same as the server once it uses the offset', () => {
  const c = started();
  const server = T0 + 12 * M, phone = server - 7 * M;
  const offset = server - phone;
  assert.deepEqual(phaseAt(c, phone + offset), phaseAt(c, server));
});

test('end, and plans from any input stay inside the limits', () => {
  assert.equal(phaseAt(actions.end(started(), T0 + M), T0 + 2 * M).state, 'ended');
  assert.deepEqual(cleanPlan({ focus: 3, short: 99, long: -1, longEvery: 1, rounds: 50, wait: 'yes' }), { focus: 10, short: 30, long: 0, longEvery: 2, rounds: 12, wait: false });
  assert.equal(cleanPlan({ focus: 47 }).focus, 45);
});

test('a running break set to 0 ends now and focus starts', () => {
  const c = actions.skip(started(), T0 + 5 * M); // in the short break
  const z = actions.settings(c, T0 + 6 * M, { short: 0 });
  assert.deepEqual([phaseAt(z, T0 + 6 * M).mode, phaseAt(z, T0 + 6 * M).round], ['focus', 2]);
});
