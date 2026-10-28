// Your private study channel: the Study Hub bot DMs you, and you DM it back. Only OWNER_ID gets answers.
// It signs in with the same token as the PC bot, as a second, DM-only connection, so the server bots are untouched.
// Buttons and slash commands go to Vercel, so everything here is plain typed replies.
import { ChannelType, Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import cron from 'node-cron';
import { coach, coachReady } from './coach.js';
import { ALL_UNITS, filesFor, nextAssessment } from './library.js';
import { daysBetween, isDay, nairobiDay, stats, todayPlan, unitStage } from './plan.js';
import { ERROR_TYPES } from './defs.js';
import { KEY_LABEL, checkAnswer, flagCheckpoint, markBroke } from './practice.js';
import { stageMix } from './stages.js';
import { add, data, save } from './store.js';
import { hintFields, predictFor, teachFlags, weakspotsFor } from './weakspots.js';

const HELP = [
  '**Study DMs**: type any of these.',
  '`today`: your plan and the CAT countdown',
  '`files EMM 302`: past papers and CATs for a unit from the server (`files EMM 302 notes` for notes and slides, `files` for all your units)',
  '`teach EMM 302 Mohr\'s circle`: explain a topic like you\'re teaching a classmate, get it marked',
  '`predict EMM 302`: the topics most likely to come, from past papers and lecturer hints',
  '`hint EMM 302 exam will mainly focus on beta functions`: save what the lecturer said',
  '`weakspots EMM 302`: your highest-risk sub-topics and the mistakes you keep making',
  '`mark EMM 302`: a past-paper question to try. Then `mark 142.5 MPa` checks your final answer, and `mark broke 3` logs the checkpoint where your working broke',
  '`log 45 EMM 302`: log 45 minutes of study',
  '`paper EMM 302 34/60 2023 CAT 1`: log a past paper score',
  '`stop`: end a teach-back',
].join('\n');

const unitOf = (text) => {
  const m = text.match(/\b([A-Za-z]{3})\s?(\d{3})\b/);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : null;
};
const known = (code) => data.units.some((u) => u.code === code);

export function todayText(today = nairobiDay()) {
  // the KU calendar only matters while some unit has no date of its own (TBA units have none at all)
  const next = !data.units.length || data.units.some((u) => !u.catDate) ? nextAssessment(today) : null;
  const lines = [];
  if (next) {
    const d = daysBetween(today, next.start);
    lines.push(d > 0 ? `**${next.name}** start in **${d} day${d === 1 ? '' : 's'}** (${next.start}).` : `**${next.name}** are on now, until ${next.end}.`);
    const undated = data.units.filter((u) => !u.catDate).length;
    if (undated) lines.push(`_${undated} unit${undated === 1 ? ' counts' : 's count'} down to the KU calendar. Dates moved by the strike? Mark them TBA in Units on the dashboard._`);
  }
  for (const u of data.units.filter((x) => isDay(x.catDate) && x.catDate >= today).sort((a, b) => a.catDate.localeCompare(b.catDate)).slice(0, 4)) {
    lines.push(`• ${u.code} CAT/exam: ${u.catDate} (${daysBetween(today, u.catDate)}d)`);
  }
  const tba = data.units.filter((u) => u.catDate === 'TBA').length;
  if (tba) lines.push(`• ${tba} unit${tba === 1 ? '' : 's'} with the date TBA`);
  const plan = todayPlan(today);
  if (!plan.length) return [...lines, '', 'No units yet. Open the dashboard and pick your units.'].join('\n');
  const mix = stageMix(data.units.map((u) => unitStage(u, today).stage));
  lines.push('', `Stages: ${mix.map((m) => `${m.n} ${m.name}`).join(' · ')}`, '', '**Today**');
  plan.forEach((p, n) => lines.push(`${n + 1}. **${p.code}** ${p.title} _(${p.stage.name})_: ${p.task.text}`));
  const s = stats(today);
  lines.push('', `Streak ${s.streak} day${s.streak === 1 ? '' : 's'} · ${s.minutesToday} min today · log with \`log 45 ${plan[0].code}\``);
  return lines.join('\n');
}

const COMMANDS = ['today', 'files', 'teach', 'log', 'paper', 'predict', 'hint', 'weakspots', 'mark'];

// Links to a unit's files in the server's forum posts. Papers and CATs by default, or notes/slides/books.
async function filesText(unit, notes) {
  const title = ALL_UNITS.find((u) => u.codes.includes(unit))?.title || '';
  const { files, note } = await filesFor(unit);
  if (note) return `Can't reach the library: ${note}.`;
  const pick = files.filter((f) => (notes ? !f.paper : f.paper));
  const other = files.length - pick.length;
  if (!pick.length) return `No ${notes ? 'notes' : 'past papers or CATs'} for ${unit} on the server yet${other ? `. There ${other === 1 ? 'is 1 other file' : `are ${other} other files`}: \`files ${unit}${notes ? '' : ' notes'}\`` : '.'}`;
  return [
    `**${unit} ${title}: ${notes ? 'notes and other files' : 'past papers and CATs'}** (${pick.length})`,
    ...pick.slice(0, 25).map((f) => `• [${f.name.replace(/[[\]]/g, '')}](<${f.url}>)`),
    ...(pick.length > 25 ? [`…and ${pick.length - 25} more on the dashboard.`] : []),
    ...(other ? [`_${other} more under \`files ${unit}${notes ? '' : ' notes'}\`._`] : []),
    ...(notes ? [] : ['', `Do one timed, then log it: \`paper ${unit} 34/60 2023 CAT 1\``]),
  ].join('\n');
}

