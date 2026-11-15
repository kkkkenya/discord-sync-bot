// Programming answers (practice.js explainCode): comments move out of the code, a call the notes never use gets one
// rewrite, and what is still untaught is named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from './helpers.js';

useStore('legacy-study.json');
const { data } = await import('../server/store.js');
const { explainCode, programmingUnit } = await import('../server/practice.js');

data.units.push({ code: 'EMM 308', title: 'Computer Programming II' });
data.paperq.push({ id: 'p308', unit: 'EMM 308', fileId: 'local-x', source: 'Notes', type: 'Tutorial', number: 1, text: 'Write a program that prints the largest stress in a list of five stresses.', subtopicIds: [] });
const files = { n1: { unit: 'EMM 308', text: 'stress = [120, 135] print("Maximum:", max(stress)) for i in range(5): stress.append(i)' } };
const notes = () => '';

test('a programming unit is known by its title', () => {
  assert.equal(programmingUnit('EMM 308'), true);
  assert.equal(programmingUnit('EMM 302'), false);
});

test('comments leave the code and join the explanation; an untaught call is rewritten once', async () => {
  const asked = [];
  const program = async (x) => {
    asked.push(x.avoid || []);
    return x.avoid?.length
      ? { language: 'python', code: '# the stresses\nstress = [120, 135, 128]\nprint("Maximum:", max(stress))', explanation: ['max gives the largest value.'], output: 'Maximum: 135' }
      : { language: 'python', code: 'import numpy as np\nstress = [120, 135, 128]\nprint(np.max(stress))  # largest', explanation: [], output: '' };
  };
  const sol = await explainCode(data.paperq.find((q) => q.id === 'p308'), { program, files, notes });
  assert.deepEqual(asked, [[], ['np', 'numpy']]);
  assert.equal(sol.code, 'stress = [120, 135, 128]\nprint("Maximum:", max(stress))');
  assert.deepEqual(sol.explanation, ['max gives the largest value.', 'the stresses']);
  assert.deepEqual(sol.untaught, []);
  assert.match(sol.breakdown, /^```python\n/);
  assert.equal(data.paperq.find((q) => q.id === 'p308').explain.code, sol.code);
});

test('when the rewrite still uses something untaught, it is named for the student', async () => {
  const program = async () => ({ language: 'python', code: 'print(sorted([3, 1]))', explanation: [], output: '' });
  const sol = await explainCode(data.paperq.find((q) => q.id === 'p308'), { program, files, notes });
  assert.deepEqual(sol.untaught, ['sorted']);
});
