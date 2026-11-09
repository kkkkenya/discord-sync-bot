// Turns study material into CAT-style questions, and marks mock-exam answers.
// All three calls go through the shared structured() helper so they match coach.js behaviour.
import { structured } from './ai.js';
import { ERROR_TYPES } from './defs.js';

const TUTOR = `You are a tough but fair Mechanical Engineering tutor at Kenyatta University, coaching a 3rd-year student
for CATs and exams. Be specific and technically correct at KU CAT level: name the exact equation, sign convention,
assumption or step. Write every equation and symbol in LaTeX: inline as $...$ (e.g. $\\tau = \\frac{T r}{J}$), a whole
equation on its own line as $$...$$. Bold key values and results with **...** (e.g. **D = 200 mm**). Give anything longer
than two sentences a structure: a short heading line starting with ## for each part, numbered steps (1. 2. 3.) or
- bullets, a blank line between paragraphs, and special points on their own line starting with Note:, Tip: or Trap:.
No tables. A field that holds only a final answer (a number and unit, or a short phrase)
stays plain text, like 43.6 % or 12.5 kN·m, with no LaTeX and no bold, so it can be compared.`;

const QUESTION = {
  type: 'object',
  properties: { q: { type: 'string' }, a: { type: 'string' }, marks: { type: 'integer' } },
  required: ['q', 'a', 'marks'],
  additionalProperties: false,
};
// A question generated for a specific topic (mock fill): the topic is used for mastery evidence.
const QUESTION_TOPIC = {
  type: 'object',
  properties: {
    topic: { type: 'string', description: 'The topic name this question belongs to.' },
    q: { type: 'string', description: 'The whole question, complete and self-contained: every given value with its unit, each part on its own line as (a), (b) or (i), (ii), maths in LaTeX.' },
    a: { type: 'string', description: 'The model answer, laid out as the system prompt says, reaching a final answer for every part.' },
    marks: { type: 'integer' },
    from: { type: 'string', description: 'The book example or exercise it is based on, e.g. "Rajput, Example 4.2", or an empty string.' },
  },
  required: ['topic', 'q', 'a', 'marks', 'from'],
  additionalProperties: false,
};

