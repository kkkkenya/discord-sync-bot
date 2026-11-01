// The honest warning before heavy built-in AI work: its context and effort limits, and the way round them.
export default function LimitNote({ s, unit, topic, go, what = 'long engineering working' }) {
  if (!s.ai) return null;
  const synced = Object.values(s.library || {}).filter((e) => e.unit === unit).reduce((n, e) => n + (e.chars || 0), 0);
  return (
    <p className="notice muted small">
      The built-in AI is a fast model with limits; on {what} it can skip steps or slip on signs.
      {synced > 12000 && ` Only about 12,000 of the ${synced.toLocaleString()} characters read for ${unit} fit into it.`}
      {' '}For a full derivation, take a Go deeper pack to a stronger AI.{' '}
      {unit && <button type="button" className="btn plain" onClick={() => go('prompt', { unit, topic })}>Go deeper</button>}
    </p>
  );
}
