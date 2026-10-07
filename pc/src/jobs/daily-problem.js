// The daily practice problem. Each morning: reveal yesterday's worked answer, then pick a past paper from the
// library, have Claude turn one of its questions into a 4-choice problem, and post it with answer buttons.
// Answers, streaks and points are handled on Vercel (lib/commands.js) so they work while this PC is off.
import Anthropic from '@anthropic-ai/sdk';
import { CALENDAR, CHANNELS, GUILD_ID } from '../../../lib/config.js';
import { db } from '../../../lib/db.js';
import { fmtDay, isoDay } from '../../../lib/discord.js';
import { pdfInfo } from '../uploader/extract.js';

const DAY = 24 * 3600 * 1000;
const LETTERS = 'ABCD';
const jump = (c, m) => `https://discord.com/channels/${GUILD_ID}/${c}/${m}`;
let client; // created on first use, after pc/.env is loaded

const SYSTEM = 'You write daily practice problems for Engineering Study Hub, a Discord community of engineering students at Kenyatta University (KU), Kenya. Students answer by tapping A, B, C or D, and a worked solution is posted the next morning.';

const TASK = (code) => `This is a KU past paper for ${code}. Pick one question from it (or one part of a longer question) that a student could work through in about five minutes, and turn it into a multiple-choice problem.

- Stay faithful to the paper's topic and level. If the question has no numbers, make the problem conceptual.
- Give exactly 4 choices. Make the wrong ones the answers students actually get from common mistakes (wrong units, a sign error, a missed factor), so they're tempting rather than silly.
- Work the answer out carefully and check it; the correct choice has to be right.
- Discord can't show LaTeX, so write maths in plain text with Unicode: x², √, π, Δ, θ, ≤, ×, ½, and units with a space (12.5 kN).
- question: under 900 characters. Each choice: under 80 characters. solution: a worked answer in 3 to 6 short steps, under 700 characters.
- unit_title: the unit's name as printed on the paper, or an empty string if it isn't shown.
- If the paper is unreadable or has no question that works, set usable to false and leave the other fields short.`;

const SCHEMA = {
  type: 'object',
  properties: {
    usable: { type: 'boolean' },
    unit_title: { type: 'string' },
    question: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' } },
    answer: { type: 'integer', enum: [0, 1, 2, 3] },
    solution: { type: 'string' },
  },
  required: ['usable', 'unit_title', 'question', 'choices', 'answer', 'solution'],
  additionalProperties: false,
};

async function askClaude(code, source) {
  client ||= new Anthropic();
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // if the main model declines, the API retries on a fallback model in the same call
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: [source, { type: 'text', text: TASK(code) }] }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude declined this paper');
  if (response.stop_reason === 'max_tokens') throw new Error('the answer was cut off');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const p = JSON.parse(text);
  if (!p.usable || !Array.isArray(p.choices) || p.choices.length !== 4 || !(p.answer >= 0 && p.answer <= 3) || !p.question) return null;
  return p;
}

// Shuffle so the right answer isn't always in the same place.
function shuffle(p) {
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  return { ...p, choices: order.map((n) => p.choices[n]), answer: order.indexOf(p.answer) };
}

async function problemFrom(ctx, f) {
  const channel = await ctx.client.channels.fetch(f.channel_id);
  const msg = await channel.messages.fetch(f.message_id);
  const att = msg.attachments.first();
  if (!att) return null;
  const buf = Buffer.from(await (await fetch(att.url)).arrayBuffer());
  const isPdf = /\.pdf$/i.test(att.name);
  let source;
  if (isPdf && buf.length <= 20 * 1024 * 1024) {
    // send the PDF itself: Claude reads scanned papers too
    source = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } };
  } else if (isPdf) {
    const { text } = await pdfInfo(buf, 4);
    if (text.length < 300) return null;
    source = { type: 'text', text: `Past paper text (first pages):\n${text}` };
  } else return null;
  const p = await askClaude(f.unit_code, source);
  return p && shuffle(p);
}

