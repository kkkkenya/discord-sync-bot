// Which daily posts to send now. Pure, so it can be tested (test/scheduler.test.js).

// GitHub's cron can start hours late; without a gap a late trivia and its answer would post minutes apart.
export const REVEAL_GAP_MS = 3 * 3600e3;

const slot = (at) => { const [h, m] = at.split(':').map(Number); return h * 60 + m; };

// done = { job: 'YYYY-MM-DD' last sent }. now = a test run: ignore the times, but never reveal early.
export function dueJobs(schedule, done, day, minutes, { now = false } = {}) {
  return schedule
    .filter(({ job, at }) => done[job] !== day && (minutes >= slot(at) || (now && job !== 'reveal')))
    .map(({ job }) => job);
}

// Rows saved before postedAt existed are treated as old enough.
export const revealReady = (trivia, nowMs = Date.now()) => !trivia.postedAt || nowMs - trivia.postedAt >= REVEAL_GAP_MS;
