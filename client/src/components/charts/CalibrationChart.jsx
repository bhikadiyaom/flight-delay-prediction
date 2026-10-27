import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import ChartFrame, { axisProps, tooltipProps, useChartTheme } from './ChartFrame.jsx';

/** Predicted vs observed delay frequency, before and after isotonic calibration. Closer to the diagonal is better. */
export default function CalibrationChart({ before, after, brierBefore, brierAfter }) {
  const t = useChartTheme();
  const max = Math.max(0.3, ...before.map((p) => p.predicted), ...after.map((p) => p.predicted), ...after.map((p) => p.observed));
  return (
    <ChartFrame label="Calibration curve before and after isotonic calibration" summary={`Brier score ${brierBefore?.toFixed(3)} before, ${brierAfter?.toFixed(3)} after.`} height={300}>
      <LineChart margin={{ top: 12, right: 12, bottom: 20, left: 0 }}>
        <CartesianGrid stroke={t.grid} strokeDasharray="3 3" />
        <XAxis type="number" dataKey="predicted" domain={[0, max]} {...axisProps(t)} tickFormatter={(v) => `${Math.round(v * 100)}%`} label={{ value: 'Predicted probability', position: 'insideBottom', offset: -10, fill: t.text, fontSize: 12 }} />
        <YAxis type="number" dataKey="observed" domain={[0, max]} {...axisProps(t)} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={44} label={{ value: 'Observed frequency', angle: -90, position: 'insideLeft', fill: t.text, fontSize: 12 }} />
        <Tooltip {...tooltipProps(t)} formatter={(v) => `${(v * 100).toFixed(1)}%`} labelFormatter={(l) => `Predicted ${(l * 100).toFixed(1)}%`} />
        <Legend wrapperStyle={{ color: t.text, fontSize: 12 }} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke={t.axis} strokeDasharray="5 5" />
        <Line data={before} dataKey="observed" name={`Raw (Brier ${brierBefore?.toFixed(3)})`} stroke={t.series[1]} strokeWidth={2} dot={{ r: 3 }} />
        <Line data={after} dataKey="observed" name={`Calibrated (Brier ${brierAfter?.toFixed(3)})`} stroke={t.series[0]} strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ChartFrame>
  );
}
