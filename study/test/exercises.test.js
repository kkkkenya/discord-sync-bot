// Course notes with "Exercise 2.1" / "Assignment 6. 11" headings give one question per task (predict.js exerciseBlocks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseBlocks } from '../server/predict.js';

const NOTES = 'Intro text. Assignment 1. 1 : Fundamentals Use nested for loops to print a triangle of stars of height five. '
  + 'More notes. Exercise 2.1: Using Recursion Write a Python program that finds the factorial of a number recursively. '
  + 'Exercise 6 . 3 : Laboratory test records Create a DataFrame containing specimen IDs and loads, then print it.';

test('each Exercise or Assignment heading starts a question, labelled without stray spaces', () => {
  const q = exerciseBlocks(NOTES);
  assert.deepEqual(q.map((x) => x.label), ['Assignment 1.1', 'Exercise 2.1', 'Exercise 6.3']);
  assert.match(q[1].text, /^Exercise 2\.1: Using Recursion/);
  assert.ok(!q[0].text.includes('Exercise 2.1'));
});

test('notes with fewer than three headings are left to the usual parser', () => {
  assert.deepEqual(exerciseBlocks('Exercise 1.1: do this. Exercise 1.2: and this.'), []);
});
