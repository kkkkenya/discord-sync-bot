// The learner file with the app's data (fixplan-e E5). Store-aware glue around learner.js (pure).
import { randomUUID } from 'node:crypto';
import { learnerFile, editLearner } from './learner.js';
import { nairobiDay } from './plan.js';
import { data, save } from './store.js';

// What the learner file shows and what the desktop tutor reads: the lines (hidden ones too, so they can be shown
// again), the student's notes, and the block of at most 600 characters that prompts get (hidden lines left out).
export function learnerState(today = nairobiDay()) {
  const { lines, block } = learnerFile(data, { today });
  return { lines, notes: data.learner.notes.map(({ id, text, at }) => ({ id, text, at })), block };
}

// The block for the personal prompts (explain, ask, coach, checkpoint feedback), or '' when there is nothing to say.
// Never passed to a shared writer (see learner.js).
export const aboutStudent = (today = nairobiDay()) => learnerFile(data, { today }).block;

// POST /api/learner: one edit (see editLearner). Returns the new state. No AI.
export function learnerUpdate(body, today = nairobiDay()) {
  const lineIds = learnerFile(data, { today }).lines.map((l) => l.id);
  data.learner = editLearner(data.learner, body, { newId: () => randomUUID().slice(0, 8), at: new Date().toISOString(), lineIds });
  save();
  return learnerState(today);
}
