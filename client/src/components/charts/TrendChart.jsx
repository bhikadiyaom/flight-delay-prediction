import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { MONTH_NAMES } from '../../utils/formatters.js';
import ChartFrame, { axisProps, tooltipProps, useChartTheme } from './ChartFrame.jsx';

const pct = (v) => `${(v * 100).toFixed(1)}%`;

function tick(granularity) {
  return (iso) => {
    const [, m, d] = String(iso).split('-').map(Number);
    return granularity === 'month' ? MONTH_NAMES[m - 1] : `${MONTH_NAMES[m - 1]} ${d}`;
  };
}

/** Time series of the delay rate. Daily data also shows the 7-day moving average so the trend is readable. */
export default function TrendChart({ points, granularity = 'day' }) {
  const t = useChartTheme();
  const fmt = tick(granularity);
  const rows = points.map((p) => ({ date: p.date, rate: p.delay_rate, ma: p.delay_rate_ma7 }));
  return (
    <ChartFrame label={`Delay rate over time (${granularity})`} summary={`${rows.length} points.`} height={300}>
      <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" {...axisProps(t)} tickFormatter={fmt} minTickGap={36} />
        <YAxis {...axisProps(t)} tickFormatter={pct} width={48} domain={['auto', 'auto']} />
        <Tooltip {...tooltipProps(t)} labelFormatter={(l) => String(l)} formatter={(v, name) => [pct(v), name]} />
        <Legend wrapperStyle={{ color: t.text, fontSize: 12 }} />
        <Line dataKey="rate" name={granularity === 'day' ? 'Daily delay rate' : 'Delay rate'} stroke={t.series[0]} strokeOpacity={granularity === 'day' ? 0.45 : 1} strokeWidth={granularity === 'day' ? 1.5 : 2.5} dot={granularity === 'month' ? { r: 3 } : false} />
        {granularity === 'day' && <Line dataKey="ma" name="7-day average" stroke={t.series[1]} strokeWidth={2.5} dot={false} />}
      </LineChart>
    </ChartFrame>
  );
}
