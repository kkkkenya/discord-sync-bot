// Live index of the unit posts in every forum, read from Discord at start-up (so new posts are always known),
// plus the rules for which forum a unit belongs in when its post doesn't exist yet.
import { ChannelType } from 'discord.js';

// Unit-code prefixes the bot trusts when reading file names and page text (more are learned from post names).
const PREFIXES = ['EMM', 'EAR', 'EBE', 'ECV', 'EEE', 'EBM', 'EPL', 'ECU', 'UCU', 'SMA', 'SPH', 'SCH'];
// Which department's forums a prefix belongs to (forums are named like mech-year-3).
const DEPT_OF = { EMM: 'mech', EAR: 'mech', EBE: 'abe', ECV: 'civil', EEE: 'eee', EBM: 'eee', EPL: 'egp' };

const CODE = /(?<![A-Za-z])([A-Za-z]{3})[\s_.-]*(\d{3})(?!\d)/g;
const postCodes = (name) => [...name.split(' — ')[0].toUpperCase().matchAll(CODE)].map((m) => `${m[1]} ${m[2]}`);

export class PostIndex {
  constructor(guild) {
    this.guild = guild;
    this.byCode = new Map(); // 'EMM 305' -> [{ id, name, forum, thread }]
    this.forums = new Map(); // 'mech-year-3' -> forum channel
    this.prefixes = new Set(PREFIXES);
  }

  add(thread, forum) {
    for (const code of postCodes(thread.name)) {
      this.prefixes.add(code.slice(0, 3));
      const list = this.byCode.get(code) || [];
      if (!list.some((p) => p.id === thread.id)) list.push({ id: thread.id, name: thread.name, forum: forum.name, thread });
      this.byCode.set(code, list);
    }
  }

  async load() {
    const channels = await this.guild.channels.fetch();
    for (const forum of channels.values()) {
      if (forum?.type !== ChannelType.GuildForum) continue;
      this.forums.set(forum.name, forum);
      const active = await forum.threads.fetchActive();
      for (const t of active.threads.values()) if (t.parentId === forum.id) this.add(t, forum);
      for (let before; ;) {
        const page = await forum.threads.fetchArchived({ type: 'public', limit: 100, before });
        for (const t of page.threads.values()) this.add(t, forum);
        if (!page.hasMore || !page.threads.size) break;
        before = new Date(Math.min(...page.threads.map((t) => t.archiveTimestamp || Date.now())));
      }
    }
    return this;
  }

  // Unit codes in a piece of text (file name, folder name, page 1), trusted prefixes only.
  codesIn(text) {
    const out = [];
    for (const m of String(text).toUpperCase().matchAll(CODE)) {
      const code = `${m[1]} ${m[2]}`;
      if (this.prefixes.has(m[1]) && !out.includes(code)) out.push(code);
    }
    return out;
  }

  // The post(s) for a unit: the best one per forum, narrowed by course/year hints from the folder path.
  pick(code, hints = {}) {
    const best = new Map();
    for (const p of this.byCode.get(code) || []) {
      const n = postCodes(p.name).length; // several posts in one forum: take the merged one (most codes)
      if (!best.has(p.forum) || n > best.get(p.forum).n) best.set(p.forum, { ...p, n });
    }
    let posts = [...best.values()];
    if (hints.dept) {
      const narrowed = posts.filter((p) => p.forum.startsWith(`${hints.dept}-`));
      if (narrowed.length) posts = narrowed;
    }
    if (hints.year) {
      const narrowed = posts.filter((p) => p.forum.includes(`year-${hints.year}`));
      if (narrowed.length) posts = narrowed;
    }
    return posts;
  }

  forumFor(code, hints = {}) {
    const prefix = code.slice(0, 3);
    const year = Number(code[4]);
    let name;
    if (prefix === 'ECU' || prefix === 'SMA') name = year === 1 ? 'ecu-year-1' : year === 2 ? 'ecu-year-2' : 'ecu-upper-years';
    else if (prefix === 'UCU') name = 'ucu-university-common';
    else if (DEPT_OF[prefix]) name = `${DEPT_OF[prefix]}-year-${year}`;
    else if (hints.dept) name = `${hints.dept}-year-${hints.year || year}`;
    return name ? this.forums.get(name) || null : null;
  }

  // Creates the unit's post when none exists yet. Returns [] if there's no forum for it.
  async createPost(code, hints) {
    const forum = this.forumFor(code, hints);
    if (!forum) return [];
    const thread = await forum.threads.create({
      name: code,
      message: { content: `**${code}**: past papers, CATs and notes. New files for this unit land here automatically.` },
      reason: 'Engineering Study Hub uploader: first file for this unit',
    });
    this.add(thread, forum);
    return [{ id: thread.id, name: thread.name, forum: forum.name, thread }];
  }
}
