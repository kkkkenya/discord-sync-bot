import { PLAN_NAMES, PLAN_STAR } from '../../../lib/plan-names.js';

// Plans are named after the stars of the Southern Cross, the brightest for the highest plan (owner, 2026-11-12).
// The student's star shines; the others stay faint. Same drawing as the Crux mark.
const STARS = [
  { id: 'gacrux', cx: 494, cy: 212, r: 44 },
  { id: 'mimosa', cx: 251, cy: 512, r: 54 },
  { id: 'imai', cx: 802, cy: 399, r: 42 },
  { id: 'acrux', cx: 567, cy: 811, r: 70 },
  { id: 'ginan', cx: 668, cy: 575, r: 20 },
];

export const planName = (tier) => PLAN_NAMES[tier] || tier;

export default function PlanStars({ tier, className = 'planstars' }) {
  const star = PLAN_STAR[tier] || null;
  return (
    <svg viewBox="100 60 830 900" className={className} role="img" aria-label={star ? `${planName(tier)}, your plan's star in the Southern Cross` : 'The Southern Cross'}>
      <g stroke="#f2c200" strokeOpacity="0.25" strokeWidth="14" strokeLinecap="round">
        <line x1="494" y1="212" x2="567" y2="811" />
        <line x1="251" y1="512" x2="802" y2="399" />
      </g>
      {STARS.map((s) => (
        <g key={s.id}>
          {s.id === star && <circle cx={s.cx} cy={s.cy} r={s.r * 2.2} fill="#f2c200" opacity="0.25" />}
          <circle cx={s.cx} cy={s.cy} r={s.id === star ? s.r * 1.25 : s.r} fill="#f2c200" opacity={s.id === star ? 1 : 0.3} />
        </g>
      ))}
    </svg>
  );
}
