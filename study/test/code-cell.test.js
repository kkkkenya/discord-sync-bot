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