async function allFilesText() {
  if (!data.units.length) return 'Pick your units on the dashboard first, or ask for one: `files EMM 302`.';
  const lines = ['**Server files for your units**'];
  for (const u of data.units) {
    const { files, note } = await filesFor(u.code);
    if (note) return `Can't reach the library: ${note}.`;
    const papers = files.filter((f) => f.paper).length;
    lines.push(`• **${u.code}** ${u.title}: ${papers} paper${papers === 1 ? '' : 's'}/CATs, ${files.length - papers} notes and other`);
  }
  return [...lines, '', 'Reply `files EMM 302` (your code) for the links.'].join('\n');
}

// Discord messages max out at 2000 characters: split on line breaks so links stay whole.
export function chunks(text, size = 1900) {
  const out = [''];
  for (const line of text.split('\n')) {
    if (out.at(-1).length + line.length + 1 > size && out.at(-1)) out.push('');
    out[out.length - 1] += (out.at(-1) ? '\n' : '') + line.slice(0, size);
  }
  return out;
}

let mode = null; // { kind: 'teach', unit, topic }
let marking = { questionId: null, unit: null, attempt: null, guess: null }; // the question `mark` gave you, and the last check

// A past-paper question for `mark EMM 302`: on the top weakspot's topic if one is listed, else the most likely topic,
// else any; newest paper first.
function questionFor(unit) {
  const qs = data.paperq.filter((q) => q.unit === unit && q.text.length >= 20);
  const weak = weakspotsFor(unit, nairobiDay()).critical[0];
  const top = predictFor(unit, nairobiDay()).find((r) => !r.muted && r.questions);
  const on = (topicId) => qs.filter((q) => q.topicId === topicId);
  const pool = (weak && on(weak.topicId).length ? on(weak.topicId) : top && on(top.topicId).length ? on(top.topicId) : qs);
  return [...pool].sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
}

// "units", "sign", "algebra"… → an error type id, else null
const errorTypeOf = (words) => {
  const w = words.toLowerCase();
  return w ? ERROR_TYPES.find((e) => e.id.startsWith(w) || e.id.split('-').some((p) => w.startsWith(p)) || e.label.toLowerCase().includes(w))?.id || null : null;
};

