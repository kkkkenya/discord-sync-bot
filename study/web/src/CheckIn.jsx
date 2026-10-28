import { useEffect, useState } from 'react';

const KINDS = ['reading', 'problems', 'teaching', 'past-paper', 'mock'];

// One-screen check-in shown when a focus session ends. Everything is optional; Skip logs the session bare.
export default function CheckIn({ onSave, onSkip }) {
  const [focus, setFocus] = useState(0);
  const [kind, setKind] = useState(() => localStorage.getItem('study-kind') || 'problems');
  const [energy, setEnergy] = useState('');

  const save = () => { localStorage.setItem('study-kind', kind); onSave({ focus, kind, energy }); };

  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
      if (e.key >= '1' && e.key <= '5') setFocus(Number(e.key));
      else if (e.key === 'Enter') save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, kind, energy]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="checkin" role="dialog" aria-label="Rate your session">
      <h4>Rate your session</h4>
      <div className="focus-row" role="radiogroup" aria-label="Focus, 1 to 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={focus === n ? 'on' : ''} onClick={() => setFocus(n)} aria-label={`focus ${n}`}>{n}</button>
        ))}
      </div>
      <div className="muted small">{focus ? (focus <= 2 ? 'Scattered' : focus >= 4 ? 'Locked in' : `${focus}/5`) : 'How focused? 1–5'}</div>
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="What you were doing">
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={energy} onChange={(e) => setEnergy(e.target.value)} aria-label="Energy (optional)">
          <option value="">Energy…</option>
          <option value="low">Low</option>
          <option value="ok">Ok</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="row">
        <button className="ghost" onClick={onSkip}>Skip</button>
        <button onClick={save}>Save</button>
      </div>
    </div>
  );
}
