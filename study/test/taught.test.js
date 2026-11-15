// Programming answers the way the course teaches them (server/taught.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callsIn, definedIn, importsIn, isProgramming, stripComments, taughtNames, untaught } from '../server/taught.js';

const NOTES = `stress = [ 120 , 135 ] print ( "Maximum stress:" , max ( stress )) import tkinter as tk
root = tk.Tk() Button(root, text="Go").pack() import matplotlib.pyplot as plt plt.plot(x, y) plt.show()
def calculate_stress(force, area): return force / area  for i in range(5): stress.append(i) len(stress)`;

test('a programming unit is found by its title', () => {
  assert.equal(isProgramming('Computer Programming II'), true);
  assert.equal(isProgramming('Strength of Materials'), false);
});

test('the notes give the taught calls, methods and modules', () => {
  const t = taughtNames([NOTES]);
  for (const n of ['print', 'max', 'Tk', 'Button', 'pack', 'plot', 'show', 'range', 'append', 'len', 'tkinter', 'tk', 'matplotlib', 'plt']) assert.ok(t.has(n), n);
  assert.ok(!t.has('if') && !t.has('for'));
});

test('calls, imports and definitions in an answer', () => {
  assert.deepEqual([...callsIn('x = sorted(a)\nif (x): print(x.upper())')].sort(), ['print', 'sorted', 'upper']);
  assert.deepEqual([...importsIn('import numpy as np\nfrom tkinter import messagebox, Button')].sort(), ['Button', 'messagebox', 'np', 'numpy', 'tkinter']);
  assert.deepEqual([...definedIn('def area(r):\n    return r\nclass Pump:\n    pass\ntotal = 0')].sort(), ['Pump', 'area', 'total']);
});

test('untaught: what the answer uses that the notes never show, not what it defines', () => {
  const taught = taughtNames([NOTES]);
  const answer = 'import numpy as np\ndef area(d):\n    return 3.14 * d * d / 4\nvalues = list(map(area, [1, 2]))\nprint(max(values), np.mean(values), area(2))';
  assert.deepEqual(untaught(answer, taught), ['list', 'map', 'mean', 'np', 'numpy']);
  assert.deepEqual(untaught('for i in range(3):\n    print(len(stress))', taught), []);
});

test('comments come out of Python code and are kept; strings with # stay', () => {
  const code = '# read the stresses\nstress = [120, 135]  # in MPa\nprint("Max # value:", max(stress))\n"""Shows the largest."""\nlabel = """not a comment"""';
  const out = stripComments(code, 'python');
  assert.equal(out.code, 'stress = [120, 135]\nprint("Max # value:", max(stress))\nlabel = """not a comment"""');
  assert.deepEqual(out.comments, ['read the stresses', 'in MPa', 'Shows the largest.']);
});

test('comments come out of C-style code', () => {
  const out = stripComments('int x = 5; // five\n/* block\n * note */\nConsole.WriteLine("a // b");', 'csharp');
  assert.equal(out.code, 'int x = 5;\nConsole.WriteLine("a // b");');
  assert.deepEqual(out.comments, ['five', 'block\nnote']);
});
