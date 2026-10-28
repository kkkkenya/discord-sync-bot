// Your private study channel: the Study Hub bot DMs you, and you DM it back. Only OWNER_ID gets answers.
// It signs in with the same token as the PC bot, as a second, DM-only connection, so the server bots are untouched.
// Buttons and slash commands go to Vercel, so everything here is plain typed replies.
import { ChannelType, Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import cron from 'node-cron';
import { coach, coachReady } from './coach.js';
import { ALL_UNITS, filesFor, nextAssessment } from './library.js';
import { catDay, daysBetween, isDay, nairobiDay, stats, todayPlan, unitStage } from './plan.js';
import { stageMix } from './stages.js';
import { add, data, save } from './store.js';

const HELP = [
  '**Study DMs**: type any of these.',
  '`today`: your plan and the CAT countdown',
  '`files EMM 302`: past papers and CATs for a unit from the server (`files EMM 302 notes` for notes and slides, `files` for all your units)',
  '`teach EMM 302 Mohr\'s circle`: explain a topic like you\'re teaching a classmate, get it marked',
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

const COMMANDS = ['today', 'files', 'teach', 'log', 'paper'];

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

export async function reply(text) {
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
    return [
      `**${topic}: ${feedback.score}/5**`,
      `✓ ${feedback.good}`,
      ...feedback.gaps.map((g) => `✗ ${g}`),
      '',
      `**Next question:** ${feedback.followUp}`,
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
      const text = await reply(msg.content);
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
      const s = stats();
      if (s.activeToday) return;
      const next = data.units.map((u) => catDay(u)).filter(Boolean).sort()[0];
      const d = next ? daysBetween(nairobiDay(), next) : null;
      dm(`Nothing logged today${d !== null && d >= 0 ? ` and CATs are ${d} day${d === 1 ? '' : 's'} away` : ''}. 15 minutes counts: reply \`today\` for your plan.`).catch((e) => console.error('evening DM failed:', e.message));
    }, { timezone: 'Africa/Nairobi' });
  });

  client.login(token).catch((e) => console.error(`Discord sign-in failed: ${e.message}. Check DISCORD_TOKEN in pc/.env.`));
  return { client, dm };
}
