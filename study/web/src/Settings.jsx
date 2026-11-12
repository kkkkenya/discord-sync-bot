import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon } from './icons.jsx';
import ImportNotes from './ImportNotes.jsx';
import { InstallCard } from './Install.jsx';
import { KEEP_CHOICES, keptPages, memoryUse, setKeptPages } from './keep.js';
import { getLook, setLook } from './look.js';
import PlanStars, { planName } from './PlanStars.jsx';


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
  // "Bring data back": the file from Export my data, merged in (nothing you have now is replaced)
  const importData = async (f) => {
    if (!f) return;
    try {
      const out = await api('POST', 'import', JSON.parse(await f.text()));
      const n = Object.values(out.added || {}).reduce((a, b) => a + b, 0);
      notify(n ? `Brought back ${n} item${n === 1 ? '' : 's'}.` : 'Nothing was missing: your data already has everything in that file.');
      await refresh();
    } catch (e) { onProblem(e instanceof SyntaxError ? "That file isn't a Crux export." : e.message); }
  };
  const [usage, setUsage] = useState(null);
  useEffect(() => { api('GET', 'usage').then(setUsage).catch(() => {}); }, []);
  const setting = (body) => api('POST', 'settings', body).then(refresh).catch((e) => onProblem(e.message));
  const [look, setLookState] = useState(getLook);
  const [keep, setKeep] = useState(keptPages);
  const [mem, setMem] = useState(memoryUse);
  // the offline copies of pages and API answers (the service worker's cache) and the hidden pages
  const clearCache = async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* no cache */ }
    window.dispatchEvent(new CustomEvent('crux-keep', { detail: { all: true } }));
    setTimeout(() => setMem(memoryUse()), 500);
    notify('Cleared. Pages you open next load fresh.');
  };
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
          {s.provider === 'claude-code' ? (
            <p className="field">AI <span className="hint">Claude Code on this computer, on your Claude plan. Started from Crux (local).bat; the website still uses Gemini.</span></p>
          ) : <label className="field">AI
            <select value={s.settings.aiProvider} onChange={(e) => setting({ aiProvider: e.target.value })}>
              <option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option>
            </select>
            <span className="hint">{s.ai ? 'Ready.' : `Not available right now. Pick the other one.`}{usage?.ai && usage.ai.limit !== null && Number.isFinite(usage.ai.limit) ? ` AI today: ${usage.ai.used} of ${usage.ai.limit}.` : ''}</span>
          </label>}
        </div>
        <div className="card">
          <div className="field">Appearance
            <div className="segmented" role="group" aria-label="Appearance">
              {[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([id, name]) => (
                <button key={id} type="button" aria-pressed={(look.theme || 'system') === id} onClick={() => setLookState(setLook({ theme: id }))}>{name}</button>
              ))}
            </div>
            <span className="hint">System follows your phone or laptop's light and dark setting.</span>
          </div>
          <label className="field">Wallpaper
            <select value={look.wp} onChange={(e) => setLookState(setLook({ wp: e.target.value }))}>
              <option value="auto">Lagoon when light, Ember when dark</option>
              <option value="lagoon">Lagoon: light on water</option>
              <option value="ember">Ember: paper and rising flecks</option>
              <option value="dusk">Dusk: stars and a slow haze</option>
              <option value="harbor">Harbor: a harbour chart</option>
              <option value="fern">Fern: fronds from two corners</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={look.motion === 'on'} onChange={(e) => setLookState(setLook({ motion: e.target.checked ? 'on' : 'off' }))} />
            Moving wallpaper
          </label>
        </div>
        <div className="card">
          <label className="field">Pages kept open
            <select value={keep} onChange={(e) => { const n = Number(e.target.value); setKeep(n); setKeptPages(n); }}>
              {KEEP_CHOICES.map((n) => <option key={n} value={n}>{n === 1 ? 'None: every page loads fresh' : `Up to ${n}`}</option>)}
            </select>
            <span className="hint">Pages you leave stay loaded, so going to your notes and back finds the question where you left it. Fewer uses less memory on an older phone.{mem ? ` Crux is using ${mem.mb} MB now.` : ''}</span>
          </label>
          {mem?.high && <p className="notice" role="status">That's a lot for this device. Keep fewer pages open, or clear the cache.</p>}
          <div className="actions start"><button type="button" className="btn" onClick={clearCache}>Clear cache</button></div>
        </div>
        <InstallCard notify={notify} />
        {s.data.units.length > 0 && <ImportNotes s={s} unit={unit} refresh={refresh} notify={notify} onProblem={onProblem} />}
        <div className="card">
          {user && (
            <div className="plan-line">
              <PlanStars tier={user.tier} />
              <span><b>{user.name}</b><span className="row-sub">{planName(user.tier)} plan{user.tier === 'trial' ? ' · free trial' : ''}</span></span>
            </div>
          )}
          <div className="actions start">
            <button className="btn" onClick={exportData}>Export my data</button>
            <label className="btn">Bring data back<input type="file" accept=".json,application/json" className="visually-hidden" onChange={(e) => { importData(e.target.files[0]); e.target.value = ''; }} /></label>
            <a className="btn" href="/auth/logout" onClick={forget}>Sign out</a>
          </div>
          <p className="row-sub">Your work is saved in your account. If your trial or membership ends it's kept, and it's all there when you're back.</p>
        </div>
      </div>
    </>
  );
}