async function markText(t, { photo }) {
  const rest = t.replace(/^mark\s*/i, '').trim();
  if (photo) return 'Photos of your working aren\'t read yet (that comes later). For now, type your final answer: `mark 142.5 MPa`.';
  const unit = /^[A-Za-z]{3}\s?\d{3}$/.test(rest) ? unitOf(rest) : null;
  if (unit) {
    if (!known(unit)) return `${unit} isn't one of your units. Add it on the dashboard first.`;
    const q = questionFor(unit);
    if (!q) return `No past-paper questions read for ${unit} yet. On the dashboard: Units → Sync all files.`;
    marking = { questionId: q.id, unit, attempt: null, guess: null };
    return [`**${q.source} Q${q.number}**${q.marks ? ` (${q.marks} marks)` : ''}`, q.text.length > 1500 ? `${q.text.slice(0, 1500)}…` : q.text, '', 'Solve it on paper, closed book, then reply with your final answer and its unit: `mark 142.5 MPa`.'].join('\n');
  }
  const broke = rest.match(/^broke\s+(\d+)\s*(.*)$/i);
  if (broke) {
    const a = data.attempts.find((x) => x.id === marking.attempt);
    if (!a) return 'Check an answer first: `mark EMM 302`, then `mark <your answer>`.';
    const n = Number(broke[1]);
    const cp = a.checkpoints?.[n - 1];
    if (!cp) return `Pick one of the checkpoints, 1 to ${a.checkpoints?.length || 0}.`;
    const errorType = errorTypeOf(broke[2].trim()) || marking.guess?.errorType || cp.errorType || 'concept-gap';
    const subtopicId = cp.subtopicId || marking.guess?.subtopicId || null;
    markBroke({ id: a.id, step: n, subtopicId, errorType });
    const sub = data.subtopics.find((s) => s.id === subtopicId);
    return `Logged: your working broke at checkpoint ${n} (${cp.step})${sub ? ` · ${sub.name}` : ''} · ${ERROR_TYPES.find((e) => e.id === errorType).label}. Your weakspots are updated. Another one: \`mark ${a.unit}\`.`;
  }
  if (/^dispute\b/i.test(rest)) {
    if (!marking.attempt) return 'Check an answer first: `mark EMM 302`, then `mark <your answer>`.';
    flagCheckpoint({ id: marking.attempt });
    return 'Saved: the checkpoints look wrong to you, so nothing is held against you. Get a verified solution from the Prompt Builder on the dashboard.';
  }
  if (!rest) return HELP;
  if (!marking.questionId) return 'First get a question: `mark EMM 302` (your unit), solve it, then `mark <your final answer>`.';
  const out = await checkAnswer({ unit: marking.unit, questionId: marking.questionId, answer: rest });
  if (out.needKey) return `${out.message} On the dashboard, Check answer lets you type the key from your marking scheme.`;
  if (out.verdict === 'unreadable') return out.note;
  marking.attempt = out.attempt.id;
  marking.guess = out.guess;
  const key = `Key: **${out.key.answer}** (${KEY_LABEL[out.key.source]})`;
  if (out.verdict === 'right') return [`✓ **Matches the key.** ${key}`, out.assumedUnit ? '_One of the two had no unit, so the numbers were compared as they are._' : '', `Another one: \`mark ${marking.unit}\`.`].filter(Boolean).join('\n');
  return [
    `✗ **Doesn't match.** ${key}${out.note ? `\n_${out.note}_` : ''}`,
    ...(out.checkpoints.length ? ['', ...out.checkpoints.map((c) => `${c.n}. ${c.step}${c.equation ? `: \`${c.equation}\`` : ''}${c.value ? ` = ${c.value}` : ''}`), '', 'Find the first step your paper disagrees with and reply `mark broke <number>` (add the kind of mistake if you know it: `mark broke 2 units`). If a checkpoint looks wrong, reply `mark dispute`.'] : [out.checkpointNote || 'No checkpoints for this one. Open it in Check answer on the dashboard.']),
  ].join('\n');
}

// The 20:30 nudge when nothing was logged today, shaped by the most urgent unit's stage. null when you studied.
export function eveningText(today = nairobiDay()) {
  if (stats(today).activeToday) return null;
  const p = todayPlan(today)[0];
  if (!p) return null;
  const when = p.days != null && p.days >= 0 ? (p.days === 0 ? 'today' : p.days === 1 ? 'tomorrow' : `in ${p.days} days`) : null;
  const weak = p.weak ? ` on ${p.weak.topic}` : '';
  if (p.stage.id === 'exam-eve') return `**${p.code}** is ${when || 'next'}. Read your formula sheet (Study kit on the dashboard) and do one past-paper question: \`mark ${p.code}\`.`;
  if (p.stage.id === 'last-minute') return `Nothing logged today, and **${p.code}** is ${when}. 20 minutes on your formula sheet (Study kit), then one past-paper question: \`mark ${p.code}\`.`;
  if (p.stage.id === 'one-week') return `Nothing logged today. **${p.code}** is ${when}: one past-paper question${weak} keeps it moving: \`mark ${p.code}\`.`;
  return `Nothing logged today. 15 minutes counts: one past-paper question (\`mark ${p.code}\`) or teach back a topic (\`teach ${p.code} <topic>\`).`;
}

export async function reply(text, { photo = false } = {}) {
  const t = text.trim();
  const word = t.split(/\s+/)[0].toLowerCase();

  if (word === 'stop') { mode = null; return 'Stopped.'; }
  if (word === 'help') return HELP;

  if (mode?.kind === 'teach' && !COMMANDS.includes(word)) {
    const { unit, topic } = mode;
    mode = null;
    let feedback = null;
    let note = '';
    if (coachReady()) {
      try { feedback = await coach({ unit, topic, text: t }); } catch (e) { note = `\n(Couldn't get feedback: ${e.message})`; }
    }
    add('teach', { unit, topic, text: t, feedback });
    const tp = data.topics.find((x) => x.unit === unit && x.name.toLowerCase() === topic.toLowerCase());
    if (tp) { tp.taughtAt = new Date().toISOString(); save(); }
    if (!feedback) return `Saved your teach-back on ${topic}.${note}`;
    const { flagged } = teachFlags(unit, topic, feedback);
    return [
      `**${topic}: ${feedback.score}/5**`,
      `✓ ${feedback.good}`,
      ...feedback.gaps.map((g) => `✗ ${g}`),
      '',
      `**Next question:** ${feedback.followUp}`,
      ...(flagged.length ? ['', `_Marked shaky in your weakspots: ${flagged.join(', ')}._`] : []),
    ].join('\n');
  }

  if (word === 'today') return todayText();
  if (word === 'files') {
    const unit = unitOf(t);
    return unit ? filesText(unit, /\bnotes?\b|slides?|books?/i.test(t)) : allFilesText();
  }
  if (word === 'teach') {
    const unit = unitOf(t);
    const topic = t.replace(/^teach\s*/i, '').replace(/\b[A-Za-z]{3}\s?\d{3}\b/, '').trim();
    if (!unit || !topic) return 'Like this: `teach EMM 302 Mohr\'s circle`';
    mode = { kind: 'teach', unit, topic };
    return `Teach me **${topic}** (${unit}) like I'm a classmate who missed the lecture. Definitions, the key equation, when it applies, one worked example. Send it as one message.`;
  }
  if (word === 'log') {
    const unit = unitOf(t);
    const minutes = Number(t.replace(/\b[A-Za-z]{3}\s?\d{3}\b/, '').match(/\b(\d{1,3})\b/)?.[1]);
    if (!minutes || !unit) return 'Like this: `log 45 EMM 302`';
    add('sessions', { unit, minutes });
    return `Logged ${minutes} min on ${unit}${known(unit) ? '' : ' (not one of your units yet)'}. Today: ${stats().minutesToday} min.`;
  }
  if (word === 'paper') {
    const unit = unitOf(t);
    const m = t.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
    if (!unit || !m) return 'Like this: `paper EMM 302 34/60 2023 CAT 1`';
    const label = t.replace(/^paper\s*/i, '').replace(/\b[A-Za-z]{3}\s?\d{3}\b/, '').replace(m[0], '').trim() || 'Past paper';
    add('papers', { unit, label, score: Number(m[1]), outOf: Number(m[2]) });
    return `Logged ${label}: ${m[1]}/${m[2]} (${Math.round((m[1] / m[2]) * 100)}%). Redo every question you dropped marks on, closed book, then teach back the topic behind it.`;
  }
  if (word === 'predict') {
    const unit = unitOf(t);
    if (!unit || !known(unit)) return 'Like this: `predict EMM 302` (one of your units)';
    const ranked = predictFor(unit, nairobiDay());
    if (!ranked.length) return `No topics for ${unit} yet. Add them on the dashboard (Units).`;
    const parsed = data.paperq.filter((q) => q.unit === unit).length;
    return [
      `**${unit}: most likely topics**${parsed ? '' : ' _(no past papers read yet: open Predictions on the dashboard and read them)_'}`,
      ...ranked.slice(0, 6).map((r, n) => `${n + 1}. **${r.name}**${r.pinned ? ' 📌 pinned by lecturer' : r.muted ? ' (muted by lecturer)' : ''} · weight ${r.weight} · ${r.evidence}`),
    ].join('\n');
  }
  if (word === 'weakspots' || word === 'weakspot') {
    const unit = unitOf(t);
    if (!unit || !known(unit)) return 'Like this: `weakspots EMM 302` (one of your units)';
    const { critical, errors } = weakspotsFor(unit, nairobiDay());
    if (!critical.length) return `No weakspots on record for ${unit}. Break its topics into sub-topics and rate them on the dashboard (Weakspots).`;
    return [
      `**${unit}: fix these first**`,
      ...critical.slice(0, 5).map((c, n) => `${n + 1}. **${c.name}** (${c.topic}) · ${c.reason}\n   → ${c.next}`),
      ...(errors.takeaway ? ['', `_${errors.takeaway}_`] : []),
    ].join('\n');
  }
  if (word === 'hint') {
    const unit = unitOf(t);
    const text = t.replace(/^hint\s*/i, '').replace(/\b[A-Za-z]{3}\s?\d{3}\b/, '').trim();
    if (!unit || !known(unit) || !text) return 'Like this: `hint EMM 302 exam will mainly focus on beta functions`';
    const h = add('hints', hintFields(unit, text));
    const names = data.topics.filter((x) => h.topicIds.includes(x.id)).map((x) => x.name);
    return `Saved as a **${h.kind}** hint for ${unit}${names.length ? ` on ${names.join(', ')}` : ' (no topic matched: tag it on the dashboard)'}.`;
  }
  if (word === 'mark') return markText(t, { photo });
  if (word === 'quiz' || word === 'card') return 'Flashcards are retired in Study Desk. Try `teach EMM 302 <topic>`, or a timed mock on the dashboard.';
  return mode ? 'Type `stop` to end this first.' : HELP;
}


export function startBot() {
  const token = process.env.DISCORD_TOKEN;
  const owner = process.env.OWNER_ID;
  if (!token || !owner) {
    console.log(`Discord DMs off: ${!token ? 'DISCORD_TOKEN missing in pc/.env' : 'OWNER_ID missing in study/.env (run setup.bat)'}.`);
    return null;
  }
  const client = new Client({ intents: [GatewayIntentBits.DirectMessages], partials: [Partials.Channel] });
  const dm = async (text) => {
    const user = await client.users.fetch(owner);
    for (const part of chunks(text)) await user.send(part);
  };
  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || msg.channel.type !== ChannelType.DM || msg.author.id !== owner) return;
    try {
      await msg.channel.sendTyping();
      const text = await reply(msg.content, { photo: msg.attachments.size > 0 });
      for (const part of chunks(text)) await msg.channel.send(part);
    } catch (e) {
      console.error('DM reply failed:', e);
      msg.channel.send(`Something broke: ${e.message}`).catch(() => {});
    }
  });

  client.once(Events.ClientReady, () => {
    console.log(`Discord DMs on: ${client.user.tag} will message you. DM it "help".`);
    // 07:00 plan, 20:30 nudge if nothing was done today. Nairobi time.
    cron.schedule('0 7 * * *', () => dm(todayText()).catch((e) => console.error('morning DM failed:', e.message)), { timezone: 'Africa/Nairobi' });
    cron.schedule('30 20 * * *', () => {
      const text = eveningText();
      if (text) dm(text).catch((e) => console.error('evening DM failed:', e.message));
    }, { timezone: 'Africa/Nairobi' });
  });

  client.login(token).catch((e) => console.error(`Discord sign-in failed: ${e.message}. Check DISCORD_TOKEN in pc/.env.`));
  return { client, dm };
}
