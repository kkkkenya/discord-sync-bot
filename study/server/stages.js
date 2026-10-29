// Study stage per unit (defs.js STAGES). Pure: callers pass the days left (null = TBA / no date).
// Precedence: the unit's own override, then the "all units" override from the top bar, then the unit's date.
import { STAGES, STAGE_IDS, stageName } from './defs.js';

// From days left to the unit's paper: 0-1 exam-eve, 2-3 last-minute, 4-7 one-week, else adequate. A date that
// has passed counts as adequate (the next paper isn't set yet).
export function autoStage(days) {
  if (days == null || days < 0) return 'adequate';
  return STAGES.find((s) => days <= s.maxDays).id;
}

// { id, name, source }: source is 'unit' or 'all' (an override), else 'date', 'tba' (no date) or 'past'.
export function stageFor(unit, days, allUnits = null) {
  const pick = (id, source) => ({ id, name: stageName(id), source });
  if (STAGE_IDS.includes(unit.stage)) return pick(unit.stage, 'unit');
  if (STAGE_IDS.includes(allUnits)) return pick(allUnits, 'all');
  return pick(autoStage(days), days == null ? 'tba' : days < 0 ? 'past' : 'date');
}

// How many units sit in each stage, latest stage first, empty stages left out: [{ id, name, n }].
export const stageMix = (stages) =>
  STAGES.map((s) => ({ id: s.id, name: s.name, n: stages.filter((x) => x.id === s.id).length })).filter((x) => x.n);

export const validStage = (v) => v === null || STAGE_IDS.includes(v);
