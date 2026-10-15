// Conversation. The bot answers when it's @mentioned or replied to (anywhere), takes part in the discussion
// threads it opened, and now and then joins a lively #general-chat conversation by itself. When it joins on its
// own, Gemini may decide it has nothing worth adding and stay quiet.
import { CHANNEL, JUMP_IN, MAX_REPLIES_PER_DAY } from './config.js';
import { ask, PERSONA } from './gemini.js';
import { save, state, today } from './state.js';

const humanTimes = [];      // recent human messages in #general-chat
const lastAnswered = new Map(); // user -> time, so one person can't flood it
const MAX_IMAGE = 4 * 1024 * 1024;

const CHIME_IN = `${PERSONA}
You were NOT asked to speak. Read the conversation and decide whether to chime in. Only do it if you can add something genuinely useful, interesting or funny about engineering or studying (a fact, a correction, a tip, a good question). Stay out of personal chats, arguments and anything private. If you shouldn't speak, reply with exactly: SKIP
If you do speak, one or two short sentences, casual.`;

const THREAD = `${PERSONA}
This is a discussion thread you started. Reply to keep the discussion going: react to what people said, add a fact or a counter-point, or ask a follow-up. If the latest message doesn't need a reply from you (people are talking to each other, or it's just "ok"/"lol"), reply with exactly: SKIP`;

function wantsJumpIn() {
  const now = Date.now();
  while (humanTimes.length && now - humanTimes[0] > 10 * 60 * 1000) humanTimes.shift();
  const s = today();
  return humanTimes.length >= JUMP_IN.minHumanMessages
    && now - (state.lastSpoke || 0) > JUMP_IN.quietMinutes * 60 * 1000
    && s.jumpIns < JUMP_IN.maxPerDay
    && Math.random() < 0.35;
}

// The channel's recent messages as a Gemini conversation (consecutive messages from one side are merged).
async function conversation(channel, botId, latest, withImages) {
  const msgs = [...(await channel.messages.fetch({ limit: 15 })).values()].reverse();
  const turns = [];
  for (const m of msgs) {
    const role = m.author.id === botId ? 'model' : 'user';
    const text = role === 'model' ? m.content : `${m.member?.displayName || m.author.username}: ${m.content.replace(new RegExp(`<@!?${botId}>`, 'g'), '@bot')}`;
    if (!text.trim()) continue;
    const last = turns[turns.length - 1];
    if (last?.role === role) last.text += `\n${text}`; else turns.push({ role, text });
  }
  while (turns[0]?.role === 'model') turns.shift(); // Gemini wants the user to speak first
  if (withImages && turns.length && turns[turns.length - 1].role === 'user') {
    const images = [];
    for (const a of latest.attachments.values()) {
      if (!/^image\//.test(a.contentType || '') || a.size > MAX_IMAGE || images.length >= 2) continue;
      const buf = Buffer.from(await (await fetch(a.url)).arrayBuffer());
      images.push({ mime: a.contentType, data: buf.toString('base64') });
    }
    if (images.length) turns[turns.length - 1].images = images;
  }
  return turns;
}

async function send(channel, text, replyTo) {
  const parts = text.match(/[\s\S]{1,1900}(\n|$)|[\s\S]{1,1900}/g) || [];
  for (const [n, part] of parts.slice(0, 4).entries()) {
    const payload = { content: part, allowedMentions: { parse: [], repliedUser: false } };
    if (n === 0 && replyTo) await replyTo.reply(payload); else await channel.send(payload);
  }
}

export async function onMessage(msg, client) {
  if (msg.author.bot || !msg.guildId) return;
  const ch = msg.channel;
  const me = client.user.id;
  const inGeneral = ch.id === CHANNEL;
  const inMyThread = ch.isThread?.() && state.threads.includes(ch.id);
  if (inGeneral) humanTimes.push(Date.now());

  const mentioned = msg.mentions.users.has(me);
  const repliedToMe = !mentioned && msg.reference?.messageId
    && (await msg.fetchReference().catch(() => null))?.author?.id === me;
  const mode = mentioned || repliedToMe ? 'direct' : inMyThread ? 'thread' : inGeneral && wantsJumpIn() ? 'jump' : null;
  if (!mode) return;

  const s = today();
  if (s.replies >= MAX_REPLIES_PER_DAY) {
    if (mode === 'direct') await msg.reply({ content: "I've hit my chat limit for today 😅 Back tomorrow!", allowedMentions: { repliedUser: false } }).catch(() => {});
    return;
  }
  if (mode === 'direct' && Date.now() - (lastAnswered.get(msg.author.id) || 0) < 5000) return;
  if (mode === 'jump') s.jumpIns++; // counted even if it decides to skip, so it can't keep trying

  try {
    if (mode === 'direct') await ch.sendTyping().catch(() => {});
    const turns = await conversation(ch, me, msg, mode === 'direct');
    if (!turns.length) return;
    const reply = (await ask(turns, mode === 'direct' ? PERSONA : mode === 'thread' ? THREAD : CHIME_IN)).trim();
    if (!reply || /^SKIP\b/i.test(reply)) return;
    await send(ch, reply.replace(/@(everyone|here)/g, '@​$1'), mode === 'direct' ? msg : null);
    s.replies++;
    if (inGeneral) state.lastSpoke = Date.now();
    lastAnswered.set(msg.author.id, Date.now());
  } catch (e) {
    console.error(`reply failed (${mode}):`, e.message);
    if (mode === 'direct') await msg.reply({ content: "Sorry, my brain glitched there. Try again in a minute?", allowedMentions: { repliedUser: false } }).catch(() => {});
  } finally {
    save();
  }
}
