// Shared definitions for the whole app (UI via /api/state, server, bot, prompt pack). Change a value here,
// never inline it somewhere else. Pure data and small pure helpers only: no store, no I/O.

// Study stages, latest first. `maxDays` is the furthest the unit's CAT/exam can be (in Nairobi days from today)
// for the stage to apply automatically; anything further, a TBA date or no date at all, is `adequate`.
// Days not hours: 0 = the paper is today, 1 = tomorrow (the eve), 2-3 = last-minute, 4-7 = one-week.
export const STAGES = [
  { id: 'exam-eve', name: 'Exam-Eve Triage', maxDays: 1, window: 'under 24 hours', focus: 'the top 1-2 predicted questions, lecturer-pinned topics, a 1-page survival sheet' },
  { id: 'last-minute', name: 'Last-Minute Mode', maxDays: 3, window: '24-72 hours', focus: 'formula and shortcut sheets, unit/symbol checks, your highest-risk weakspots' },
  { id: 'one-week', name: '1-Week Mode', maxDays: 7, window: '3-7 days', focus: 'high-yield predicted topics, standard solving recipes, shortcuts' },
  { id: 'adequate', name: 'Adequate Prep', maxDays: Infinity, window: '2+ weeks (or date TBA)', focus: 'fundamentals, derivations, assumptions, full sub-topic mastery' },
];
export const STAGE_IDS = STAGES.map((s) => s.id);
export const stageName = (id) => STAGES.find((s) => s.id === id)?.name || id;

// Personal self-audit of a sub-topic (Phase 4).
export const AUDIT = ['solid', 'shaky', 'stuck', 'untested'];
export const SUBTOPIC_KINDS = ['concept', 'derivation', 'method', 'assumption'];

// Why a step broke (checkpoints, mocks, teach-back gaps). One list everywhere.
export const ERROR_TYPES = [
  { id: 'concept-gap', label: 'Concept gap' },
  { id: 'wrong-equation', label: 'Wrong governing equation / method' },
  { id: 'sign-convention', label: 'Sign convention' },
  { id: 'units', label: 'Units / conversion' },
  { id: 'algebra-calculus', label: 'Algebra / calculus slip' },
  { id: 'boundary-condition', label: 'Boundary condition' },
  { id: 'misread-question', label: 'Misread the question' },
];

// Weakness 0-1 (Phase 6): audit base, +0.1 per checkpoint failure and -0.1 per clean solve in the last 14 days.
export const WEAKNESS = { solid: 0.1, shaky: 0.6, stuck: 1, untested: 0.7, perFailure: 0.1, perSolve: -0.1, windowDays: 14 };

// Lecturer hints (Phase 5): focus boosts a topic; exclude halves it while there's time, and mutes it after.
export const HINT = { focus: 2.5, excludeAdequate: 0.5, excludeLate: 0 };

// A unit's CAT/exam date: null (fall back to the KU calendar), an ISO day (YYYY-MM-DD), or 'TBA'.
export const TBA = 'TBA';
