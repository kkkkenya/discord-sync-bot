import { useElapsed } from './api.js';

// What the AI is doing while you wait, step by step, so a long wait reads as progress, not a freeze. The steps are
// what each kind of request actually goes through; one moves on every few seconds and the last one stays.
const STEPS = {
  check: ['Reading your answer', 'Finding the answer key', 'Solving it step by step', 'Comparing your answer', 'Writing the checkpoints'],
  solution: ['Reading the question', 'Listing what is given', 'Setting up the free body diagram', 'Working through the steps', 'Checking units and the answer', 'Laying out the solution'],
  batch: ['Reading the questions', 'Solving them one at a time', 'Drawing the diagrams', 'Checking each answer', 'Saving the solutions'],
  guide: ['Reading the course outline', 'Going through your books’ contents', 'Finding the pages on this topic', 'Looking at the past papers', 'Writing the study guide'],
  kit: ['Reading your notes and papers', 'Picking the methods that come up', 'Writing the worked examples', 'Checking the answers', 'Laying out the sheet'],
  mock: ['Picking the topics', 'Choosing questions from papers and books', 'Setting the marks'],
  marking: ['Reading your answers', 'Marking against the model answers', 'Adding up the marks', 'Writing the feedback'],
  teach: ['Reading your explanation', 'Checking it against the topic', 'Finding what is missing', 'Writing the feedback'],
};
const EVERY = 6; // seconds a step stays

export const stepOf = (kind, n) => { const s = STEPS[kind] || STEPS.check; return s[Math.min(s.length - 1, Math.floor(n / EVERY))]; };

// A button label: "Checking units and the answer… 14s" while it runs.
export default function Busy({ on, label, idle, kind }) {
  const n = useElapsed(on);
  if (!on) return idle;
  return `${kind ? stepOf(kind, n) : label.replace(/…$/, '')}… ${n}s`;
}

// The same as a status line with a moving bar, for waits shown below a form.
export function AiWait({ on, kind, note }) {
  const n = useElapsed(on);
  if (!on) return null;
  return (
    <div className="aiwait" role="status" aria-live="polite">
      <span className="aiwait-bar" aria-hidden="true" />
      <span className="aiwait-text"><b>{stepOf(kind, n)}…</b> <span className="num muted">{n}s</span></span>
      {note && <span className="muted small">{note}</span>}
    </div>
  );
}
