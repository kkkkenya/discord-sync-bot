// The Study Desk gateway for friends (api/study.js). A friend's Study Desk runs on their own laptop and never holds a
// secret: anything that needs the bot token, the Supabase key or the owner's AI key goes through here, signed in
// with the friend's device token. Pure-ish: give it { db, discord, dm, ai, now } (tests pass fakes).
import { createHash, randomBytes, randomInt } from 'node:crypto';

const sha = (s) => createHash('sha256').update(String(s).trim().toUpperCase()).digest('hex');
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const day = (now) => new Date(now).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
export const DM_DAILY_CAP = 12; // plan, nudge and replies that fell back to DM; keeps a leaked token from spamming
const MEDIA_LIMIT = 4 * 1024 * 1024; // base64 chars: Vercel takes ~4.5 MB a request (a photo, or ~2 min of voice)

// "SD-7K2M-9QXA": what the owner hands a friend (pc/study-invite.js) and what /study link shows a Premium member.
export const newCode = () => `SD-${randomBytes(4).toString('hex').toUpperCase().replace(/(.{4})(.{4})/, '$1-$2')}`;
const newToken = () => randomBytes(24).toString('base64url');

export function makeGateway({ db, discord, dm, ai, now = () => Date.now(), appId }) {
  const friendBy = async (col, value) => (await db.select('study_friends', `${col}=eq.${encodeURIComponent(value)}&limit=1`))[0] || null;
  const signedIn = async (token) => {
    const f = token ? await friendBy('token_hash', sha(token)) : null;
    if (!f || !f.active) throw bad('This Study Desk is not linked (or was switched off). Run setup again with a new code.', 401);
    return f;
  };
  const used = async (f) => (await db.select('study_usage', `friend_id=eq.${f.id}&day=eq.${day(now())}`))[0] || { ai_calls: 0, dms: 0 };

  const actions = {
    // { code } → a device token. The code works once; a new code (from the owner or /study link) re-links.
    async link({ code }) {
      const f = code ? await friendBy('invite_hash', sha(code)) : null;
      if (!f || !f.active) throw bad('That code isn’t valid (or was already used). Ask for a new one, or get one with /study link in Discord if you have Premium.');
      const token = newToken();
      await db.update('study_friends', `id=eq.${f.id}`, { token_hash: sha(token), invite_hash: null, linked_at: new Date(now()).toISOString() });
      return { token, name: f.name, aiDailyCap: f.ai_daily_cap, discordLinked: Boolean(f.discord_id) };
    },
    async me(_, f) {
      const u = await used(f);
      return { name: f.name, via: f.via, discordLinked: Boolean(f.discord_id), aiToday: u.ai_calls, aiDailyCap: f.ai_daily_cap };
    },
    // a 6-digit code to type into /study connect, valid 15 minutes
    async pair(_, f) {
      const code = String(randomInt(100000, 1000000));
      await db.update('study_friends', `id=eq.${f.id}`, { pair_code: code, pair_until: new Date(now() + 15 * 60000).toISOString() });
      return { code, minutes: 15 };
    },
    // the owner's AI, capped per friend per day: { schema, system, content, maxTokens, media }
    async ai(body, f) {
      const u = await used(f);
      if (u.ai_calls >= f.ai_daily_cap) throw bad(`You've used today's ${f.ai_daily_cap} free AI actions. They reset at midnight (Nairobi time), or add your own free Gemini key in Settings to keep going.`, 429);
      if ((body.media || []).some((m) => String(m.data || '').length > MEDIA_LIMIT)) throw bad('That photo or recording is too big to send through the Study Hub (about 3 MB). Use a shorter recording or a smaller photo, or your own AI key.', 413);
      const out = await ai(body);
      const n = await db.rpc('study_count', { f: f.id, d: day(now()), what: 'ai', tokens: out.tokens || 0 });
      return { result: out.result, aiToday: n, aiDailyCap: f.ai_daily_cap };
    },
    // the Study Hub's files for a unit (all its codes): [{ id, name, kind, paper, channel_id, message_id }]
    async files({ codes = [] }) {
      const ok = [].concat(codes).filter((c) => /^[A-Z]{3} \d{3}$/.test(String(c))).slice(0, 6);
      if (!ok.length) throw bad('Which unit? Like EMM 302.');
      const rows = await db.select('files', `select=id,name,kind,channel_id,message_id&unit_code=in.(${ok.map((c) => `"${encodeURIComponent(c)}"`).join(',')})&order=name`);
      return { files: rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, paper: r.kind === 'paper' || /(?<![a-z])(cats?|exams?|papers?|tests?|quiz)(?![a-z])/i.test(r.name), channel_id: r.channel_id, message_id: r.message_id })) };
    },
    // a file's download link right now (Discord's links expire, so it's fetched when needed)
    async file({ channel_id, message_id }) {
      // only the Study Hub's own library files: never an arbitrary channel the bot can read (payments, staff, #to-sort)
      const known = (await db.select('files', `select=id&channel_id=eq.${encodeURIComponent(channel_id)}&message_id=eq.${encodeURIComponent(message_id)}&limit=1`))[0];
      if (!known) throw bad('That isn’t one of the Study Hub’s library files.', 404);
      const msg = await discord('GET', `/channels/${channel_id}/messages/${message_id}`);
      const att = msg.attachments?.[0] || msg.message_snapshots?.[0]?.message?.attachments?.[0];
      if (!att) throw bad('That message has no file any more.', 404);
      return { url: att.url, filename: att.filename };
    },
    // /study commands waiting for this Study Desk (taken once)
    async inbox(_, f) {
      await db.update('study_friends', `id=eq.${f.id}`, { last_seen: new Date(now()).toISOString() });
      const rows = await db.select('study_inbox', `friend_id=eq.${f.id}&status=eq.new&order=id&limit=10`);
      if (rows.length) await db.update('study_inbox', `id=in.(${rows.map((r) => r.id).join(',')})`, { status: 'taken' });
      return { items: rows.map((r) => ({ id: r.id, command: r.command, args: r.args })) };
    },
    // the answer to a /study command: edits the "thinking…" reply in Discord; after Discord's 15 minutes, a DM
    async reply({ id, text }, f) {
      const row = (await db.select('study_inbox', `id=eq.${Number(id)}&friend_id=eq.${f.id}`))[0];
      if (!row) throw bad('No such command.', 404);
      const content = String(text || '').slice(0, 1990) || '(no answer)';
      let sent = false;
      if (row.interaction_token && now() - Date.parse(row.created_at) < 14 * 60000) {
        try { await discord('PATCH', `/webhooks/${appId}/${row.interaction_token}/messages/@original`, { content, allowed_mentions: { parse: [] } }); sent = true; } catch { /* expired: DM instead */ }
      }
      if (!sent && f.discord_id) sent = await dm(f.discord_id, content);
      await db.update('study_inbox', `id=eq.${row.id}`, { status: 'done' });
      return { sent };
    },
    // a message from Study Desk to its owner (the 07:00 plan, the 20:30 nudge)
    async dm({ text }, f) {
      if (!f.discord_id) throw bad('Connect Discord first: run /study connect with the code from Settings.', 400);
      const n = await db.rpc('study_count', { f: f.id, d: day(now()), what: 'dm', tokens: 0 });
      if (n > DM_DAILY_CAP) throw bad('That’s enough DMs for today.', 429);
      return { sent: await dm(f.discord_id, String(text || '').slice(0, 1990)) };
    },
  };

  return async function handle(action, body = {}, token = '') {
    if (!actions[action]) throw bad('Unknown action.', 404);
    if (action === 'link') return actions.link(body);
    return actions[action](body, await signedIn(token));
  };
}

