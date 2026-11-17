// The clock of a hosted study room (fixplan-f 2.2, 2.9). Pure: the server stores it, every device works out the
// phase from it with the server's time, so a phone that sleeps or has the wrong time still shows the right block.
// The clock is anchored to the current phase, not to the room's start, so a skip or a settings change never moves
// the boundaries after it.
//
// clock: { plan, state, phase, round, phaseStart, leftMs }
//   plan:  { focus, short, long, longEvery, rounds, wait }   minutes; longEvery 0 = never; rounds 0 = until stopped
//   state: 'idle' | 'running' | 'paused' | 'waiting' | 'done' | 'ended'
//   phase: 'focus' | 'short' | 'long';  round: focus blocks started so far (1 …)
//   phaseStart: ms when the current phase began (running);  leftMs: time left in it (paused, waiting)

export const PRESETS = {
  classic: { focus: 25, short: 5, long: 15, longEvery: 4, rounds: 0, wait: false },
  long: { focus: 50, short: 10, long: 20, longEvery: 0, rounds: 0, wait: false },
  paper: { focus: 90, short: 20, long: 20, longEvery: 0, rounds: 0, wait: false },
};
export const LIMITS = { focus: [10, 120], short: [0, 30], long: [0, 60], longEvery: [0, 8], rounds: [0, 12] };

const int = (v, [lo, hi], fallback) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };
// a plan from anyone's input, inside the limits (focus in steps of 5)
export function cleanPlan(p = {}) {
  const d = PRESETS.classic;
  const plan = {
    focus: Math.round(int(p.focus, LIMITS.focus, d.focus) / 5) * 5,
    short: int(p.short, LIMITS.short, d.short),
    long: int(p.long, LIMITS.long, d.long),
    longEvery: int(p.longEvery, LIMITS.longEvery, d.longEvery),
    rounds: int(p.rounds, LIMITS.rounds, d.rounds),
    wait: p.wait === true,
  };
  if (plan.longEvery === 1) plan.longEvery = 2; // a long break after every block is just a longer short break
  return plan;
}

export const length = (plan, phase) => (plan[phase] || 0) * 60e3;
export const idle = (plan) => ({ plan: cleanPlan(plan), state: 'idle', phase: 'focus', round: 1, phaseStart: null, leftMs: null });

// the phase after this one, or null when the last round's focus block is over
export function next(plan, phase, round) {
  if (phase !== 'focus') return { phase: 'focus', round: round + 1 };
  if (plan.rounds && round >= plan.rounds) return null;
  const brk = plan.longEvery > 0 && round % plan.longEvery === 0 ? 'long' : 'short';
  return length(plan, brk) > 0 ? { phase: brk, round } : { phase: 'focus', round: round + 1 };
}

// Walk a running clock forward to `now`: the stored clock where it would be (same shape), never mutating.
export function settle(c, now) {
  if (c.state !== 'running') return c;
  let { phase, round, phaseStart } = c;
  for (let i = 0; i < 500; i++) { // 12 hours of 10-minute blocks is 72 steps
    const len = length(c.plan, phase);
    if (now - phaseStart < len) return { ...c, phase, round, phaseStart };
    const n = next(c.plan, phase, round);
    const endsAt = phaseStart + len;
    if (!n) return { ...c, state: 'done', phase, round, phaseStart: null, leftMs: 0 };
    if (c.plan.wait) return { ...c, state: 'waiting', phase: n.phase, round: n.round, phaseStart: null, leftMs: length(c.plan, n.phase) };
    ({ phase, round } = n);
    phaseStart = endsAt;
  }
  return { ...c, phase, round, phaseStart: now };
}

// What a screen shows: { state, mode, left, total, round, rounds }
export function phaseAt(c, now) {
  const s = settle(c, now);
  const total = length(s.plan, s.phase);
  const left = s.state === 'running' ? total - (now - s.phaseStart)
    : s.state === 'idle' ? length(s.plan, 'focus')
      : s.state === 'paused' || s.state === 'waiting' ? s.leftMs : 0;
  return { state: s.state, mode: s.phase, left: Math.max(0, left), total, round: s.round, rounds: s.plan.rounds };
}

const live = (c) => !['done', 'ended'].includes(c.state);
// Host actions. Each returns a new clock; an action that does not apply returns the clock unchanged (settled).
export const actions = {
  start(c, now) {
    const s = settle(c, now);
    if (s.state === 'idle') return { ...s, state: 'running', phase: 'focus', round: 1, phaseStart: now, leftMs: null };
    if (s.state === 'waiting') return { ...s, state: 'running', phaseStart: now, leftMs: null };
    if (s.state === 'done') return { ...idle(s.plan), state: 'running', phaseStart: now };
    return s;
  },
  pause(c, now) {
    const s = settle(c, now);
    return s.state === 'running' ? { ...s, state: 'paused', leftMs: length(s.plan, s.phase) - (now - s.phaseStart), phaseStart: null } : s;
  },
  resume(c, now) {
    const s = settle(c, now);
    return s.state === 'paused' ? { ...s, state: 'running', phaseStart: now - (length(s.plan, s.phase) - s.leftMs), leftMs: null } : s;
  },
  skip(c, now) {
    const s = settle(c, now);
    if (!live(s) || s.state === 'idle') return s;
    if (s.state === 'waiting') return actions.start(s, now);
    const n = next(s.plan, s.phase, s.round);
    if (!n) return { ...s, state: 'done', phaseStart: null, leftMs: 0 };
    return s.state === 'paused'
      ? { ...s, phase: n.phase, round: n.round, leftMs: length(s.plan, n.phase) }
      : { ...s, state: 'running', phase: n.phase, round: n.round, phaseStart: now, leftMs: null };
  },
  // new settings apply from the next phase: the current one keeps its end time (a paused one, its time left, at most
  // the new length; a phase waiting to start takes the new length)
  settings(c, now, plan) {
    const s = settle(c, now);
    const p = cleanPlan(plan);
    const newLen = length(p, s.phase);
    if (s.state === 'running' && newLen === 0) return { ...s, plan: p, phase: 'focus', round: s.round + 1, phaseStart: now }; // a break set to 0 ends now
    if (s.state === 'running') return { ...s, plan: p, phaseStart: s.phaseStart + length(s.plan, s.phase) - newLen };
    if (s.state === 'paused') return { ...s, plan: p, leftMs: Math.min(s.leftMs, newLen) };
    if (s.state === 'waiting') return { ...s, plan: p, leftMs: newLen };
    return { ...s, plan: p };
  },
  end(c, now) { return { ...settle(c, now), state: 'ended', phaseStart: null, leftMs: 0 }; },
};
export const ACTIONS = Object.keys(actions);
