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

// What each membership tier gets a day (Nairobi days). Owner: no limits.
export const LIMITS = {
  ai: { trial: 15, basic: 15, premium: 40, vvip: 80, owner: Infinity },
  download: { trial: 2, basic: 2, premium: Infinity, vvip: Infinity, owner: Infinity },
  // "Ask for the scheme" (server/schemes.js): each ask is a DM to the owner
  ask: { trial: 5, basic: 5, premium: 5, vvip: 5, owner: Infinity },
};
// DeepSeek (Premium's deeper text tasks). Priced at the peak rate so the estimate errs high: deepseek-flash,
// USD per million tokens, from api-docs.deepseek.com on 2026-11-01. Above the monthly cap Crux uses Gemini instead.
export const DEEPSEEK = { model: 'deepseek-flash', inputPerM: 0.3, outputPerM: 1.2, priced: '2026-11-01', monthlyCapUsd: 2.9 };
export const deepseekCost = ({ prompt_tokens: i = 0, completion_tokens: o = 0 } = {}) => (i * DEEPSEEK.inputPerM + o * DEEPSEEK.outputPerM) / 1e6;

// Gold solutions (fixplan-e E1, server/gold.js). Check levels, lowest first: 'single' (one solver), 'agreed' (two model
// families reach the same answer), 'key' (matches the answer printed on a tutorial sheet). A shared solution is
// replaced only by a higher level, by a strong model over a cheap one at the same level, or after enough students
// flagged it. Strong models run only on the owner's laptop (tools/gold.js).
export const GOLD = { levels: ['single', 'agreed', 'key'], strongModels: ['opus'], flagsToReplace: 3, solver: 'opus', second: 'deepseek-flash', diagrams: 'fable' }; // Fable draws diagrams only, never answers (owner, 2026-11-15; phase E1b)

// Programming units (owner, 2026-11-15): answers use only what the unit's notes teach, with no comments in the code
// (server/taught.js). Matched on the unit's title.
export const PROGRAMMING_UNIT = /programming|coding/i;

// Reviews in Today (fixplan-e E2, server/review.js): a green topic whose understanding fades within `withinDays` comes
// back as one question. At most `perDay` a day (Nairobi). In the last `quietDays` before a paper, only that unit's.
export const REVIEW = { withinDays: 2, perDay: 2, quietDays: 3 };

// The learner file (fixplan-e E5, server/learner.js): what Crux may say about a student, and the floors it needs.
// Lines appear only when their evidence reaches these counts; the block sent to prompts is at most `blockChars`.
export const LEARNER = { days: 60, minMistakes: 3, minBottleneck: 3, minBreaks: 2, kappaLow: 0.5, kappaHigh: 0.85, notes: 5, noteChars: 140, blockChars: 600 };

// Study rooms (fixplan-f): hosted rooms joined with a four-letter code, and the public rooms everyone shares.
// codeLetters has no vowels (no words) and no I or O (misread). Times in the names' units.
export const ROOMS = {
  codeLetters: 'BCDFGHJKLMNPQRSTVWXZ', codeLength: 4, maxPeople: 50, pollSeconds: 20, hereSeconds: 90, dropMinutes: 10,
  hostAwayMinutes: 5, emptyEndMinutes: 30, maxHours: 12, codeRestHours: 24, wrongPerHour: 10, wrongPerDay: 30,
  nameChars: 40, keepDays: 7, seenEverySeconds: 60,
};
// Public rooms: always on, no host, fixed to the clock (web/src/focus-store.js roomPhase). Counts only, never names.
export const PUBLIC_ROOMS = [
  { id: 'hub', name: 'Study room', focus: 25, block: 30 },
  { id: 'long', name: 'Long room', focus: 50, block: 60 },
];