export function countdownLine(day = isoDay(new Date())) {
  const today = Date.parse(`${day}T00:00:00+03:00`);
  for (const e of [...CALENDAR.cats, CALENDAR.exams]) {
    const days = Math.round((Date.parse(`${e.start}T00:00:00+03:00`) - today) / DAY);
    if (CALENDAR.countdownDays.includes(days)) return `⏳ **${days} day${days === 1 ? '' : 's'} to ${e.name}** (${fmtDay(new Date(`${e.start}T09:00:00+03:00`))})`;
  }
  return '';
}

async function revealPrevious(ctx) {
  const open = await db.select('problems', `revealed=eq.false&day=lt.${isoDay(new Date())}&message_id=not.is.null`);
  for (const p of open) {
    const answers = await db.select('answers', `problem_id=eq.${p.id}&select=correct`);
    const right = answers.filter((a) => a.correct).length;
    const daily = ctx.setup.channels.dailyChannel;
    await daily.send({
      content: [
        `✅ **Answer to ${p.unit_code}: ${LETTERS[p.answer]}) ${p.choices[p.answer]}**`,
        p.solution,
        '',
        answers.length ? `${right} of ${answers.length} got it right.` : 'Nobody answered this one. Today\'s is below 👇',
      ].join('\n').slice(0, 2000),
      reply: { messageReference: p.message_id, failIfNotExists: false },
      allowedMentions: { parse: [] },
    });
    // close the answer buttons, keep the ping toggle
    const msg = await daily.messages.fetch(p.message_id).catch(() => null);
    if (msg) await msg.edit({ components: msg.components.slice(1) }).catch(() => {});
    await db.update('problems', `id=eq.${p.id}`, { revealed: true });
  }
}

export async function runDailyProblem(ctx) {
  const today = isoDay(new Date());
  if ((await db.select('problems', `day=eq.${today}&select=id`)).length) return; // already posted today
  await revealPrevious(ctx);

  const recent = new Set((await db.select('problems', 'select=unit_code&order=day.desc&limit=14')).map((r) => r.unit_code));
  const papers = await db.select('files', `kind=eq.paper&unit_code=not.is.null&channel_id=neq.${CHANNELS.toSort}&select=id,name,unit_code,channel_id,message_id&limit=5000`);
  if (!papers.length) { ctx.log('🧠 Daily problem skipped: there are no past papers in the library yet.'); return; }
  const fresh = papers.filter((f) => !recent.has(f.unit_code));
  const pool = (fresh.length ? fresh : papers).sort(() => Math.random() - 0.5);

  for (const f of pool.slice(0, 5)) {
    let p;
    try { p = await problemFrom(ctx, f); } catch (e) { ctx.log(`🧠 Daily problem: skipped ${f.name} (${e.message})`); continue; }
    if (!p) continue;

    const [row] = await db.insert('problems', [{
      day: today, unit_code: f.unit_code, source_file_id: f.id,
      question: p.question, choices: p.choices, answer: p.answer, solution: p.solution,
    }]);
    const role = ctx.setup.roles.dailyRole;
    const msg = await ctx.setup.channels.dailyChannel.send({
      content: [
        `<@&${role.id}> 🧠 **Daily problem · ${f.unit_code}${p.unit_title ? ` ${p.unit_title}` : ''}**`,
        '',
        p.question.slice(0, 1000),
        '',
        ...p.choices.map((c, n) => `**${LETTERS[n]})** ${c.slice(0, 100)}`),
        '',
        `Based on [a ${f.unit_code} past paper](${jump(f.channel_id, f.message_id)}). Tap your answer; the worked solution comes out tomorrow morning.`,
        countdownLine(today),
      ].join('\n').trim().slice(0, 2000),
      components: [
        { type: 1, components: p.choices.map((_, n) => ({ type: 2, style: 1, label: LETTERS[n], custom_id: `dp:ans:${row.id}:${n}` })) },
        { type: 1, components: [{ type: 2, style: 2, label: '🔔 Daily ping on/off', custom_id: 'dp:role' }] },
      ],
      allowedMentions: { roles: [role.id] },
    });
    await db.update('problems', `id=eq.${row.id}`, { channel_id: msg.channelId, message_id: msg.id });
    return;
  }
  ctx.log('🧠 Daily problem skipped: none of the 5 past papers tried gave a usable question.');
}
