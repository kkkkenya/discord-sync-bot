// The daily posts in #general-chat, sent over Discord's REST API so they work from GitHub Actions with the PC off.
// Each opens a thread with a discussion question; the PC bot (when running) joins in.
import UNITS from '../../lib/units.json' with { type: 'json' };
import { CHANNEL, DEPARTMENTS } from './config.js';
import { latestNews, latestPapers, latestVideos } from './feeds.js';
import { askJson } from './gemini.js';
import { discord, load, nairobiDay, store } from './rest.js';

const LETTERS = ['🇦', '🇧', '🇨', '🇩'];
const NONE = { parse: [] };
const pick = (list) => list[Math.floor(Math.random() * list.length)];

async function post(content, threadName, question, allowed = NONE) {
  const msg = await discord('POST', `/channels/${CHANNEL}/messages`, { content: content.slice(0, 2000), allowed_mentions: allowed });
  const thread = await discord('POST', `/channels/${CHANNEL}/messages/${msg.id}/threads`, { name: threadName.slice(0, 95), auto_archive_duration: 1440 });
  await discord('POST', `/channels/${thread.id}/messages`, { content: `💬 ${question}`, allowed_mentions: NONE });
  return { msg, thread };
}

// Everything already posted lives in one state row, so nothing repeats.
const posted = () => load('posted', { videos: [], links: [], units: [] });
async function remember(kind, value) {
  const p = await posted();
  p[kind] = [...(p[kind] || []), value].slice(-300);
  await store('posted', p);
}

// The department of the day (the paper rotates through them).
export const departmentToday = () => DEPARTMENTS[Math.floor(Date.parse(nairobiDay()) / 864e5) % DEPARTMENTS.length];

export async function trivia() {
  const done = (await posted()).units;
  const fresh = UNITS.filter((u) => !done.includes(u.codes[0]));
  const unit = pick(fresh.length ? fresh : UNITS);
  const q = await askJson(
    `Write one fun engineering trivia question for KU students, on the unit ${unit.codes.join(' / ')} "${unit.title}". It can be a quick concept check, a real-world "why does this happen" question, or a short calculation (under 2 minutes). Exactly 4 choices, with tempting wrong ones. explanation: 2 to 4 sentences on why the answer is right, with the working if there is any. discussion: one open question that gets people talking about it.`,
    { type: 'OBJECT', properties: { question: { type: 'STRING' }, choices: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'INTEGER' }, explanation: { type: 'STRING' }, discussion: { type: 'STRING' } }, required: ['question', 'choices', 'answer', 'explanation', 'discussion'] },
  );
  if (!Array.isArray(q.choices) || q.choices.length !== 4 || !(q.answer >= 0 && q.answer <= 3)) throw new Error('Gemini gave a malformed question');
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5); // so the answer isn't always the same letter
  const choices = order.map((n) => q.choices[n]);
  const { msg, thread } = await post(
    [`🧠 **Engineering trivia · ${unit.codes[0]} ${unit.title}**`, '', q.question.slice(0, 900), '',
      ...choices.map((c, n) => `${LETTERS[n]} ${c.slice(0, 150)}`), '', '_React with your answer (one letter only). Answer and working at 4 pm._'].join('\n'),
    `Trivia: ${unit.title}`, q.discussion,
  );
  for (const e of LETTERS) await discord('PUT', `/channels/${CHANNEL}/messages/${msg.id}/reactions/${encodeURIComponent(e)}/@me`);
  await store('trivia', { messageId: msg.id, threadId: thread.id, answer: order.indexOf(q.answer), choices, explanation: q.explanation, day: nairobiDay() });
  await remember('units', unit.codes[0]);
}

