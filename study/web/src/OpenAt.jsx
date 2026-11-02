import { useState } from 'react';
import { hubFile, openFile } from './api.js';
import { Icon } from './icons.jsx';

// "Open in book · p. 112": the hub file in a new tab, at that page. Files only on this computer have no link.
export default function OpenAt({ fileId, page, book = false, label }) {
  const [problem, setProblem] = useState('');
  if (!hubFile(fileId)) return null;
  const text = label || `Open in ${book ? 'book' : 'past paper'}${page ? ` · p. ${page}` : ''}`;
  return (
    <span className="openat">
      <button type="button" className="btn plain" onClick={() => { setProblem(''); openFile(fileId, page).catch((e) => setProblem(e.message)); }}>
        <Icon name="file" /> {text}
      </button>
      {problem && <span className="bad-text small" role="alert">{problem}</span>}
    </span>
  );
}
