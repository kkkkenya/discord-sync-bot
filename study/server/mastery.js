// Evidence-based topic status: a topic is green only when the evidence says so — a teach-back scored 4/5+ and
// >=2 exam questions solved with >=70% marks. One of the two is amber, neither is red. (Sub-topic audits and
// checkpoint failures join the evidence in Phase 6.) A manual override wins but is shown separately. Date helpers
// are copied from plan.js to avoid an import cycle (plan.js imports this file).
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
  const questionsOk = solved >= NEED.questions;

  const evidence = teachOk && questionsOk ? 'green' : (teachOk || questionsOk ? 'amber' : 'red');
  const manual = topic.manual || null;
  const why = [
    teachOk ? `teach-back ${best}/5 ✓` : (best ? `teach-back ${best}/5 (need ${NEED.teach}/5)` : 'no teach-back yet'),
    questionsOk ? `${solved}/${NEED.questions} questions ✓` : `${solved}/${NEED.questions} questions solved`,
  ].join(' · ');
  const next = manual ? 'marked by you' : !teachOk ? `Teach it back (score ${NEED.teach}/5)` : !questionsOk ? `Solve ${NEED.questions - solved} more question${NEED.questions - solved === 1 ? '' : 's'}` : 'Mastered';

  return {
    status: manual || evidence,
    manual: Boolean(manual),
    teach: { best, ok: teachOk },
    questions: { solved, ok: questionsOk },
    why,
    next,
  };
}

export const topicStatus = (topic, today) => topicMastery(topic, today).status;
export const masteryMap = (today = nairobiDay()) => Object.fromEntries(data.topics.map((t) => [t.id, topicMastery(t, today)]));
