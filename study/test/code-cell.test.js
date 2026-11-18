// Code cells (fixplan-f F9): running Python with real MicroPython (web/src/py-run.js) and checking output
// (web/src/code-check.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript/micropython.mjs';
import { OUTPUT_CAP, heavyImport, readError, runPython } from '../web/src/py-run.js';
import { compareOutputs, describe, sampleFrom } from '../web/src/code-check.js';

const run = (code, input) => runPython(loadMicroPython, code, input);

test('runs Python with input() fed from the Input box, echoed like a terminal', async () => {
  const r = await run("a = int(input('a? '))\nb = int(input('b? '))\nprint('sum', a + b)", '3\n4\n');
  assert.equal(r.error, null);
  assert.equal(r.out, 'a? 3\nb? 4\nsum 7\n');
});

test('errors give the line in the student\'s own code, not counting the input() setup', async () => {
  const r = await run('x = 1\ny = 2\nprint(x / 0)');
  assert.deepEqual(r.error, { line: 3, type: 'ZeroDivisionError', message: 'divide by zero' });
  const s = await run('print("a"\n');
  assert.equal(s.error.type, 'SyntaxError');
  const e = await run('n = int(input())\nm = int(input())');
  assert.equal(e.error.type, 'EOFError');
  assert.match(e.error.message, /Add another line in Input/);
});

test('each run starts clean, output is capped, and heavy libraries are refused politely', async () => {
  await run('secret = 5');
  assert.equal((await run('print(secret)')).error.type, 'NameError');
  const big = await run('for i in range(20000): print("line", i)');
  assert.equal(big.truncated, true);
  assert.ok(big.out.length <= OUTPUT_CAP);
  assert.equal((await run('import numpy as np\nprint(np.zeros(3))')).blocked, 'numpy');
  assert.equal(heavyImport('from matplotlib import pyplot'), 'matplotlib');
  assert.equal(heavyImport('import math\nprint(math.pi)'), null);
  assert.equal((await run('import math\nprint(round(math.pi, 2))')).out, '3.14\n');
});

test('reading a traceback', () => {
  assert.deepEqual(readError('Traceback (most recent call last):\n  File "<stdin>", line 7, in <module>\nNameError: name \'q\' isn\'t defined\n'), { line: 7, type: 'NameError', message: "name 'q' isn't defined" });
});

test('comparing output: line ends, blank lines at the end, and numbers to about 6 figures', () => {
  assert.equal(compareOutputs('12.5  \n3\n\n', '12.50\n3').same, true);
  assert.equal(compareOutputs('area = 3.1415927', 'area = 3.14159265').same, true);
  assert.deepEqual(compareOutputs('1\n2\n4', '1\n2\n3'), { same: false, line: 3, got: '4', expected: '3' });
  assert.equal(describe(compareOutputs('1', '1\n2'), 'the model answer'), 'Line 2 is missing: the model answer prints "2".');
  assert.equal(describe(compareOutputs('1\n2', '1'), 'the model answer'), 'Line 2 is extra: you print "2", the model answer stops before it.');
  assert.equal(describe(compareOutputs('Hello', 'hello'), "the question's sample"), 'Line 1 differs: you print "Hello", the question\'s sample prints "hello".');
});

test('sample input and output in a question', () => {
  const q = 'Write a program that reads two numbers and prints their sum.\nSample input:\n3\n4\nSample output:\n7\n\n(5 marks)';
  assert.deepEqual(sampleFrom(q), { input: '3\n4', output: '7' });
  assert.deepEqual(sampleFrom('Print the first three squares.\nExample output:\n1\n4\n9'), { input: '', output: '1\n4\n9' });
  assert.equal(sampleFrom('Explain what a loop is. (4 marks)'), null);
});

test('review fixes: indentation counts, small numbers compare relatively, prose that starts with Output is not a sample', () => {
  assert.equal(compareOutputs('   *\n  ***', '*\n***').same, false);
  assert.equal(compareOutputs('9e-7', '2e-7').same, false);
  assert.equal(compareOutputs('0.30000000000000004', '0.3').same, true);
  assert.equal(sampleFrom('Write a program.\nOutput the largest of the three numbers.\n(5 marks)'), null);
  assert.deepEqual(sampleFrom('Read n and print n squared.\nInput:\n4\nOutput:\n16'), { input: '4', output: '16' });
});

// SQL and JavaScript (fixplan-g G6), with the real engines
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { runSql, sameResult, tablesFrom, ordered } from '../web/src/sql-run.js';
import { runJs } from '../web/src/js-run.js';
import { languageOf } from '../web/src/code-check.js';
const SQL = await initSqlJs({ locateFile: (f) => createRequire(import.meta.url).resolve(`sql.js/dist/${f}`) });

test('SQL runs on a fresh copy of the question\'s tables; results compare by rows, in order only with ORDER BY', () => {
  const q = 'Given:\nCREATE TABLE students (id INTEGER, name TEXT, marks INTEGER);\nINSERT INTO students VALUES (1, \'Amina\', 72), (2, \'Brian\', 45), (3, \'Wanjiru\', 88);\nList the students who passed (marks >= 50).';
  const setup = tablesFrom(q);
  assert.match(setup, /^CREATE TABLE students/);
  const mine = runSql(SQL, "SELECT name FROM students WHERE marks >= 50;", setup);
  assert.deepEqual(mine.results[0].rows, [['Amina'], ['Wanjiru']]);
  const theirs = runSql(SQL, "SELECT name AS who FROM students WHERE marks > 49 ORDER BY name DESC;", setup);
  assert.equal(sameResult(mine.results[0], theirs.results[0], false).same, true, 'aliases and order do not matter without ORDER BY');
  assert.equal(sameResult(mine.results[0], theirs.results[0], ordered('... ORDER BY name DESC')).same, false);
  assert.match(sameResult(runSql(SQL, 'SELECT name FROM students;', setup).results[0], theirs.results[0], false).why, /3 rows/);
  const del = runSql(SQL, 'DELETE FROM students WHERE marks < 50;', setup);
  assert.equal(del.changes, 1);
  assert.equal(runSql(SQL, 'SELECT COUNT(*) FROM students;', setup).results[0].rows[0][0], 3, 'each run starts from the question again');
  assert.equal(runSql(SQL, 'SELEC name FROM students;', setup).error.type, 'SQL error');
});

test('JavaScript runs with input() and console.log, errors with their line', () => {
  assert.equal(runJs('const n = Number(input());\nconsole.log(n * 2);', '21').out, '21\n42\n'); // input() echoes the line, like a terminal
  assert.deepEqual(runJs('let a = 1;\nlet b = c + 1;').error, { line: 2, type: 'ReferenceError', message: 'c is not defined' });
  assert.equal(runJs('typeof self === "undefined" ? console.log("no worker scope") : console.log(typeof fetch)').error, null);
});

test('the cell picks the language from the question or the model answer', () => {
  assert.equal(languageOf('Write a query to SELECT the names of students from the table'), 'sql');
  assert.equal(languageOf('Using JavaScript, print the first 10 squares'), 'js');
  assert.equal(languageOf('Write a program that reads n'), 'python');
  assert.equal(languageOf('anything', 'sql'), 'sql');
});
