// Photos of working and voice teach-backs (Phase 9). Kept in data/uploads/ (git-ignored, like the rest of data/) and
// sent only to the AI provider you chose. A file arrives as { mime, data: base64 }.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DATA_DIR } from './store.js';

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac',
};
export const MAX_BASE64 = 12 * 1024 * 1024; // about 9 MB of file: a resized photo is well under 1 MB, 4 minutes of voice about 7.7 MB
const bad = (message) => Object.assign(new Error(message), { status: 400 });

// { mime, data } checked: the right kind (photo/audio), a type the AIs read, not too big. Returns it with a plain mime.
export function checkMedia(m, kind) {
  if (!m?.data || !m?.mime) throw bad(kind === 'photo' ? 'No photo came through. Pick or take one again.' : 'No recording came through. Record again.');
  const mime = String(m.mime).split(';')[0].trim().toLowerCase();
  if (!EXT[mime] || !mime.startsWith(kind === 'photo' ? 'image/' : 'audio/')) throw bad(kind === 'photo' ? 'Send a JPEG, PNG or WebP photo.' : 'Send a WAV, OGG, MP3 or M4A recording.');
  if (m.data.length > MAX_BASE64) throw bad(kind === 'photo' ? 'That photo is too big. Take it again a little further away.' : 'That recording is too long. Keep it under 4 minutes.');
  return { mime, data: m.data };
}

// Saves it and returns its path inside data/, e.g. 'uploads/photo-1a2b3c4d.jpg'.
export function saveUpload(m, prefix) {
  const dir = new URL('uploads/', DATA_DIR);
  mkdirSync(dir, { recursive: true });
  const name = `${prefix}-${randomUUID().slice(0, 8)}.${EXT[m.mime]}`;
  writeFileSync(new URL(name, dir), Buffer.from(m.data, 'base64'));
  return `uploads/${name}`;
}
