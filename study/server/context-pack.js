// Deep Context Pack (Phase 7): a Master Prompt + <UNIT>-<TOPIC>-context.md for an external reasoning model, when
// the built-in AI's context or effort limits would hurt the answer. Pure: index.js gathers the data. No AI needed.
import { stageName, STAGES } from './defs.js';

export const GOALS = {
  breakdown: { name: 'Deep sub-topic & concept breakdown', ask: 'Explain my weak sub-topics from first principles: the governing principle, where each equation comes from (derive it), every assumption and when it breaks down, sign conventions, and one fully worked example per sub-topic.' },
  solution: { name: 'Step-by-step past-paper solution', ask: 'Solve the target question (or the most likely past-paper questions in the pack) exactly as a KU marking scheme would award marks: every step a numbered checkpoint with its intermediate value and SI units, and the final answer boxed with units.' },
  shortcuts: { name: '1-week method shortcuts & exam patterns', ask: 'Give me the fastest reliable solving recipe for each question type this topic produces in the past papers in the pack: the standard steps, the shortcut, and the traps that cost marks. Then one exam-style question per recipe for me to try.' },
  sheet: { name: 'Last-minute formula, units & trap sheet', ask: 'Build a one-page formula and trap sheet: every formula I need, what each symbol means with its SI unit, when the formula does NOT apply, sign conventions, and my own recurring mistakes from the pack as warnings.' },
  diagnose: { name: 'Diagnose my mistakes & targeted practice', ask: 'Look at where my working broke (in the pack), name the exact misconception or slip behind each, explain the correct reasoning, then give me 3 targeted practice questions that would catch the same mistake, one at a time.' },
};

// The goal a stage leans on when none is picked; a target question means "solve it".
export const defaultGoal = (stage, question) => (question ? 'solution' : { adequate: 'breakdown', 'one-week': 'shortcuts', 'last-minute': 'sheet', 'exam-eve': 'solution' }[stage] || 'breakdown');

const STAGE_TONE = {
  adequate: 'I have 2+ weeks (or the date is not set yet): go deep — first principles, full derivations, physical assumptions.',
  'one-week': 'I have about a week: focus on the high-yield predicted topics, standard solving procedures and shortcuts. Skip history and side topics.',
  'last-minute': 'I have 1-3 days: formulas, units, symbols and traps for the highest-risk sub-topics. Skip long derivations unless the lecturer pinned them.',
  'exam-eve': 'The paper is within 24 hours: walk me through the 1-2 most likely questions step by step, and keep everything else to a survival sheet.',
};

