import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';
import ImportNotes from './ImportNotes.jsx';

const TIER = { owner: 'Owner', premium: 'Premium', basic: 'Basic', trial: 'Free trial' };

// Settings: a full-screen sheet on phones, a side panel from 768px. Esc or the scrim closes it.
export default function Settings({ s, user, unit, refresh, notify, onClose, onProblem }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onClose]);
  // the offline copy of your data stays on this device until you sign out
  const forget = () => { try { caches?.keys().then((keys) => keys.forEach((k) => caches.delete(k))); } catch { /* no cache */ } };
  const exportData = () => api('GET', 'export').then((out) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `crux-${s.today}.json` }).click();
    URL.revokeObjectURL(url);
  }).catch((e) => onProblem(e.message));
  const [usage, setUsage] = useState(null);
  useEffect(() => { api('GET', 'usage').then(setUsage).catch(() => {}); }, []);
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
            <span className="hint">{s.ai ? 'Ready.' : `Not available right now. Pick the other one.`}{usage?.ai && usage.ai.limit !== null && Number.isFinite(usage.ai.limit) ? ` AI today: ${usage.ai.used} of ${usage.ai.limit}.` : ''}</span>
          </label>
        </div>
        {s.data.units.length > 0 && <ImportNotes s={s} unit={unit} refresh={refresh} notify={notify} onProblem={onProblem} />}
        <div className="card">
          {user && <><p><b>{user.name}</b></p><p className="row-sub">{TIER[user.tier] || user.tier}</p></>}
          <div className="actions start">
            <button className="btn" onClick={exportData}>Export my data</button>
            <a className="btn" href="/auth/logout" onClick={forget}>Sign out</a>
          </div>
        </div>
      </div>
    </>
  );
}
