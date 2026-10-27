import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { formatInt, formatPct } from '../../utils/formatters.js';
import ChartFrame, { tooltipProps, useChartTheme } from './ChartFrame.jsx';

/** Share of delay minutes by cause (carrier, weather, NAS, security, late aircraft). The legend prints the numbers. */
export default function DelayCauseChart({ data }) {
  const t = useChartTheme();
  const rows = [...data].sort((a, b) => b.share - a.share);
  return (
    <div className="grid items-center gap-4 sm:grid-cols-2">
      <ChartFrame label="Share of delay minutes by cause" summary={`Largest cause: ${rows[0]?.cause}, ${formatPct(rows[0]?.share, 0)}.`} height={240}>
        <PieChart>
          <Pie data={rows} dataKey="minutes" nameKey="cause" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke={t.tooltipBg} strokeWidth={2}>
            {rows.map((r, i) => <Cell key={r.cause} fill={t.series[i % t.series.length]} />)}
          </Pie>
          <Tooltip {...tooltipProps(t)} formatter={(v, name) => [`${formatInt(v)} min`, name]} />
        </PieChart>
      </ChartFrame>
      <ul className="space-y-2 text-sm">
        {rows.map((r, i) => (
          <li key={r.cause} className="flex items-center gap-2.5">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: t.series[i % t.series.length] }} aria-hidden="true" />
            <span className="flex-1">{r.cause}</span>
            <span className="font-semibold tabular-nums">{formatPct(r.share, 1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
