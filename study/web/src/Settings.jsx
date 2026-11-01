import { useEffect } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';

const TIER = { owner: 'Owner', premium: 'Premium', basic: 'Basic', trial: 'Free trial' };

// Settings: a full-screen sheet on phones, a side panel from 768px. Esc or the scrim closes it.
export default function Settings({ s, user, refresh, onClose, onProblem }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onClose]);
  const setting = (body) => api('POST', 'settings', body).then(refresh).catch((e) => onProblem(e.message));
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="sheet-head">
          <h1 id="settings-title">Settings</h1>
          <button className="iconbtn" onClick={onClose} aria-label="Close settings" autoFocus><Icon name="close" /></button>
        </div>
        <div className="card">
          <label className="field">Study stage
            <select value={s.settings.stage || ''} onChange={(e) => setting({ stage: e.target.value || null })}>
              <option value="">From each unit's date</option>
              {s.stages.map((st) => <option key={st.id} value={st.id}>All units: {st.name}</option>)}
            </select>
          </label>
          <label className="field">AI
            <select value={s.settings.aiProvider} onChange={(e) => setting({ aiProvider: e.target.value })}>
              <option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option>
            </select>
            <span className="hint">{s.ai ? 'Ready.' : `Not available right now. Pick the other one.`}</span>
          </label>
        </div>
        {user && (
          <div className="card">
            <p><b>{user.name}</b></p>
            <p className="hint">{TIER[user.tier] || user.tier}</p>
            <a className="btn" href="/auth/logout">Sign out</a>
          </div>
        )}
      </div>
    </>
  );
}
