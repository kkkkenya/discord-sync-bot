// The three daily posts in #general-chat. Each one opens a thread with a discussion question, and the bot
// answers people in those threads.
import UNITS from '../../lib/units.json' with { type: 'json' };
import { latestArticles, latestVideos } from './feeds.js';
import { askJson } from './gemini.js';
import { save, state } from './state.js';

const LETTERS = 'ABCD';
const NONE = { parse: [] };
const pick = (list) => list[Math.floor(Math.random() * list.length)];

async function openThread(msg, name, question) {
  const thread = await msg.startThread({ name: name.slice(0, 95), autoArchiveDuration: 1440 });
  await thread.send({ content: question, allowedMentions: NONE });
  state.threads.push(thread.id);
  save();
  return thread;
}

// ── trivia: a 4-choice question from one of the KU units ──
export async function postTrivia(channel) {
  const fresh = UNITS.filter((u) => !state.units.includes(u.codes[0]));
  const unit = pick(fresh.length ? fresh : UNITS);
  const q = await askJson(
    `Write one fun engineering trivia question for KU students, on the unit ${unit.codes.join(' / ')} "${unit.title}". It can be a quick concept check, a real-world "why does this happen" question, or a short calculation (under 2 minutes). Exactly 4 choices, with tempting wrong ones. explanation: 2 to 4 sentences on why the answer is right, with the working if there is any. discussion: one open question that gets people talking about it.`,
    {
      type: 'OBJECT',
      properties: {
        question: { type: 'STRING' }, choices: { type: 'ARRAY', items: { type: 'STRING' } },
        answer: { type: 'INTEGER' }, explanation: { type: 'STRING' }, discussion: { type: 'STRING' },
      },
      required: ['question', 'choices', 'answer', 'explanation', 'discussion'],
    },
  );
  if (!Array.isArray(q.choices) || q.choices.length !== 4 || !(q.answer >= 0 && q.answer <= 3)) throw new Error('Gemini gave a malformed question');
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5); // so the answer isn't always B
  const choices = order.map((n) => q.choices[n]);
  const answer = order.indexOf(q.answer);

  const msg = await channel.send({
    content: [`🧠 **Engineering trivia · ${unit.codes[0]} ${unit.title}**`, '', q.question.slice(0, 900), '',
      ...choices.map((c, n) => `**${LETTERS[n]})** ${c.slice(0, 150)}`), '', '_Tap your answer. The answer and the working come out at 4 pm._'].join('\n'),
    components: [{ type: 1, components: choices.map((_, n) => ({ type: 2, style: 1, label: LETTERS[n], custom_id: `trivia:${n}` })) }],
    allowedMentions: NONE,
  });
  const thread = await openThread(msg, `Trivia: ${unit.title}`, `💬 ${q.discussion}`);
  state.trivia = { messageId: msg.id, threadId: thread.id, answer, choices, explanation: q.explanation, votes: {}, revealed: false };
  state.units.push(unit.codes[0]);
  save();
}

export async function recordVote(interaction) {
  const t = state.trivia;
  if (!t || t.revealed || interaction.message.id !== t.messageId) return interaction.reply({ content: "This one's closed. Watch for tomorrow's question!", ephemeral: true });
  if (t.votes[interaction.user.id] !== undefined) return interaction.reply({ content: `You already locked in **${LETTERS[t.votes[interaction.user.id]]}**. Answer at 4 pm.`, ephemeral: true });
  t.votes[interaction.user.id] = Number(interaction.customId.split(':')[1]);
  save();
  return interaction.reply({ content: `Locked in **${LETTERS[t.votes[interaction.user.id]]}**. The answer comes out at 4 pm in the thread.`, ephemeral: true });
}

export async function revealTrivia(channel) {
  const t = state.trivia;
  if (!t || t.revealed) return;
  const voters = Object.entries(t.votes);
  const right = voters.filter(([, v]) => v === t.answer).map(([id]) => id);
  const thread = await channel.client.channels.fetch(t.threadId).catch(() => null);
  const text = [
    `✅ **Answer: ${LETTERS[t.answer]}) ${t.choices[t.answer]}**`, t.explanation, '',
    voters.length ? `${right.length} of ${voters.length} got it.${right.length ? ` 🎉 ${right.slice(0, 15).map((id) => `<@${id}>`).join(' ')}` : ''}` : 'Nobody answered this one. Tomorrow!',
  ].join('\n').slice(0, 2000);
  await (thread || channel).send({ content: text, allowedMentions: { users: right.slice(0, 15) } });
  const msg = await channel.messages.fetch(t.messageId).catch(() => null);
  if (msg) await msg.edit({ components: [] }).catch(() => {});
  t.revealed = true;
  save();
}

// ── a new video from one of the engineering channels ──
export async function postVideo(channel) {
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
  const videos = (await latestVideos()).filter((v) => !state.videos.includes(v.id) && v.published >= monthAgo);
  if (!videos.length) return;
  const v = videos[0];
  const p = await askJson(
    `Engineering students will see this YouTube video in the server chat.\nChannel: ${v.channel}\nTitle: ${v.title}\nDescription: ${v.description}\n\nhook: one or two sentences on why it's worth watching, linking it to what KU engineering students study (name the unit topic if one fits). discussion: one question that gets people debating or explaining it. Don't repeat the title.`,
    { type: 'OBJECT', properties: { hook: { type: 'STRING' }, discussion: { type: 'STRING' } }, required: ['hook', 'discussion'] },
  );
  const msg = await channel.send({ content: `🎬 **${v.channel}: ${v.title}**\n${p.hook}\nhttps://youtu.be/${v.id}`, allowedMentions: NONE });
  await openThread(msg, `Video: ${v.title}`, `💬 ${p.discussion}`);
  state.videos.push(v.id);
  save();
}

// ── an article: Gemini picks the one most relevant to undergrads out of the newest ──
export async function postArticle(channel) {
  const fresh = (await latestArticles()).filter((a) => !state.articles.includes(a.link)).slice(0, 30);
  if (!fresh.length) return;
  const p = await askJson(
    `Here are new engineering articles and papers. Pick the ONE most interesting and understandable for KU engineering undergraduates (practical, surprising, or tied to what they study), then write about it.\n\n${fresh.map((a, n) => `[${n}] (${a.source}) ${a.title}\n${a.summary}`).join('\n\n')}\n\nindex: the number you picked. summary: 2 or 3 plain sentences on what they found and why it matters, no jargon left unexplained. discussion: one question to start a debate.`,
    { type: 'OBJECT', properties: { index: { type: 'INTEGER' }, summary: { type: 'STRING' }, discussion: { type: 'STRING' } }, required: ['index', 'summary', 'discussion'] },
  );
  const a = fresh[p.index] || fresh[0];
  const msg = await channel.send({ content: `📰 **${a.title}** (${a.source})\n${p.summary}\n${a.link}`, allowedMentions: NONE });
  await openThread(msg, `Article: ${a.title}`, `💬 ${p.discussion}`);
  state.articles.push(a.link);
  save();
}