// Notes → CAT questions for the mock bank. `context` (from the synced library) grounds them in real material.
export async function makeStudyMaterial({ unit, topic, text, context = '' }) {
  const schema = {
    type: 'object',
    properties: {
      questions: { type: 'array', items: QUESTION, description: '3-6 CAT-style exam questions drawn from the notes (derivations, numericals, explain-why), each with a step-by-step model answer and a mark count (5-20).' },
    },
    required: ['questions'],
    additionalProperties: false,
  };
  const content = `Unit: ${unit}\nTopic: ${topic}${context ? `\n\nRelevant material from the student's library — base the questions on this, not general knowledge:\n${context}` : ''}\n\nStudent's notes:\n${text}`;
  return structured(schema, TUTOR, content, 8000);
}

// Break a topic into the sub-topics and concepts a KU exam tests, from the student's own material when synced.
export async function suggestSubtopics({ unit, topic, have = [], context = '' }) {
  const schema = {
    type: 'object',
    properties: {
      subtopics: {
        type: 'array',
        description: '5-10 granular sub-topics for this topic, in teaching order: governing principles, derivations, assumptions, standard methods, sign conventions, boundary conditions.',
        items: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Short name, 2-6 words.' }, kind: { type: 'string', enum: ['concept', 'derivation', 'method', 'assumption'] } },
          required: ['name', 'kind'],
          additionalProperties: false,
        },
      },
    },
    required: ['subtopics'],
    additionalProperties: false,
  };
  const content = `Unit: ${unit}\nTopic: ${topic}${have.length ? `\nAlready listed (don't repeat): ${have.join('; ')}` : ''}${context ? `\n\nThe student's course material — break the topic down the way THIS course teaches and examines it:\n${context}` : ''}`;
  return structured(schema, TUTOR, content, 2000);
}

// A unit's exam topics, from its synced course outline and past papers (or the unit title alone when nothing is synced).
export async function suggestTopics({ unit, title = '', have = [], context = '', outline = false }) {
  const schema = {
    type: 'object',
    properties: {
      topics: {
        type: 'array',
        description: '6-14 topics, each one a chunk a CAT or exam question is set on, IN THE ORDER THE COURSE OUTLINE LISTS THEM (its numbering: 1, 1.1, 2 ...). Topics found only in past papers go after the outline topics, in the order they would be taught.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Short name, 2-5 words, as the course outline names it.' },
            from: { type: 'string', enum: ['outline', 'papers', 'both', 'general'], description: 'Where it comes from: the outline, the past papers, both, or general knowledge of the unit.' },
          },
          required: ['name', 'from'],
          additionalProperties: false,
        },
      },
    },
    required: ['topics'],
    additionalProperties: false,
  };
  // With an outline: its topics only, in its words and order. Without one: the papers' topics, then the standard
  // topics a course with this title covers, marked general so the app shows them as expected rather than certain.
  const rule = outline
    ? '\n\nTake the topics STRICTLY from the course outline: its headings, its order, its wording. Do not add any topic the outline does not list, even if the papers or notes mention it. Mark each one outline (or both if the papers examine it too).'
    : '\n\nThere is no course outline. List the topics the past papers examine first (from papers), then fill gaps with the standard topics a course with this title covers (from general).';
  const content = `Unit: ${unit} ${title}${have.length ? `\nAlready listed (don't repeat): ${have.join('; ')}` : ''}${rule}${context
    ? `\n\nThe student's course material. List the topics THIS course teaches and examines, named the way its outline names them, and in the outline's own order (that is the order the student will learn them):\n${context}`
    : '\n\nNo course material is synced. List the standard topics for this unit at KU 3rd-year level, and mark each one general.'}`;
  return structured(schema, TUTOR, content, 2000);
}

// Past-paper questions → the unit's topics (by exact topic name, or '' when none fits).
export async function mapQuestions({ unit, topics, questions }) {
  const schema = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: { type: 'object', properties: { index: { type: 'integer' }, topic: { type: 'string', description: 'Exactly one of the listed topic names, or an empty string if none fits.' } }, required: ['index', 'topic'], additionalProperties: false },
      },
    },
    required: ['results'],
    additionalProperties: false,
  };
  const content = `Unit: ${unit}\nTopics (use these names exactly):\n${topics.map((t) => `- ${t}`).join('\n')}\n\nQuestions:\n${questions.map((q, i) => `[${i}] ${q.slice(0, 1200)}`).join('\n\n')}\n\nFor each question, give its index and the ONE topic it mainly tests.`;
  return structured(schema, TUTOR, content, 4000);
}

// Fill a mock exam when the question bank is short: generate questions from the unit's topics.
export async function makeQuestions({ unit, topics, count, context = '', examples = '' }) {
  const schema = {
    type: 'object',
    properties: { questions: { type: 'array', items: QUESTION_TOPIC, description: `${count} CAT-style questions for this unit.` } },
    required: ['questions'],
    additionalProperties: false,
  };
  const topicList = topics.length ? topics.map((t) => `- ${t.name} (${t.status || 'red'})`).join('\n') : '(no topics listed)';
  const content = [
    `Unit: ${unit}`,
    examples ? `Worked examples and exercises from the student's textbooks. Base each question on one of these: keep the book's set-up and the kind of data it gives, change the numbers, and name it in "from":\n${examples}` : '',
    context ? `Other material from the student's library (past papers and CATs show the exam style):\n${context}` : '',
    `Topics the student is working through (put the exact topic name on each question):\n${topicList}`,
    `Write ${count} exam-style questions for this unit, each tagged with its topic, with a model answer and a mark count (5-20). Every question must be complete: all the data needed to solve it, nothing cut off, nothing that refers to a figure the student can't see (describe the set-up in words instead). Put each part on its own line as (a), (b), (c).`,
  ].filter(Boolean).join('\n\n');
  return structured(schema, TUTOR, content, Math.min(16000, 2500 * count + 2000));
}

// Mark a full mock in one call: per-question marks earned plus a one-line note, and an overall read.
export async function markAnswers(items) {
  const schema = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            earned: { type: 'integer', description: 'Marks earned, 0 to the question marks.' },
            note: { type: 'string', description: 'One line: what was right, and the exact thing that was missing or wrong.' },
          },
          required: ['earned', 'note'],
          additionalProperties: false,
        },
      },
      overall: { type: 'string', description: 'One sentence on readiness for this unit: where they are solid and the single highest-value gap to fix.' },
    },
    required: ['results', 'overall'],
    additionalProperties: false,
  };
  const block = items.map((it, i) => `Q${i + 1} [${it.marks} marks]: ${it.q}\nModel answer: ${it.a}\nStudent's answer: ${it.user || '(blank)'}`).join('\n\n');
  return structured(schema, `${TUTOR} You are marking a timed mock. Award marks for correct method and result; give partial credit for a right approach with a small slip.`, block, 8000);
}

