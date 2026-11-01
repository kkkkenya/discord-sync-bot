import { createRoot } from 'react-dom/client';
import './styles.css';
import './legacy.css';
import Gate from './Gate.jsx';

createRoot(document.getElementById('root')).render(<Gate />);
