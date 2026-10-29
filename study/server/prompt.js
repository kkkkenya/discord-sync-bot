// Prompt builder: turns a purpose + unit/topic into a self-contained prompt you can paste into ChatGPT, Gemini,
// DeepSeek or any other chat, grounded in the synced context library so the output matches your actual course.
import { contextFor } from './ingest.js';

const PERSONA = 'You are a tough but fair Mechanical Engineering tutor at Kenyatta University, coaching a 3rd-year student for CATs and exams. Be specific and technically correct at KU CAT level: name the exact equations, sign conventions, assumptions and units. Use ^ and _ for powers and subscripts; plain text, no markdown. Always ask for a free-body diagram or sketch wherever one applies.';

const TEMPLATES = {
  mock: ({ unit, topic, count }) => `Write ${count || 5} closed-book CAT-style exam questions for ${unit}${topic ? ` on ${topic}` : ''}. Mix derivations, numericals and "explain why" the way a KU CAT does. Each question needs a mark count (5-20) and a concise model answer with the working shown step by step.`,
  teach: ({ unit, topic }) => `Teach me ${topic || 'this topic'} (${unit}) as if I'm a classmate who missed the lecture. Cover: what it is, the key equation and what every term means, when it applies and when it doesn't, one worked example, and 3 common mistakes. Then ask me 3 questions to check I understood, and tell me what I got wrong.`,
  ladder: ({ unit, topic }) => `For ${topic || 'a numerical topic'} in ${unit}, give me a 3-step practice ladder:\n1. A fully worked example (every step, plus the reason for each step).\n2. The same type of problem with different numbers, with some steps blanked for me to fill in.\n3. A fresh problem I solve alone. Then mark my answer step by step, giving method marks as well as the final answer.`,
  formula: ({ unit }) => `Build a formula sheet for ${unit}: every key formula, what each symbol means, its units, and when the formula does NOT apply. Plain text, clean enough to print.`,
  paper: ({ unit }) => `Here is a past paper for ${unit}. Split it into its questions, give each question its marks, and name the topic each question tests. Then list the topics by total marks, highest first, so I know what to revise.`,
  dump: ({ unit, topic }) => `Give me 5 quick self-test questions on ${topic || 'the key topics'} in ${unit} — no answers yet. I'll answer from memory first.`,
  why: ({ unit, topic }) => `Ask me 6-10 understanding questions on ${topic || 'the key topics'} in ${unit}, one at a time, and wait for my answer before the next: why (why does this hold?), when-not (when does it break?), derive (from first principles), units (check the units), trap (a common mistake). Mark each answer and name the exact gap.`,
};

export function buildPrompt({ kind, unit, topic, notes = '', count }) {
  const template = TEMPLATES[kind];
  const instruction = template ? template({ unit, topic, count }) : (notes || '').trim();
  const context = unit ? contextFor(unit, topic) : '';
  const parts = [PERSONA];
  if (unit) parts.push(topic ? `Unit: ${unit}, topic: ${topic}.` : `Unit: ${unit}.`);
  if (context) parts.push(`Material from my course — base your answer on THIS, not general knowledge:\n${context}`);
  if (template && notes && notes.trim()) parts.push(`My notes (this is what to work from):\n${notes.trim()}`);
  parts.push(instruction);
  return { prompt: parts.filter(Boolean).join('\n\n'), contextChars: context.length };
}