// One question solved as 3-6 numbered checkpoints plus a final answer, for the checkpoint feedback. `expected` is
// an answer key the student typed (the checkpoints must reach it); `scheme` is marking-scheme text to follow;
// `subtopics` are the names a checkpoint may be tagged with.
export async function solveWithCheckpoints({ unit, topic = '', question, subtopics = [], expected = '', scheme = '' }) {
  const schema = {
    type: 'object',
    properties: {
      work: WORK,
      answer: { type: 'string', description: 'The final answer: the number then its unit, for example "142.5 MPa". Nothing else.' },
      checkpoints: {
        type: 'array',
        description: '3 to 6 numbered intermediate steps, in order, ending at the final answer.',
        items: {
          type: 'object',
          properties: {
            step: { type: 'string', description: 'What is done in this step, one short sentence.' },
            equation: { type: 'string', description: 'The equation used, with the numbers substituted.' },
            value: { type: 'string', description: 'The value this step produces, with its unit.' },
            subtopic: { type: 'string', description: 'Exactly one of the listed sub-topic names this step tests, or an empty string.' },
            errorType: { type: 'string', enum: ERROR_TYPES.map((e) => e.id), description: 'The mistake students most often make at this step.' },
          },
          required: ['step', 'equation', 'value', 'subtopic', 'errorType'],
          additionalProperties: false,
        },
      },
    },
    required: ['work', 'answer', 'checkpoints'],
    additionalProperties: false,
  };
  const content = [
    `Unit: ${unit}${topic ? `\nTopic: ${topic}` : ''}`,
    subtopics.length ? `Sub-topics (use these names exactly):\n${subtopics.map((n) => `- ${n}`).join('\n')}` : '',
    scheme ? `Marking scheme material. Follow it, and do not contradict its answers:\n${scheme}` : '',
    expected ? `The answer key says the final answer is ${expected}. Make the checkpoints lead to it.` : '',
    `Question:\n${question}`,
    'Solve it in 3 to 6 numbered checkpoints, SI units carried through every step, assumptions and sign convention stated in the first checkpoint. If you are not sure of the final answer, still give your best working.',
    CLEAN,
  ].filter(Boolean).join('\n\n');
  return structured(schema, TUTOR, content, 6000);
}

