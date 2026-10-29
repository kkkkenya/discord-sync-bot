// Study material matched to the stage (Phase 10): the right kind of practice for how close the unit's paper is.
// Store-aware glue around brain.js makeKit; what is made is saved in data.materials so it isn't remade every time,
// and can be edited (generic PATCH /api/materials/<id>).
import { aiReady } from './ai.js';
import { makeKit } from './brain.js';
import { contextFor } from './ingest.js';
import { predictFor, unitStage, weakspotsFor } from './plan.js';
import { add, data } from './store.js';

export const KIT_FOR = { adequate: 'ladder', 'one-week': 'recipes', 'last-minute': 'sheet', 'exam-eve': 'sheet' };
// goal: the Prompt Builder goal that makes the same thing in another AI (used when there is no key)
export const KITS = {
  ladder: { name: 'Worked → faded → solo ladder', goal: 'breakdown' },
  recipes: { name: 'Method recipes and shortcuts', goal: 'shortcuts' },
  sheet: { name: 'Formula and shortcut sheet', goal: 'sheet' },
};
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

// body: { unit, kind?, topicId? }. kind defaults to the unit's stage. A ladder is about one topic (the one asked
// for, else the top weakspot's, else the most likely to come); recipes and sheets cover the likely topics.
export async function makeKitFor({ unit, kind, topicId }, { make = makeKit, ready = aiReady } = {}) {
  const u = data.units.find((x) => x.code === unit);
  if (!u) throw bad('Pick one of your units first.');
  const stage = unitStage(u).stage.id;
  const k = kind || KIT_FOR[stage];
  if (!KITS[k]) throw bad('unknown kind of material');
  const ranked = predictFor(unit).filter((r) => !r.muted);
  const { critical, errors } = weakspotsFor(unit);
  const topics = data.topics.filter((t) => t.unit === unit);
  const topic = topicId
    ? topics.find((t) => t.id === topicId)
    : k === 'ladder' ? topics.find((t) => t.id === critical[0]?.topicId) || topics.find((t) => t.id === ranked[0]?.topicId) || topics[0] : null;
  if (k === 'ladder' && !topic) throw bad('Add the unit\'s topics first (Units → Suggest topics).');
  if (!ready()) return { needKey: true, goal: KITS[k].goal, message: `No AI key, so it can't be made here. The Prompt Builder makes the same thing ("${KITS[k].name}") in any AI chat.` };
  const subs = data.subtopics.filter((s) => s.unit === unit && (!topic || s.topicId === topic.id));
  const content = await make({
    kind: k,
    unit: `${u.code} ${u.title || ''}`.trim(),
    topic: topic?.name || '',
    focus: (topic ? [topic.name] : ranked.slice(0, k === 'sheet' ? 6 : 4).map((r) => r.name)),
    subtopics: subs.map((s) => `${s.name} (${s.audit || 'untested'})`),
    traps: errors.counts.map((e) => `${e.label} (${e.n}×)`),
    context: contextFor(unit, topic?.name || ranked[0]?.name || '', 10000),
  });
  return add('materials', { unit, topicId: topic?.id || null, kind: k, stage, content, edited: false });
}
