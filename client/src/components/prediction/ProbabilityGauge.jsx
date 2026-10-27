import { chartTheme } from '../../utils/constants.js';
import { useTheme } from '../../hooks/useTheme.js';
import { formatPct } from '../../utils/formatters.js';

const CX = 100;
const CY = 100;
const R = 78;
const polar = (deg) => [CX + R * Math.cos((Math.PI * deg) / 180), CY - R * Math.sin((Math.PI * deg) / 180)];
/** Arc along the top semicircle from fraction a to b (0 = left end, 1 = right end). */
function arc(a, b) {
  const [x1, y1] = polar(180 - 180 * a);
  const [x2, y2] = polar(180 - 180 * b);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Semicircle gauge of a REAL (calibrated) probability. `max` is the full-scale value (1 for delay; cancellations are rare so
 * their gauge uses a smaller scale), `zones` the low/medium/high boundaries in probability units. Exposed as role="meter".
 */
export default function ProbabilityGauge({ value, label, max = 1, zones = { medium: 0.2, high: 0.4 }, digits = 0, className }) {
  const { resolved } = useTheme();
  const t = chartTheme(resolved);
  const v = Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;
  const frac = v / max;
  const level = value >= zones.high ? 'high' : value >= zones.medium ? 'medium' : 'low';
  const colour = t[level];
  const m = Math.min(zones.medium / max, 1);
  const h = Math.min(zones.high / max, 1);
  const [nx, ny] = polar(180 - 180 * frac);
  const words = { low: 'low risk', medium: 'medium risk', high: 'high risk' }[level];
  return (
    <div className={className}>
      <svg viewBox="0 0 200 124" role="meter" aria-label={`${label}: ${formatPct(value, digits)}, ${words}`} aria-valuemin={0} aria-valuemax={max}
        aria-valuenow={Number(v.toFixed(4))} aria-valuetext={`${formatPct(value, digits)} (${words})`} className="mx-auto block w-full max-w-[260px]">
        <g fill="none" strokeWidth="16" strokeLinecap="butt" opacity="0.28">
          <path d={arc(0, m)} stroke={t.low} />
          <path d={arc(m, h)} stroke={t.medium} />
          <path d={arc(h, 1)} stroke={t.high} />
        </g>
        {frac > 0 && <path d={arc(0, Math.max(frac, 0.004))} fill="none" stroke={colour} strokeWidth="16" strokeLinecap="round" />}
        <circle cx={nx} cy={ny} r="6" fill={t.tooltipBg} stroke={colour} strokeWidth="3" />
        <text x={CX} y={CY - 12} textAnchor="middle" fontSize="30" fontWeight="600" fill={t.strong} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPct(value, digits)}</text>
        <text x={CX} y={CY + 8} textAnchor="middle" fontSize="11" fill={t.text}>{words}</text>
      </svg>
      <p className="mt-1 text-center text-sm font-medium">{label}</p>
    </div>
  );
}