// The full worked solution, for reading, laid out like a model answer: given, find, assumptions, the free body
// diagram, then one equation per step with its reason on the right, the boxed answer and a check. The diagram comes
// back as data (a beam, bar or shaft along x, with its supports, loads, torques and cuts) and the app draws it.
const AT = { type: 'number', description: 'Distance from the left end, in metres.' };
const FBD_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['beam', 'bar', 'shaft', 'none'], description: 'beam: transverse loads; bar: axial loads; shaft: torsion (torques along the axis); none: no single straight member to draw.' },
    length: { type: 'number', description: 'Member length in metres (0 when kind is none).' },
    supports: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['pin', 'roller', 'fixed', 'free'] }, at: AT, label: { type: 'string', description: 'Point name, e.g. A.' } }, required: ['type', 'at', 'label'], additionalProperties: false } },
    loads: { type: 'array', description: 'Beam and bar loads. Empty for a shaft: its torques go in torques.', items: { type: 'object', properties: {
      type: { type: 'string', enum: ['point', 'udl', 'moment'] },
      at: AT, to: { type: 'number', description: 'udl only: where it ends, in metres from the left end; else equal to at.' },
      dir: { type: 'string', enum: ['down', 'up', 'left', 'right', 'cw', 'ccw'] },
      label: { type: 'string', description: 'Plain text, e.g. 20 kN, 5 kN/m, 10 kN·m.' },
    }, required: ['type', 'at', 'to', 'dir', 'label'], additionalProperties: false } },
    reactions: { type: 'array', description: 'Beam and bar reactions. Empty for a shaft: its reaction torques go in torques.', items: { type: 'object', properties: { at: AT, dir: { type: 'string', enum: ['up', 'down', 'left', 'right', 'cw', 'ccw'] }, label: { type: 'string', description: 'Plain text, e.g. R_A = 12.5 kN, or R_A when unknown.' } }, required: ['at', 'dir', 'label'], additionalProperties: false } },
    segments: { type: 'array', description: 'Shaft only (else empty): each length of constant section, left to right, covering the whole shaft. A tapered length has d2 different from d.', items: { type: 'object', properties: {
      from: AT, to: AT,
      d: { type: 'number', description: 'Outside diameter at the left of the segment, mm.' },
      d2: { type: 'number', description: 'Outside diameter at the right of the segment, mm (equal to d unless tapered).' },
      bore: { type: 'number', description: 'Inside diameter, mm; 0 for a solid shaft.' },
      label: { type: 'string', description: 'Short, e.g. Ø50 or Ø250/Ø175 steel; empty when there is one plain segment.' },
    }, required: ['from', 'to', 'd', 'd2', 'bore', 'label'], additionalProperties: false } },
    torques: { type: 'array', description: 'Shaft only (else empty): every applied torque and every reaction torque, each as a double-headed vector along the axis (right-hand rule).', items: { type: 'object', properties: {
      at: AT,
      dir: { type: 'string', enum: ['+x', '-x'], description: 'Which way the torque vector points along the shaft axis (right-hand rule).' },
      label: { type: 'string', description: 'Plain text, e.g. T = 5 kN·m, T_A, or T (reaction).' },
      reaction: { type: 'boolean', description: 'true for a support reaction torque.' },
    }, required: ['at', 'dir', 'label', 'reaction'], additionalProperties: false } },
    cuts: { type: 'array', description: 'Shaft only (else empty): where the shaft is cut to find an internal torque.', items: { type: 'object', properties: { at: AT, label: { type: 'string', description: 'e.g. cut 1, or empty.' } }, required: ['at', 'label'], additionalProperties: false } },
    section: { type: 'object', description: 'Shaft only: the cross-section with its shear stress, linear in r. show false for a beam, or when stress is not asked.', properties: {
      show: { type: 'boolean' },
      outer: { type: 'number', description: 'Outside diameter, mm.' },
      inner: { type: 'number', description: 'Bore diameter, mm; 0 when solid.' },
      tauOuter: { type: 'string', description: 'Stress at the outside, e.g. τmax = 75 MPa, or τmax.' },
      tauInner: { type: 'string', description: 'Stress at the bore, e.g. τi = 52.5 MPa; empty when solid.' },
    }, required: ['show', 'outer', 'inner', 'tauOuter', 'tauInner'], additionalProperties: false },
  },
  required: ['kind', 'length', 'supports', 'loads', 'reactions', 'segments', 'torques', 'cuts', 'section'],
  additionalProperties: false,
};
// Worked first, shown second: the AI solves and checks in `work` (never shown, dropped before saving), so the
// solution the student reads is the settled one, not the AI changing its mind halfway through.
const WORK = { type: 'string', description: 'Private scratch working, never shown to the student. Solve it fully here first, then check it: every step, the units, the order of magnitude, and the final answer by a second route where there is one. Fix any mistake here, before writing the other fields. Keep it brief.' };
const CLEAN = 'The fields after work are the clean, final, checked solution: write them only once work is settled. Never think aloud in them: no "wait", "actually", "let me recheck", "correction", no second attempt and nothing that contradicts an earlier step.';
const SOLUTION_FIELDS = {
  work: WORK,
  given: { type: 'array', items: { type: 'string' }, description: 'The data, each with its symbol and converted to SI, e.g. $D = 250\\text{ mm} = 0.25\\text{ m}$.' },
  find: { type: 'string', description: 'What is asked, in one line.' },
  assumptions: { type: 'array', items: { type: 'string' }, description: 'The assumptions the method rests on, each under 15 words (e.g. linear-elastic material, so τ = Gγ). Empty when there are none worth saying.' },
  fbd: { type: 'string', description: 'FBD reasoning in one to three sentences: what is drawn and why, the sign convention, and the equilibrium equation that gives the reactions. An empty string when the question has no forces on a body: never a note saying a diagram is not needed.' },
  diagram: FBD_SCHEMA,
  method: { type: 'string', description: 'The idea in two or three plain sentences: which principle and why it applies here.' },
  steps: { type: 'array', description: 'The working, one equation per step, in order, carrying 4-5 significant figures.', items: { type: 'object', properties: {
    math: { type: 'string', description: 'One equation in LaTeX with no $ signs: the formula, then the numbers substituted, then the result with its unit, e.g. J = \\frac{\\pi}{32}(0.25^4 - 0.175^4) = 2.9143 \\times 10^{-4}\\ \\text{m}^4' },
    reason: { type: 'string', description: 'Why this line, in 2 to 5 words, e.g. twist formula, ΣMx = 0, rad to deg, J for a hollow shaft.' },
    note: { type: 'string', description: 'One short plain sentence when the step needs explaining (a choice, a trap, a conversion); else empty.' },
  }, required: ['math', 'reason', 'note'], additionalProperties: false } },
  answer: { type: 'string', description: 'The final answer, number then unit, plain text, 3 significant figures. Several parts separated by commas.' },
  check: { type: 'string', description: 'A quick check by a second route, the units, or a limiting case, in one or two sentences, with the numbers.' },
  trap: { type: 'string', description: 'The mistake students usually make here, one sentence.' },
  realLife: { type: 'string', description: 'Where this shows up in real engineering, one sentence; empty when nothing apt.' },
};
const HOW_TO_SOLVE = `Write the full worked solution a student can learn from, in the fields given: given, find, assumptions,
the free body diagram (fbd and diagram), the method, the steps, the answer, a check, the usual trap.
Keep the explanations short and plain: a reason on every step, and a note only where a student would get stuck.
Keep each step to one line a phone can show: when substituting makes it long, give the substitution a step of its own.
${CLEAN}
For the diagram: a beam or bar gets every support, load and reaction placed by distance from the left end. A shaft in
torsion is kind shaft: its segments with their diameters, every applied and reaction torque as a vector along the axis,
a cut where an internal torque is found, and the section with its stress when stress is asked. Otherwise kind none
with empty lists and section show false.`;

