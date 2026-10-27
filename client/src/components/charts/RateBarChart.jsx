import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import ChartFrame, { axisProps, tooltipProps, useChartTheme } from './ChartFrame.jsx';

/**
 * Shared bar chart: data = [{ label, value, ... }]. `horizontal` draws bars left-to-right (long labels).
 * `colorBy(value)` may return a colour per bar; values are printed at the bar end.
 */
export default function RateBarChart({ data, label, valueLabel = 'Value', format = (v) => `${(v * 100).toFixed(1)}%`, horizontal = false, height, colorBy, domainMax, labelWidth = 120 }) {
  const t = useChartTheme();
  const h = height ?? (horizontal ? Math.max(220, data.length * 30 + 40) : 288);
  const top = data.length ? [...data].sort((a, b) => b.value - a.value)[0] : null;
  const summary = top ? `Highest: ${top.label}, ${format(top.value)}.` : 'No data.';
  const margin = horizontal ? { top: 4, right: 52, bottom: 4, left: 4 } : { top: 20, right: 8, bottom: 4, left: 0 };
  return (
    <ChartFrame label={label} summary={summary} height={h}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={margin}>
        <CartesianGrid stroke={t.grid} strokeDasharray="3 3" horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps(t)} tickFormatter={format} domain={[0, domainMax ?? 'auto']} />
            <YAxis type="category" dataKey="label" width={labelWidth} {...axisProps(t)} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" {...axisProps(t)} interval={0} />
            <YAxis {...axisProps(t)} tickFormatter={format} domain={[0, domainMax ?? 'auto']} width={48} />
          </>
        )}
        <Tooltip {...tooltipProps(t)} formatter={(v) => [format(v), valueLabel]} />
        <Bar dataKey="value" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36}>
          {data.map((d, i) => <Cell key={d.label} fill={colorBy ? colorBy(d.value, d, i) : t.primary} />)}
          <LabelList dataKey="value" position={horizontal ? 'right' : 'top'} formatter={format} fill={t.text} fontSize={11} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}
