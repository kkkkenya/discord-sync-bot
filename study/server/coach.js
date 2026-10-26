// Teach-back feedback: you explain a topic as if teaching a classmate, the AI marks it like a tough tutor and
// hands back recall cards for the gaps. Uses the shared ai.js helper, so it follows the provider toggle.
import { aiReady, structured } from './ai.js';

export const coachReady = () => aiReady();

const SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', description: '1-5: could a classmate pass a CAT question on this from your explanation alone?' },
    good: { type: 'string', description: 'One sentence on what the explanation got right.' },
    gaps: { type: 'array', items: { type: 'string' }, description: 'Missing steps, wrong statements or vague bits, most important first. At most 4.' },
    followUp: { type: 'string', description: 'One probing question a lecturer would ask next, to answer from memory.' },
    cards: {
      type: 'array',
      items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } }, required: ['q', 'a'], additionalProperties: false },
      description: '2-4 short recall cards that target the gaps. Questions answerable in a line or a short working.',
    },
  },
  required: ['score', 'good', 'gaps', 'followUp', 'cards'],
  additionalProperties: false,
};

const SYSTEM = `You coach a 3rd-year Mechanical Engineering student at Kenyatta University preparing for CATs.
They practise the Feynman technique: they explain a topic in their own words as if teaching a classmate.
Judge the explanation for technical correctness and completeness at the level of a KU CAT question.
Be direct and specific: name the exact equation, sign convention, assumption or step that is missing or wrong.
Do not rewrite their explanation for them. Plain text, no markdown. Use ^ and _ for powers and subscripts.`;

export async function coach({ unit, topic, text }) {
  if (!coachReady()) throw new Error('No AI key for the selected provider. Pick another provider in the top bar, or add the key.');
  return structured(SCHEMA, SYSTEM, `Unit: ${unit}\nTopic: ${topic}\n\nMy explanation:\n${text}`, 4000);
}
