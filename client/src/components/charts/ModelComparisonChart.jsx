import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import ChartFrame, { axisProps, tooltipProps, useChartTheme } from './ChartFrame.jsx';

const METRICS = [
  { key: 'roc_auc', label: 'ROC AUC' }, { key: 'pr_auc', label: 'PR AUC' }, { key: 'f1', label: 'F1' },
  { key: 'precision', label: 'Precision' }, { key: 'recall', label: 'Recall' },
];
export const MODEL_LABELS = { logreg: 'Logistic regression', random_forest: 'Random forest', xgboost: 'XGBoost', neural_net: 'Neural network' };

/** Grouped bars: one group per metric, one bar per model (delay classifier, test months). */
export default function ModelComparisonChart({ models }) {
  const t = useChartTheme();
  const rows = METRICS.map((m) => ({ metric: m.label, ...Object.fromEntries(models.map((x) => [x.model_name, x.metrics[m.key] ?? null])) }));
  return (
    <ChartFrame label="Model comparison on held-out October to December flights" summary="Grouped bars of ROC AUC, PR AUC, F1, precision and recall for each model." height={320}>
      <BarChart data={rows} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={t.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="metric" {...axisProps(t)} />
        <YAxis {...axisProps(t)} domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} width={36} />
        <Tooltip {...tooltipProps(t)} formatter={(v, name) => [Number(v).toFixed(3), MODEL_LABELS[name] ?? name]} />
        <Legend wrapperStyle={{ color: t.text, fontSize: 12 }} formatter={(v) => MODEL_LABELS[v] ?? v} />
        {models.map((m, i) => <Bar key={m.model_name} dataKey={m.model_name} fill={t.series[i % t.series.length]} radius={[3, 3, 0, 0]} maxBarSize={22} />)}
      </BarChart>
    </ChartFrame>
  );
}
