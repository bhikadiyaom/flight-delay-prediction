import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import ChartFrame, { axisProps, tooltipProps, useChartTheme } from './ChartFrame.jsx';
import { MODEL_LABELS } from './ModelComparisonChart.jsx';

/** ROC curves for the delay classifiers (roc = { model: [{fpr, tpr}] }). The dashed diagonal is random guessing. */
export default function RocCurveChart({ roc, auc = {} }) {
  const t = useChartTheme();
  const names = Object.keys(roc);
  return (
    <ChartFrame label="ROC curves for the delay classifiers on held-out flights" summary="All curves sit only a little above the random-guess diagonal." height={320}>
      <LineChart margin={{ top: 12, right: 12, bottom: 20, left: 0 }}>
        <CartesianGrid stroke={t.grid} strokeDasharray="3 3" />
        <XAxis type="number" dataKey="fpr" domain={[0, 1]} {...axisProps(t)} tickFormatter={(v) => v.toFixed(1)} label={{ value: 'False positive rate', position: 'insideBottom', offset: -10, fill: t.text, fontSize: 12 }} />
        <YAxis type="number" dataKey="tpr" domain={[0, 1]} {...axisProps(t)} tickFormatter={(v) => v.toFixed(1)} width={36} label={{ value: 'True positive rate', angle: -90, position: 'insideLeft', fill: t.text, fontSize: 12 }} />
        <Tooltip {...tooltipProps(t)} formatter={(v) => Number(v).toFixed(3)} labelFormatter={(l) => `FPR ${Number(l).toFixed(3)}`} />
        <Legend wrapperStyle={{ color: t.text, fontSize: 12 }} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={t.axis} strokeDasharray="5 5" />
        {names.map((n, i) => (
          <Line key={n} data={roc[n]} dataKey="tpr" type="monotone" dot={false} strokeWidth={n === 'xgboost' ? 3 : 1.75} stroke={t.series[i % t.series.length]}
            name={`${MODEL_LABELS[n] ?? n}${auc[n] ? ` (AUC ${auc[n].toFixed(3)})` : ''}`} />
        ))}
      </LineChart>
    </ChartFrame>
  );
}
