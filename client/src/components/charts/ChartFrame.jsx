import { ResponsiveContainer } from 'recharts';
import { useTheme } from '../../hooks/useTheme.js';
import { chartTheme } from '../../utils/constants.js';

/** Theme object from the RESOLVED theme (Recharts ignores Tailwind dark: classes). */
export const useChartTheme = () => chartTheme(useTheme().resolved);

/**
 * Fixed-height responsive box. `label` (+ optional `summary`) is announced to screen readers; the visual chart is
 * hidden from them because SVG charts are not navigable. Values are always printed on/near the marks, never colour only.
 */
export default function ChartFrame({ label, summary, height = 288, children }) {
  return (
    <figure className="m-0" style={{ height }}>
      <figcaption className="sr-only">{label}{summary ? `. ${summary}` : ''}</figcaption>
      <div aria-hidden="true" className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </figure>
  );
}

export const tooltipProps = (t) => ({
  contentStyle: { background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 10, color: t.strong, fontSize: 13, boxShadow: '0 4px 14px rgb(0 0 0 / 0.15)' },
  labelStyle: { color: t.strong, fontWeight: 600 },
  itemStyle: { color: t.text },
  cursor: { fill: t.cursor },
});

export const axisProps = (t) => ({ stroke: t.axis, tick: { fill: t.text, fontSize: 12 }, tickLine: false });
