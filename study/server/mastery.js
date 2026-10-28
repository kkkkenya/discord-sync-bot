// Evidence-based topic status (GUIDE.md "How Topic & Sub-Topic Mastery Colours Work"):
//   green: every sub-topic audited solid (or none listed) + a teach-back scored 4/5+, and >=2 exam questions
//          solved with >=70% marks (or checkpoint attempts all passed), and no checkpoint failure in 7 days
//   red:   nothing tried yet, any sub-topic stuck, or 2+ checkpoint failures in 7 days
//   amber: everything in between (partly tested, or a shaky sub-topic)
// A manual override wins but is shown separately. Date helpers are copied from plan.js to avoid an import cycle
// (plan.js imports this file).
import { data } from './store.js';

export const nairobiDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const same = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

const NEED = { teach: 4, questions: 2, qPct: 0.7 };

export function topicMastery(topic, today = nairobiDay()) {
  // 1. Teach-back: best score across teach records matching this topic name.
  const best = data.teach
    .filter((t) => t.unit === topic.unit && same(t.topic, topic.name))
    .reduce((m, t) => Math.max(m, t.feedback?.score || 0), 0);
  const teachOk = best >= NEED.teach;

  // 2. Exam questions: mock answers on this topic with >=70% marks.
  let solved = 0;
  for (const m of data.mocks) {
    if (m.unit !== topic.unit) continue;
    (m.questions || []).forEach((q, i) => {
      if (!same(q.topic, topic.name)) return;
      const a = m.answers?.[i];
      if (a && a.earned != null && q.marks && a.earned / q.marks >= NEED.qPct) solved++;
    });
  }
  // 3. Checkpoint attempts on the topic (Phase 8): a right one counts as a solved question.
  const since = Date.parse(`${addDays(today, -6)}T00:00:00+03:00`);
  const subs = data.subtopics.filter((s) => s.topicId === topic.id);
  const subIds = new Set(subs.map((s) => s.id));
  const tries = data.attempts.filter((a) => a.topicId === topic.id || subIds.has(a.subtopicId));
  solved += tries.filter((a) => a.verdict === 'right').length;
  const failures = tries.filter((a) => a.verdict === 'wrong' && Date.parse(a.at) >= since).length;
  const questionsOk = solved >= NEED.questions;

  // 4. The sub-topic self-audit.
  const audited = subs.filter((s) => s.audit && s.audit !== 'untested');
  const solid = subs.filter((s) => s.audit === 'solid').length;
  const stuck = subs.filter((s) => s.audit === 'stuck');
  const subsOk = solid === subs.length;

  const tried = teachOk || best > 0 || solved > 0 || audited.length > 0 || tries.length > 0;
  const evidence = teachOk && questionsOk && subsOk && !failures ? 'green'
    : !tried || stuck.length || failures >= 2 ? 'red'
      : 'amber';
  const manual = topic.manual || null;
  const why = [
    teachOk ? `teach-back ${best}/5 ✓` : (best ? `teach-back ${best}/5 (need ${NEED.teach}/5)` : 'no teach-back yet'),
    questionsOk ? `${solved}/${NEED.questions} questions ✓` : `${solved}/${NEED.questions} questions solved`,
    subs.length ? `${solid}/${subs.length} sub-topics solid${stuck.length ? `, ${stuck.length} stuck` : ''}` : null,
    failures ? `${failures} broken checkpoint${failures === 1 ? '' : 's'} this week` : null,
  ].filter(Boolean).join(' · ');
  const next = manual ? 'marked by you' : stuck.length ? `Get unstuck on ${stuck[0].name}` : failures ? 'Redo the questions you broke this week' : !teachOk ? `Teach it back (score ${NEED.teach}/5)` : !questionsOk ? `Solve ${NEED.questions - solved} more question${NEED.questions - solved === 1 ? '' : 's'}` : !subsOk ? `Make ${subs.find((s) => s.audit !== 'solid').name} solid` : 'Mastered';

  return {
    status: manual || evidence,
    manual: Boolean(manual),
    teach: { best, ok: teachOk },
    questions: { solved, ok: questionsOk },
    subtopics: { total: subs.length, solid, stuck: stuck.length },
    failures,
    why,
    next,
  };
}

export const topicStatus = (topic, today) => topicMastery(topic, today).status;
export const masteryMap = (today = nairobiDay()) => Object.fromEntries(data.topics.map((t) => [t.id, topicMastery(t, today)]));