export async function reveal() {
  const t = await load('trivia', null);
  if (!t || t.revealed || t.day !== nairobiDay()) return;
  const me = (await discord('GET', '/users/@me')).id;
  const voters = new Map(); // user -> letters they reacted with
  for (const [n, e] of LETTERS.entries()) {
    const users = await discord('GET', `/channels/${CHANNEL}/messages/${t.messageId}/reactions/${encodeURIComponent(e)}?limit=100`).catch(() => []);
    for (const u of users) if (u.id !== me && !u.bot) voters.set(u.id, [...(voters.get(u.id) || []), n]);
  }
  const right = [...voters].filter(([, v]) => v.length === 1 && v[0] === t.answer).map(([id]) => id); // one letter only
  await discord('POST', `/channels/${t.threadId}/messages`, {
    content: [`✅ **Answer: ${LETTERS[t.answer]} ${t.choices[t.answer]}**`, t.explanation, '',
      voters.size ? `${right.length} of ${voters.size} got it.${right.length ? ` 🎉 ${right.slice(0, 15).map((id) => `<@${id}>`).join(' ')}` : ''}` : 'Nobody answered this one. Tomorrow!'].join('\n').slice(0, 2000),
    allowed_mentions: { users: right.slice(0, 15) },
  });
  await store('trivia', { ...t, revealed: true });
}

export async function video() {
  const seen = (await posted()).videos;
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
  const v = (await latestVideos()).find((x) => !seen.includes(x.id) && x.published >= monthAgo);
  if (!v) return;
  const p = await askJson(
    `Engineering students will see this YouTube video in the server chat.\nChannel: ${v.channel}\nTitle: ${v.title}\nDescription: ${v.description}\n\nhook: one or two sentences on why it's worth watching, linking it to what KU engineering students study (name the unit topic if one fits). discussion: one question that gets people debating or explaining it. Don't repeat the title.`,
    { type: 'OBJECT', properties: { hook: { type: 'STRING' }, discussion: { type: 'STRING' } }, required: ['hook', 'discussion'] },
  );
  await post(`🎬 **${v.channel}: ${v.title}**\n${p.hook}\nhttps://youtu.be/${v.id}`, `Video: ${v.title}`, p.discussion);
  await remember('videos', v.id);
}

// Gemini picks the most relevant item for undergraduates from a list, and writes about it.
async function choose(items, brief) {
  return askJson(
    `${brief}\n\n${items.map((a, n) => `[${n}] (${a.source}) ${a.title}\n${a.summary}`).join('\n\n')}\n\nindex: the number you picked. summary: 2 or 3 plain sentences on what they found and why it matters, with any jargon explained. discussion: one question to start a debate.`,
    { type: 'OBJECT', properties: { index: { type: 'INTEGER' }, summary: { type: 'STRING' }, discussion: { type: 'STRING' } }, required: ['index', 'summary', 'discussion'] },
  );
}

export async function paper() {
  const dept = departmentToday();
  const seen = (await posted()).links;
  const papers = (await latestPapers(dept.arxiv)).filter((p) => !seen.includes(p.link)).slice(0, 25);
  if (!papers.length) return;
  const p = await choose(papers, `These are new research papers. Pick the ONE that ${dept.name} Engineering undergraduates at KU would find most interesting and could follow (practical results, a clever method, or something tied to their units), then write about it for them.`);
  const a = papers[p.index] || papers[0];
  await post(`📄 <@&${dept.role}> **Research paper of the day for ${dept.name}**\n**${a.title}**\n${p.summary}\n${a.link}`,
    `Paper: ${a.title}`, p.discussion, { roles: [dept.role] });
  await remember('links', a.link);
}

export async function news() {
  const seen = (await posted()).links;
  const items = (await latestNews()).filter((a) => !seen.includes(a.link)).slice(0, 30);
  if (!items.length) return;
  const p = await choose(items, 'These are new engineering news stories. Pick the ONE most interesting for KU engineering undergraduates (practical, surprising, or tied to what they study), then write about it.');
  const a = items[p.index] || items[0];
  await post(`📰 **${a.title}** (${a.source})\n${p.summary}\n${a.link}`, `News: ${a.title}`, p.discussion);
  await remember('links', a.link);
}

export const JOBS = { trivia, video, reveal, paper, news };
