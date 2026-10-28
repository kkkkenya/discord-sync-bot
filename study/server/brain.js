// Turns study material into CAT-style questions, and marks mock-exam answers.
// All three calls go through the shared structured() helper so they match coach.js behaviour.
import { structured } from './ai.js';

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
