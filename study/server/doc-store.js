// Students' documents in Supabase (crux_docs), for the Vercel router. Each save checks the rev it loaded, so two
// tabs can't silently overwrite each other: the loser gets 409 and the app reloads and tries once more.
// A per-instance cache keeps the last document per student; a request then fetches only the rev.
import { emptyDoc, normalize } from './store.js';

const conflict = () => Object.assign(new Error('Your data changed in another tab. Reloading.'), { status: 409 });

export function docStore(db) {
  const cache = new Map(); // userId → { rev, doc }
  const q = (userId) => `user_id=eq.${encodeURIComponent(userId)}`;
  return {
    async load(userId) {
      const [row] = await db.select('crux_docs', `${q(userId)}&select=rev`);
      if (!row) return { rev: 0, doc: emptyDoc() };
      const hit = cache.get(userId);
      if (hit?.rev === row.rev) return { rev: row.rev, doc: structuredClone(hit.doc) };
      const [full] = await db.select('crux_docs', `${q(userId)}&select=rev,doc`);
      if (!full) return { rev: 0, doc: emptyDoc() };
      const doc = normalize(full.doc);
      cache.set(userId, { rev: full.rev, doc: structuredClone(doc) });
      return { rev: full.rev, doc };
    },
    async save(userId, rev, doc) {
      const next = rev + 1;
      const rows = rev === 0
        ? await db.insert('crux_docs', [{ user_id: userId, doc, rev: next }], { ignoreDuplicates: true })
        : await db.update('crux_docs', `${q(userId)}&rev=eq.${rev}&select=rev`, { doc, rev: next, updated_at: new Date().toISOString() });
      if (!rows?.length) { cache.delete(userId); throw conflict(); }
      cache.set(userId, { rev: next, doc: structuredClone(doc) });
      return next;
    },
  };
}
