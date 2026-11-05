import test from 'node:test';
import assert from 'node:assert/strict';
import { CRUX_FACTS, revealLine, tipFor, tipPost, TIPS } from '../src/crux.js';

test('a Crux tip on Mondays and Thursdays only', () => {
  assert.ok(tipFor('2026-11-09')); // Monday
  assert.ok(tipFor('2026-11-12')); // Thursday
  for (const day of ['2026-11-10', '2026-11-11', '2026-11-13', '2026-11-14', '2026-11-15']) assert.equal(tipFor(day), null, day);
});

test('the tips rotate: two in a week differ, and every tip comes up', () => {
  assert.notEqual(tipFor('2026-11-09').title, tipFor('2026-11-12').title);
  const seen = new Set();
  for (let d = Date.parse('2026-11-02T12:00:00+03:00'); seen.size < TIPS.length && d < Date.parse('2027-06-01'); d += 864e5) {
    const t = tipFor(new Date(d).toISOString().slice(0, 10));
    if (t) seen.add(t.title);
  }
  assert.equal(seen.size, TIPS.length);
});

test('posts carry the link without a preview card, and the reveal line names the unit', () => {
  assert.match(tipPost(TIPS[0]), /<https:\/\/crux\.engineeringhub\.site>/);
  assert.equal(revealLine('EMM 302'), '📚 More EMM 302 questions, sorted by topic, in Crux: <https://crux.engineeringhub.site>');
  assert.equal(revealLine(undefined), '');
});

test('the persona keeps Crux mentions to one line, after a real answer', () => {
  assert.match(CRUX_FACTS, /answer them properly first/);
  assert.match(CRUX_FACTS, /At most once in a conversation/);
  assert.match(CRUX_FACTS, /KES 50 a semester/);
});