// Several questions solved in one call (2 to 4, sized by the caller): items [{ id, topic, question, expected }],
// schemes (marking-scheme text shared by the batch). Returns { solutions: [{ id, ...SOLUTION_FIELDS }] }.
export async function explainSolutions({ unit, items, schemes = [], maxTokens = 16000 }) {
  const schema = {
    type: 'object',
    properties: { solutions: { type: 'array', description: 'One solution per question, in the order given.', items: { type: 'object', properties: { id: { type: 'string', description: 'The question id exactly as given.' }, ...SOLUTION_FIELDS }, required: ['id', ...Object.keys(SOLUTION_FIELDS)], additionalProperties: false } } },
    required: ['solutions'],
    additionalProperties: false,
  };
  const content = [
    `Unit: ${unit}`,
    schemes.length ? `Marking scheme material. Follow it, and do not contradict its answers:\n${schemes.join('\n\n')}` : '',
    ...items.map((x) => `Question id ${x.id}${x.topic ? ` (topic: ${x.topic})` : ''}:\n${x.question}${x.expected ? `\nThe answer key says the final answer is ${x.expected}. Your solution must reach it.` : ''}`),
    `Solve every question above, each on its own. For each one: ${HOW_TO_SOLVE}`,
  ].filter(Boolean).join('\n\n');
  return structured(schema, TUTOR, content, maxTokens);
}

export async function explainSolution({ unit, topic = '', question, expected = '', scheme = '' }) {
  const schema = { type: 'object', properties: SOLUTION_FIELDS, required: Object.keys(SOLUTION_FIELDS), additionalProperties: false };
  const content = [
    `Unit: ${unit}${topic ? `\nTopic: ${topic}` : ''}`,
    scheme ? `Marking scheme material. Follow it, and do not contradict its answers:\n${scheme}` : '',
    expected ? `The answer key says the final answer is ${expected}. Your solution must reach it.` : '',
    `Question:\n${question}`,
    HOW_TO_SOLVE,
  ].filter(Boolean).join('\n\n');
  return structured(schema, TUTOR, content, 12000);
}

