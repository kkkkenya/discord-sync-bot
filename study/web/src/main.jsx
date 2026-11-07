import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/manrope';
import './styles.css';
import './wallpaper.css';
import Gate from './Gate.jsx';
import './install.js';
import { applyLook } from './look.js';

applyLook();

// Typing on a phone: the keyboard takes half the screen, so the tab bar and the folded notes strip step aside
// (body.typing in styles.css) instead of sitting on top of the field and the work above it.
if (matchMedia('(pointer: coarse)').matches) {
  const field = (el) => el?.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]');
  addEventListener('focusin', (e) => { if (field(e.target)) document.body.classList.add('typing'); });
  addEventListener('focusout', () => setTimeout(() => { if (!field(document.activeElement)) document.body.classList.remove('typing'); }, 60));
}
createRoot(document.getElementById('root')).render(<Gate />);

// Offline reading and installs. The version in the URL makes each build a new worker, which waits for the next open.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`/sw.js?v=${__CRUX_VERSION__}`).catch(() => { /* private mode: Crux still works online */ });
}
