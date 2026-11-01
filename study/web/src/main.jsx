import { createRoot } from 'react-dom/client';
import './styles.css';
import './legacy.css';
import Gate from './Gate.jsx';

createRoot(document.getElementById('root')).render(<Gate />);

// Offline reading and installs. The version in the URL makes each build a new worker, which waits for the next open.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`/sw.js?v=${__CRUX_VERSION__}`).catch(() => { /* private mode: Crux still works online */ });
}
