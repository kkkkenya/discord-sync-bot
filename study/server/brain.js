// Turns study material into CAT-style questions, and marks mock-exam answers.
// All three calls go through the shared structured() helper so they match coach.js behaviour.
import { structured } from './ai.js';
import { ERROR_TYPES } from './defs.js';

const TUTOR = `You are a tough but fair Mechanical Engineering tutor at Kenyatta University, coaching a 3rd-year student
for CATs and exams. Be specific and technically correct at KU CAT level: name the exact equation, sign convention,
assumption or step. Use ^ and _ for powers and subscripts. Plain text, no markdown.`;

const QUESTION = {
  type: 'object',
  properties: { q: { type: 'string' }, a: { type: 'string' }, marks: { type: 'integer' } },
  required: ['q', 'a', 'marks'],
  additionalProperties: false,
};
// A question generated for a specific topic (mock fill): the topic is used for mastery evidence.
const QUESTION_TOPIC = {
  type: 'object',
  properties: { topic: { type: 'string', description: 'The topic name this question belongs to.' }, q: { type: 'string' }, a: { type: 'string' }, marks: { type: 'integer' } },
  required: ['topic', 'q', 'a', 'marks'],
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
export async function suggestTopics({ unit, title = '', have = [], context = '' }) {
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
  const content = `Unit: ${unit} ${title}${have.length ? `\nAlready listed (don't repeat): ${have.join('; ')}` : ''}${context
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
export async function makeQuestions({ unit, topics, count, context = '' }) {
  const schema = {
    type: 'object',
    properties: { questions: { type: 'array', items: QUESTION_TOPIC, description: `${count} CAT-style questions for this unit.` } },
    required: ['questions'],
    additionalProperties: false,
  };
  const topicList = topics.length ? topics.map((t) => `- ${t.name} (${t.status || 'red'})`).join('\n') : '(no topics listed)';
  const content = `Unit: ${unit}${context ? `\n\nMaterial from the student's library — draw the questions from this, especially past papers and CATs:\n${context}` : ''}\n\nTopics the student is working through (put the exact topic name on each question):\n${topicList}\n\nWrite ${count} fresh exam-style questions for this unit, each tagged with its topic, with a model answer and a mark count (5-20).`;
  return structured(schema, TUTOR, content, 8000);
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
    required: ['answer', 'checkpoints'],
    additionalProperties: false,
  };
  const content = [
    `Unit: ${unit}${topic ? `\nTopic: ${topic}` : ''}`,
    subtopics.length ? `Sub-topics (use these names exactly):\n${subtopics.map((n) => `- ${n}`).join('\n')}` : '',
    scheme ? `Marking scheme material. Follow it, and do not contradict its answers:\n${scheme}` : '',
    expected ? `The answer key says the final answer is ${expected}. Make the checkpoints lead to it.` : '',
    `Question:\n${question}`,
    'Solve it in 3 to 6 numbered checkpoints, SI units carried through every step, assumptions and sign convention stated in the first checkpoint. If you are not sure of the final answer, still give your best working.',
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
        description: 'At most 14 formulas, the ones this unit\'s CATs use most.',
        items: { type: 'object', properties: { name: { type: 'string' }, formula: { type: 'string', description: 'Plain text with ^ and _.' }, symbols: { type: 'string', description: 'Each symbol with its SI unit, short.' }, notWhen: { type: 'string', description: 'When this formula does NOT apply.' } }, required: ['name', 'formula', 'symbols', 'notWhen'], additionalProperties: false },
      },
      conventions: { ...STEP, description: 'At most 5 sign conventions and unit checks.' },
      shortcuts: { ...STEP, description: 'At most 5 shortcuts.' },
      traps: { ...STEP, description: 'At most 5 warnings, starting with the student\'s own recurring mistakes when given.' },
    },
    required: ['title', 'formulas', 'conventions', 'shortcuts', 'traps'],
    additionalProperties: false,
  },
};

export async function makeKit({ kind, unit, topic = '', focus = [], subtopics = [], traps = [], context = '' }) {
  const content = [
    `Unit: ${unit}`,
    topic && `Topic: ${topic}`,
    focus.length && `Most likely exam topics: ${focus.join('; ')}`,
    subtopics.length && `The student's sub-topics (with their self-rating): ${subtopics.join('; ')}`,
    traps.length && `The student's recurring mistakes (warn about these first): ${traps.join('; ')}`,
    context && `\nThe student's course material — use THIS course's notation and methods:\n${context}`,
  ].filter(Boolean).join('\n');
  return structured(KIT_SCHEMA[kind], TUTOR, content, 8000);
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