const FIGURE = /\b(fig(ure)?s?|diagram|shown|sketch(ed)?|drawing|graph)\b/i;
const tokens = (s) => Math.ceil(s.length / 4);
const slug = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Everything the pack and prompt can say. Inputs are plain data:
//   unit { code, title }, cohort { name, year, sem } | null, stage (id), topic { id, name } | null,
//   subtopics (the topic's), weak (weakspot rows for the topic), errors (counts), hints, questions (paperq on the
//   topic), question (the target paperq row) | null, failures (recent wrong attempts, with their checkpoints),
//   files [{ name, paper, text }] (the unit's synced library; text '' = scanned), goal, budget (tokens), today.
export function buildPack(input) {
  const { unit, cohort, stage = 'adequate', topic, subtopics = [], weak = [], errors = [], hints = [], questions = [], question = null, failures = [], files = [], budget = 120000, today = '' } = input;
  const goal = GOALS[input.goal] ? input.goal : defaultGoal(stage, question);
  const topicName = topic?.name || 'the whole unit';
  const filename = `${slug(unit.code)}-${slug(topic?.name || 'unit')}-context.md`;
  const st = STAGES.find((s) => s.id === stage);
  const by = (a) => subtopics.filter((s) => s.audit === a).map((s) => s.name);
  const errLine = errors.filter((e) => e.n).map((e) => `${e.label.toLowerCase()} (${e.n})`).join(', ');

  // ---- the Master Prompt ----
  const who = `${cohort ? `${cohort.name} engineering, year ${cohort.year} semester ${cohort.sem}` : 'Engineering'} at Kenyatta University (KU). Unit: ${unit.code} ${unit.title || ''}. Topic: ${topicName}.`;
  const prompt = [
    'You are a tough but fair engineering tutor at Kenyatta University, preparing me for a KU CAT/exam. Be technically exact at KU exam level.',
    `## Who I am\n${who}\nStudy stage: ${stageName(stage)} (${st?.window || ''}). ${STAGE_TONE[stage] || ''}`,
    `## What I need (${GOALS[goal].name})\n${GOALS[goal].ask}${question ? `\n\nTarget question (${question.source}, Q${question.number}${question.marks ? `, ${question.marks} marks` : ''}):\n${question.text}` : ''}`,
    hints.length ? `## What my lecturer said (verbatim)\n${hints.map((h) => `- "${h.text}"${h.kind === 'focus' ? ' (focus)' : h.kind === 'exclude' ? ' (skip)' : ''}`).join('\n')}` : '',
    `## My weakspots${topic ? ` on ${topic.name}` : ''}\n${[
      by('stuck').length ? `- Stuck (don't get the concept or steps): ${by('stuck').join('; ')}` : '',
      by('shaky').length ? `- Shaky (need the formula / slow): ${by('shaky').join('; ')}` : '',
      by('untested').length ? `- Not tried yet: ${by('untested').join('; ')}` : '',
      errLine ? `- Mistakes I keep making: ${errLine}` : '',
      weak.length ? `- Highest risk first: ${weak.slice(0, 5).map((w) => w.name).join('; ')}` : '',
      by('solid').length ? `- Already solid (don't spend effort re-teaching): ${by('solid').join('; ')}` : '',
    ].filter(Boolean).join('\n') || '- Not audited yet: start from the fundamentals and check my understanding as you go.'}\nSpend your effort on the stuck and shaky ones.`,
    `## Rules for your answer\n1. Number every step as a checkpoint: "Checkpoint n — what you do: equation = value [SI unit]", so I can compare my handwritten working line by line.\n2. Carry SI units through every line; convert units before substituting (mm to m, kN to N, MPa to Pa).\n3. State every assumption, the sign convention you use, and when the method stops applying.\n4. Use the attached ${filename} as the source of truth for notation, the syllabus and the lecturer's emphasis. If something isn't in it, say so instead of guessing.\n5. If a question needs a figure I haven't attached, ask for it before solving.\n6. Finish by testing me: 3 questions on my weak sub-topics, one at a time, waiting for my answer and marking it.`,
  ].filter(Boolean).join('\n\n');

  // ---- the .md pack: the fixed sections first, then course material until the budget runs out ----
  const sec = [];
  sec.push(`# ${unit.code} — ${topicName}: context pack\n\nMade by Study Desk on ${today} for ${cohort ? `${cohort.name} ${cohort.year}.${cohort.sem}` : 'a KU engineering student'}. Study stage: ${stageName(stage)}. Goal: ${GOALS[goal].name}.`);
  if (question) sec.push(`## Target question\n\n**${question.source}, Q${question.number}${question.marks ? ` (${question.marks} marks)` : ''}**\n\n${question.text}`);
  sec.push(`## My weakspot profile\n\n${subtopics.length ? subtopics.map((s) => `- ${s.name} (${s.kind || 'concept'}): **${s.audit}**`).join('\n') : '_No sub-topics listed yet._'}${errLine ? `\n\nRecurring mistakes (last 30 days): ${errLine}.` : ''}${weak.length ? `\n\nFix first: ${weak.slice(0, 5).map((w) => `${w.name} (${w.reason})`).join('; ')}.` : ''}`);
  if (hints.length) sec.push(`## What the lecturer said\n\n${hints.map((h) => `- "${h.text}" (${h.kind}, ${String(h.at || '').slice(0, 10)})`).join('\n')}`);
  if (questions.length) sec.push(`## Past-paper and CAT questions on ${topicName}\n\n${[...questions].sort((a, b) => (b.year || 0) - (a.year || 0)).map((q) => `### ${q.source} · Q${q.number}${q.marks ? ` · ${q.marks} marks` : ''}\n\n${q.text}`).join('\n\n')}`);
  if (failures.length) sec.push(`## Where my working broke recently\n\n${failures.map((f) => `- ${String(f.at || '').slice(0, 10)}: ${f.question || 'a question'}${f.brokeAt ? ` — broke at checkpoint ${f.brokeAt}${f.checkpoint ? ` (${f.checkpoint})` : ''}` : ''}${f.errorType ? `, ${f.errorType}` : ''}${f.answer ? `; my answer: ${f.answer}` : ''}`).join('\n')}`);

  let md = sec.join('\n\n');
  const cut = [];
  const material = files.filter((f) => f.text);
  if (material.length) {
    const need = (topic?.name || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const score = (f) => (need.length && need.some((w) => f.text.toLowerCase().includes(w) || f.name.toLowerCase().includes(w)) ? 1 : 0);
    const ordered = [...material].sort((a, b) => score(b) - score(a) || Number(b.paper) - Number(a.paper));
    md += '\n\n## Course material (synced from the Study Hub)';
    for (const f of ordered) {
      const block = `\n\n### ${f.name} (${f.paper ? 'past paper / CAT' : 'notes'})\n\n${f.text}`;
      const room = budget * 4 - md.length - 400;
      if (block.length <= room) md += block;
      else if (room > 2000) { md += `${block.slice(0, room)}\n\n_[cut here: over the size budget]_`; cut.push(`${f.name} (partly)`); }
      else cut.push(f.name);
    }
  }
  if (cut.length) md += `\n\n## Not included (over the ~${Math.round(budget / 1000)}k-token budget)\n\n${cut.map((c) => `- ${c}`).join('\n')}\n\nAttach these files themselves if the answer needs them.`;

  // ---- what to upload ----
  const scanned = files.filter((f) => !f.text && f.paper).map((f) => f.name);
  const figures = [...new Set([question, ...questions].filter((q) => q && FIGURE.test(q.text)).map((q) => q.source))];
  const checklist = [
    `Attach the downloaded file ${filename}.`,
    ...(question && FIGURE.test(question.text) ? [`Attach a photo or screenshot of the figure in ${question.source}, Q${question.number}: the question refers to one.`] : []),
    ...(figures.length ? [`Also attach the original PDF${figures.length === 1 ? '' : 's'} with diagrams: ${figures.join(', ')}.`] : []),
    ...(scanned.length ? [`Scanned papers have no text in the pack; attach them if they matter: ${scanned.join(', ')}.`] : []),
    ...(cut.length ? [`Over the size budget, left out of the pack: ${cut.join(', ')}.`] : []),
    'Paste the Master Prompt, and turn on deep reasoning: Claude (extended thinking), DeepSeek (DeepThink / R1), ChatGPT (a reasoning model).',
  ];
  return { goal, prompt, md, filename, checklist, tokens: tokens(md) + tokens(prompt), cut };
}
