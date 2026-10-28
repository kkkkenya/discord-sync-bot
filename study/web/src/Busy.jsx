import { useElapsed } from './api.js';

// A button label for slow AI calls: "Mapping… 12s" while it runs, so a long wait doesn't look stuck.
export default function Busy({ on, label, idle }) {
  const n = useElapsed(on);
  return on ? `${label} ${n}s` : idle;
}
