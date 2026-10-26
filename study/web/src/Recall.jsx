import { useEffect, useState } from 'react';
import { api } from './api.js';

const GRADES = [[1, 'Forgot'], [2, 'Hard'], [3, 'Good'], [4, 'Easy']];

export default function Recall({ s, refresh, focus }) {
  const [unit, setUnit] = useState('');
  const [cards, setCards] = useState(null);
  const [attempt, setAttempt] = useState('');
  const [shown, setShown] = useState(false);
  const [form, setForm] = useState({ q: '', a: '', topic: '' });

  useEffect(() => { if (focus?.section === 'recall') setUnit(focus.unit || ''); }, [focus]);
  useEffect(() => { api('GET', `due?unit=${encodeURIComponent(unit)}`).then(setCards); }, [unit, s.data.cards.length]);

  const card = cards?.[0];
  const rate = async (g) => {
    await api('POST', 'review', { id: card.id, grade: g });
    setAttempt(''); setShown(false);
    setCards(g === 1 ? [...cards.slice(1), card] : cards.slice(1));
    refresh();
  };
  const addCard = async (e) => {
    e.preventDefault();
    const u = unit || s.data.units[0]?.code;
    if (!u || !form.q.trim() || !form.a.trim()) return;
    await api('POST', 'cards', { unit: u, q: form.q.trim(), a: form.a.trim(), topic: form.topic.trim() });
    setForm({ q: '', a: '', topic: '' });
    refresh();
  };
  const topicOptions = s.data.topics.filter((t) => t.unit === (unit || s.data.units[0]?.code));

  return (
    <section id="recall" className="reveal">
      <div className="head">
        <h2>Recall</h2>
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">All units</option>
          {s.data.units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}
        </select>
      </div>
      {!cards ? <p className="muted">…</p> : !card ? (
        <p className="muted">No cards due{unit ? ` for ${unit}` : ''}. Write some below: one fact, formula or method per card, phrased as a question.</p>
      ) : (
        <div className="card">
          <p className="small muted">{card.unit} · {cards.length} due</p>
          <p className="q">{card.q}</p>
          {!shown ? (
            <form onSubmit={(e) => { e.preventDefault(); setShown(true); }}>
              <textarea rows={3} placeholder="Answer from memory first. Write the formula or the steps." value={attempt} onChange={(e) => setAttempt(e.target.value)} />
              <button>Check answer</button>
            </form>
          ) : (
            <>
              {attempt && <p className="mine"><b>You:</b> {attempt}</p>}
              <p className="a"><b>Answer:</b> {card.a}</p>
              <div className="row">{GRADES.map(([g, label]) => <button key={g} className={g === 1 ? 'ghost' : ''} onClick={() => rate(g)}>{label}</button>)}</div>
            </>
          )}
        </div>
      )}
      <form className="add" onSubmit={addCard}>
        <h4>New card {unit ? `for ${unit}` : s.data.units[0] ? `for ${s.data.units[0].code}` : ''}</h4>
        <input placeholder="Question (e.g. State the bending equation and what each term means)" value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} />
        <input list="card-topics" placeholder="Topic (optional, so it counts toward that topic's mastery)" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
        <datalist id="card-topics">{topicOptions.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        <textarea rows={2} placeholder="Answer" value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} />
        <button disabled={!s.data.units.length}>Add card</button>
      </form>
      <p className="muted small">Cards you get right come back later; before a CAT, every card is pulled forward so you see it again the day before. In Discord, DM the bot <code>quiz</code>.</p>
    </section>
  );
}
