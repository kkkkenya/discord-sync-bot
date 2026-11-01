import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';

// Go deeper: a prompt and a context pack (your weak spots, past questions, notes) to take to a stronger AI.
export default function GoDeeper({ s, target, onClose }) {
  const [goal, setGoal] = useState(target.goal || '');
  const [pack, setPack] = useState(null);
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setPack(null); setProblem('');
    api('POST', 'pack', { unit: target.unit, topicId: target.topicId, questionId: target.questionId, goal: goal || undefined }).then(setPack).catch((e) => setProblem(e.message));
  }, [target, goal]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onClose]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(pack.prompt); } catch {
      const t = document.getElementById('deeper-prompt'); t.select(); document.execCommand('copy'); // older phones
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([pack.md], { type: 'text/markdown' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: pack.filename });
    a.click(); URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="deeper-title">
        <div className="sheet-head">
          <h1 id="deeper-title">Go deeper</h1>
          <button className="iconbtn" onClick={onClose} aria-label="Close" autoFocus><Icon name="close" /></button>
        </div>
        <p className="row-sub">For ChatGPT, Claude or Gemini. Attach the .md file, then paste the prompt.</p>
        <label className="field">What you want
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="">Best for this stage</option>
            {s.goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        {problem && <p className="notice bad" role="alert">{problem}</p>}
        {!pack && !problem && <div className="skeleton" style={{ height: 160 }} />}
        {pack && (
          <>
            {pack.cut?.length > 0 && <p className="notice">The pack hit its size limit, so some notes were cut: {pack.cut.join(", ")}.</p>}
            <label className="field">Prompt<textarea id="deeper-prompt" readOnly value={pack.prompt} rows={8} /></label>
            <div className="actions start">
              <button className="btn primary" onClick={copy}>{copied ? 'Copied' : 'Copy prompt'}</button>
              <button className="btn" onClick={download}>Download .md</button>
            </div>
            <p className="row-sub">About {Math.round(pack.tokens / 100) / 10}k tokens.</p>
          </>
        )}
      </div>
    </>
  );
}
