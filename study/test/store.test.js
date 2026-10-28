import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { useStore } from './helpers.js';

const dir = useStore('legacy-study.json');
const { data, save } = await import('../server/store.js');

test('a legacy store loads with every list and setting defaulted', () => {
  for (const list of ['subtopics', 'attempts', 'hints', 'sessions', 'mocks']) assert.ok(Array.isArray(data[list]), list);
  assert.equal(data.settings.aiProvider, 'gemini');
  assert.equal(data.settings.tour.done, true);
});

test('retired flashcards are kept untouched', () => {
  assert.equal(data.cards.length, 500);
  assert.equal(data.reviews.length, 2);
  save();
});

test('the first start of a newer build backs the old file up', () => {
  const files = readdirSync(join(dir, 'backups'));
  assert.equal(files.length, 1);
  assert.match(files[0], /^pre-v\d+-\d{4}-\d{2}-\d{2}\.json$/);
  assert.ok(existsSync(join(dir, 'study.json')));
});