// ---- Discord side: /study link (Premium), /study connect, and queueing the rest for the friend's Study Desk ----
// i: the interaction; user: the Discord user. Returns a Discord interaction response.
export async function studyCommand({ db, now = () => Date.now(), premiumRole }, i, user, sub, o) {
  const say = (content) => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
  const mine = (await db.select('study_friends', `discord_id=eq.${user.id}&limit=1`))[0];
  if (sub === 'link') {
    if (!i.member?.roles?.includes(premiumRole)) return say('Study Desk for your own laptop comes with **Premium**, or ask a rep for an invite code. With a code, install Study Desk and enter it in setup.');
    const code = newCode();
    if (mine) await db.update('study_friends', `id=eq.${mine.id}`, { invite_hash: sha(code), active: true });
    else await db.insert('study_friends', [{ name: user.global_name || user.username, via: 'premium', discord_id: user.id, invite_hash: sha(code) }]);
    return say(`Your Study Desk code: **${code}**\nInstall Study Desk (the link is pinned in the server), then enter this code in setup. It works once.`);
  }
  if (sub === 'connect') {
    const code = String(o.code || '').trim();
    const f = (await db.select('study_friends', `pair_code=eq.${encodeURIComponent(code)}&limit=1`))[0];
    if (!f || !f.pair_until || Date.parse(f.pair_until) < now()) return say('That code isn’t valid any more. In Study Desk open Settings → Connect Discord for a new one.');
    if (mine && mine.id !== f.id) await db.update('study_friends', `id=eq.${mine.id}`, { discord_id: null });
    await db.update('study_friends', `id=eq.${f.id}`, { discord_id: user.id, pair_code: null, pair_until: null });
    return say(`✅ Connected. Your Study Desk will DM you here, and \`/study today\` works. (Your Study Desk must be open on your laptop to answer.)`);
  }
  if (!mine || !mine.active) return say('Your Discord isn’t connected to a Study Desk yet. In Study Desk open Settings → Connect Discord, then run `/study connect`.');
  const args = { ...o };
  const att = (id) => i.data?.resolved?.attachments?.[id];
  if (o.photo) args.photo = { url: att(o.photo)?.url, contentType: att(o.photo)?.content_type };
  if (o.voice) args.voice = { url: att(o.voice)?.url, contentType: att(o.voice)?.content_type };
  await db.insert('study_inbox', [{ friend_id: mine.id, command: sub, args, interaction_token: i.token }]);
  // Study Desk asks every few seconds while it runs; not heard from in a minute means it's closed
  if (!mine.last_seen || now() - Date.parse(mine.last_seen) > 60000) return say('Your Study Desk isn’t open on your laptop right now. Start it and this gets answered as a DM.');
  return { type: 5, data: { flags: 64 } }; // "thinking…": the friend's Study Desk edits this when it answers
}