// "Ask about this": a follow-up on one question and its worked solution ("why this formula and not that one?",
// "explain step 3"). history: [{ role: 'student' | 'tutor', text }], the last one the student's new question.
export async function followUp({ unit, topic = '', question, solution = '', answer = '', notes = '', history = [] }) {
  const schema = {
    type: 'object',
    properties: {
      work: { ...WORK, description: 'Private scratch thinking, never shown. Work out the answer and check it against the question and the solution before you write the reply.' },
      reply: { type: 'string', description: 'The answer to the student\'s last message, formatted as the system prompt says. Usually under 250 words.' },
    },
    required: ['work', 'reply'],
    additionalProperties: false,
  };
  const content = [
    `Unit: ${unit}${topic ? `\nTopic: ${topic}` : ''}`,
    `Question:\n${question}`,
    solution ? `The worked solution the student is reading:\n${solution}` : '',
    answer ? `Final answer: ${answer}` : '',
    notes ? `From the unit's notes and books (use their symbols and methods where they fit):\n${notes}` : '',
    `The conversation so far:\n${history.map((m) => `${m.role === 'tutor' ? 'Tutor' : 'Student'}: ${m.text}`).join('\n\n')}`,
    `Answer the student's last message about this question as their tutor. When they ask why one formula or method and not another, say what each assumes and when each applies, then why this question needs this one. When they ask you to explain a step, go through it slowly with the numbers. If the worked solution has a mistake, say so plainly and give the correction. ${CLEAN.replace('The fields after work are', 'The reply is')}`,
  ].filter(Boolean).join('\n\n');
  return structured(schema, TUTOR, content, 4000);
}

// Study material matched to the stage (Phase 10). kind: 'ladder' (Adequate Prep: worked → faded → solo, plus
// teach-back prompts), 'recipes' (1-Week Mode: solving recipes and shortcuts for the top predicted topics) or 'sheet'
// (Last-Minute / Exam-Eve: a one-page formula and shortcut sheet with the student's own traps).
const STEP = { type: 'array', items: { type: 'string' } };
const KIT_SCHEMA = {
  ladder: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      worked: { type: 'object', properties: { problem: { type: 'string' }, steps: { ...STEP, description: '4-7 steps, each written out with the equation, the substituted numbers and SI units. Do not number them.' }, answer: { type: 'string' } }, required: ['problem', 'steps', 'answer'], additionalProperties: false },
      faded: {
        type: 'object',
        description: 'A close variant of the worked problem with the same number of steps (not numbered). About half are left for the student (blank=true shows only the hint), the later ones more than the early ones.',
        properties: { problem: { type: 'string' }, steps: { type: 'array', items: { type: 'object', properties: { text: { type: 'string', description: 'The full step (the answer to a blank).' }, hint: { type: 'string', description: 'What to do in this step, without the result.' }, blank: { type: 'boolean' } }, required: ['text', 'hint', 'blank'], additionalProperties: false } }, answer: { type: 'string' } },
        required: ['problem', 'steps', 'answer'], additionalProperties: false,
      },
      solo: { type: 'object', properties: { problem: { type: 'string', description: 'KU CAT style, a different situation using the same method.' }, answer: { type: 'string', description: 'Final answer with units only.' } }, required: ['problem', 'answer'], additionalProperties: false },
      teachPrompts: { ...STEP, description: '3 teach-back prompts: explain-why questions a classmate would ask about this topic.' },
    },
    required: ['title', 'worked', 'faded', 'solo', 'teachPrompts'],
    additionalProperties: false,
  },
  recipes: {
    type: 'object',
    properties: {
      recipes: {
        type: 'array',
        description: 'One recipe per question type the listed topics produce in KU past papers, at most 5.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The question type, e.g. "Principal stresses from a stress element".' },
            when: { type: 'string', description: 'How to recognise it in a question.' },
            steps: { ...STEP, description: '3-7 standard solving steps.' },
            shortcut: { type: 'string' },
            trap: { type: 'string', description: 'The mistake that costs marks here.' },
            tryIt: { type: 'string', description: 'One short exam-style question to try, with numbers.' },
          },
          required: ['name', 'when', 'steps', 'shortcut', 'trap', 'tryIt'],
          additionalProperties: false,
        },
      },
    },
    required: ['recipes'],
    additionalProperties: false,
  },
  sheet: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      formulas: {
        type: 'array',
        description: 'Every formula the listed questions need (usually 15-30), grouped by topic in outline order: the core ones each topic rests on, AND the ones only particular questions use (a derived result, a special case, a table value, a geometric relation). Read every question listed and include what solving it takes.',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'The topic it belongs to, as named in the list of topics.' },
            name: { type: 'string' },
            formula: { type: 'string', description: 'In LaTeX inside $...$.' },
            symbols: { type: 'string', description: 'Each symbol with its SI unit, short, symbols in $...$.' },
            notWhen: { type: 'string', description: 'When this formula does NOT apply, or its assumptions.' },
            usedIn: { type: 'array', items: { type: 'string' }, description: 'The listed questions that use it, by their label exactly as given (e.g. "CAT 1 2023 Q2b"). Empty if none of them do.' },
            special: { type: 'boolean', description: 'true when only particular questions need it (not a core formula of the topic): say which in usedIn.' },
          },
          required: ['topic', 'name', 'formula', 'symbols', 'notWhen', 'usedIn', 'special'],
          additionalProperties: false,
        },
      },
      conventions: { ...STEP, description: 'At most 5 sign conventions and unit checks.' },
      shortcuts: { ...STEP, description: 'At most 5 shortcuts.' },
      traps: { ...STEP, description: 'At most 5 warnings, starting with the student\'s own recurring mistakes when given.' },
    },
    required: ['title', 'formulas', 'conventions', 'shortcuts', 'traps'],
    additionalProperties: false,
  },
};

