import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, Tooltip, XAxis, YAxis } from 'recharts';
import { MONTH_NAMES } from '../../utils/formatters.js';
import ChartFrame, { axisProps, tooltipProps, useChartTheme } from './ChartFrame.jsx';

const pct = (v) => `${(v * 100).toFixed(1)}%`;

/** Delay rate (bars, left axis) and cancel rate (line, right axis) by month. The shaded band is the model's test period. */
export default function DelayByMonthChart({ data, shadeFrom = 'Oct', shadeTo = 'Dec' }) {
  const t = useChartTheme();
  const rows = data.map((d) => ({ month: MONTH_NAMES[d.month - 1], delay: d.delay_rate, cancel: d.cancel_rate }));
  const peak = [...rows].sort((a, b) => b.delay - a.delay)[0];
  return (
    <ChartFrame label="Delay and cancellation rate by month" summary={peak ? `Worst month for delays: ${peak.month}, ${pct(peak.delay)}.` : ''} height={300}>
      <ComposedChart data={rows} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" {...axisProps(t)} />
        <YAxis yAxisId="l" {...axisProps(t)} tickFormatter={pct} width={48} />
        <YAxis yAxisId="r" orientation="right" {...axisProps(t)} tickFormatter={pct} width={44} />
        <Tooltip {...tooltipProps(t)} formatter={(v, name) => [pct(v), name]} />
        <Legend wrapperStyle={{ color: t.text, fontSize: 12 }} />
        <ReferenceArea yAxisId="l" x1={shadeFrom} x2={shadeTo} fill={t.secondary} fillOpacity={0.1} stroke="none" label={{ value: 'test period', fill: t.text, fontSize: 11, position: 'insideTop' }} />
        <Bar yAxisId="l" dataKey="delay" name="Delayed 15+ min" fill={t.primary} radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Line yAxisId="r" dataKey="cancel" name="Cancelled" stroke={t.high} strokeWidth={2.5} dot={{ r: 3, fill: t.high }} />
      </ComposedChart>
    </ChartFrame>
  );
}