export async function makeKit({ kind, unit, topic = '', focus = [], subtopics = [], traps = [], context = '', questions = '' }) {
  const content = [
    `Unit: ${unit}`,
    topic && `Topic: ${topic}`,
    focus.length && `Most likely exam topics: ${focus.join('; ')}`,
    subtopics.length && `The student's sub-topics (with their self-rating): ${subtopics.join('; ')}`,
    traps.length && `The student's recurring mistakes (warn about these first): ${traps.join('; ')}`,
    context && `\nThe student's course material — use THIS course's notation and methods:\n${context}`,
    questions && `\nThis unit's past-paper and CAT questions on these topics (label: question). The sheet must cover every formula they need, and say which questions use each:\n${questions}`,
  ].filter(Boolean).join('\n');
  return structured(KIT_SCHEMA[kind], TUTOR, content, kind === 'sheet' ? 14000 : 8000);
}

// Phase 9: a photo of handwritten working → what is on it, transcribed, not corrected.
export async function readWorking({ unit, question, image }) {
  const schema = {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'false if the photo is unreadable or is not working for this question' },
      finalAnswer: { type: 'string', description: 'The final answer exactly as the student wrote it, with its unit. Empty if there is none.' },
      steps: { type: 'array', items: { type: 'string' }, description: 'Each step of the working in order, as written: the equation, the substituted numbers, the value with units.' },
      note: { type: 'string', description: 'What was hard to read, if anything. Empty otherwise.' },
    },
    required: ['readable', 'finalAnswer', 'steps', 'note'],
    additionalProperties: false,
  };
  const content = `Unit: ${unit}\nQuestion:\n${question}\n\nThe image is the student's handwritten working for this question. Transcribe it faithfully: every step in order, and the final answer with its unit exactly as written. Do NOT correct mistakes and do NOT solve it yourself; a wrong value must stay wrong in your transcription.`;
  return structured(schema, TUTOR, content, 3000, [image]);
}

// The student's written steps against the key's checkpoints: the first checkpoint their working disagrees with.
export async function compareWorking({ question, steps, checkpoints, expected }) {
  const schema = {
    type: 'object',
    properties: {
      brokeAt: { type: 'integer', description: 'The number of the first checkpoint the student\'s working disagrees with, or 0 if it matches all of them.' },
      errorType: { type: 'string', enum: ERROR_TYPES.map((e) => e.id) },
      why: { type: 'string', description: 'One sentence: what the student wrote at that step versus what the checkpoint does.' },
    },
    required: ['brokeAt', 'errorType', 'why'],
    additionalProperties: false,
  };
  const content = `Question:\n${question}\n\nCorrect final answer: ${expected}\n\nCheckpoints of a correct solution:\n${checkpoints.map((c) => `${c.n}. ${c.step}${c.equation ? `: ${c.equation}` : ''}${c.value ? ` = ${c.value}` : ''}`).join('\n')}\n\nThe student's working, step by step:\n${steps.map((s, i) => `(${i + 1}) ${s}`).join('\n')}\n\nFind the FIRST checkpoint where the student's working goes wrong (a different equation, sign, unit or value), and name the kind of mistake.`;
  return structured(schema, TUTOR, content, 1000);
}

// Phase 9: a spoken teach-back → its transcript (marked afterwards like a typed one).
export async function transcribe({ topic, audio }) {
  const schema = {
    type: 'object',
    properties: {
      transcript: { type: 'string', description: 'What the student said, word for word, with equations written as plain text (^ and _).' },
      clear: { type: 'boolean', description: 'false if the recording is silent, too noisy or not about the topic' },
    },
    required: ['transcript', 'clear'],
    additionalProperties: false,
  };
  return structured(schema, TUTOR, `The recording is a student explaining "${topic}" out loud, as if teaching a classmate. Transcribe it faithfully. Do not improve or correct what they say.`, 4000, [audio]);
}

// A topic's study guide (server/guide.js): what the course expects, sub-topic by sub-topic, with the exact book
// places to read and what to skip, how the papers examine it, a study order and an "I can…" checklist.
const PLACE = {
  type: 'object',
  properties: {
    book: { type: 'string', description: 'The file name of one of the listed books or notes, exactly as given.' },
    where: { type: 'string', description: 'Chapter, section and page numbers as the book prints them, e.g. "Ch. 3, §3.4-3.6, pp. 112-121". Only places the material shows; never invent a page.' },
    focus: { type: 'string', description: 'What to read there for: the derivation, the worked examples, a table.' },
    page: { type: 'integer', description: 'The PDF page to open it at: a page number from the "pages that mention the topic" list for this book (those are PDF pages), else 0. Never a printed page number.' },
  },
  required: ['book', 'where', 'focus', 'page'],
  additionalProperties: false,
};
const GUIDE_SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string', description: 'What the topic is and why it matters in this unit, 2-3 sentences.' },
    outline: {
      type: 'array',
      description: 'The whole topic broken into its sub-topics (usually 4-8), in the order to learn them.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          expect: { type: 'string', description: 'What the course expects you to be able to do, as an outcome: "Derive…", "Calculate…", "Sketch…".' },
          formulas: { type: 'array', items: { type: 'string' }, description: 'The key formulas, each in LaTeX with $...$, with what the symbols mean. Empty if none.' },
          read: { type: 'array', items: PLACE, description: '1-3 places in the listed books to read for it, best first.' },
          skip: { type: 'string', description: 'What the books cover here that this course does not need, or an empty string.' },
        },
        required: ['name', 'expect', 'formulas', 'read', 'skip'],
        additionalProperties: false,
      },
    },
    exam: { type: 'string', description: 'How the past papers examine this topic: question types, typical marks, what keeps coming back. Say so if there are no papers on it.' },
    plan: { type: 'array', items: { type: 'string' }, description: '4-7 study steps in order, each one line, e.g. "Read Rajput §1.4 for the idea, then do Examples 1.1-1.3."' },
    checklist: { type: 'array', items: { type: 'string' }, description: '5-10 "I can…" statements to tick off before the exam.' },
  },
  required: ['overview', 'outline', 'exam', 'plan', 'checklist'],
  additionalProperties: false,
};
export async function makeGuide({ unit, title = '', topic, subtopics = [], outline = '', pages = '', contents = '', questions = '', books = [] }) {
  const content = [
    `Unit: ${unit}${title ? ` ${title}` : ''}\nTopic: ${topic}`,
    subtopics.length ? `Sub-topics the student has listed so far (often incomplete: cover the whole topic as the course outline and papers set it, including these):\n${subtopics.map((s) => `- ${s}`).join('\n')}` : '',
    outline ? `Course outline (what the course covers; follow it over the books):\n${outline}` : 'There is no course outline on file: go by the past papers and standard coverage at this level.',
    questions ? `Past-paper and CAT questions on this topic:\n${questions}` : '',
    books.length ? `The student's books and notes for this unit:\n${books.map((b) => `- ${b}`).join('\n')}` : '',
    pages ? `Pages in those books that mention the topic (file, page, a line from the page):\n${pages}` : '',
    contents ? `The opening pages of each book (usually the contents, with chapters and page numbers):\n${contents}` : '',
    `Write a study guide for this topic that tells the student exactly what to learn and where to find it in their own books, so they don't read 500 pages to find 20. Point only to the books listed, with places you can see in the contents or page lines above; when you can't place something, name the chapter or section heading to look for instead of guessing a page. Keep the course outline's scope: say what to skip.`,
  ].filter(Boolean).join('\n\n');
  return structured(GUIDE_SCHEMA, TUTOR, content, 8000);
}
