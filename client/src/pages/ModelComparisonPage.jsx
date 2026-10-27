import { FlaskConical, Scale, Sigma } from 'lucide-react';
import Badge from '../components/common/Badge.jsx';
import Card, { CardBody, CardHeader } from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import QueryState from '../components/common/QueryState.jsx';
import StatCard from '../components/common/StatCard.jsx';
import CalibrationChart from '../components/charts/CalibrationChart.jsx';
import ConfusionMatrixChart from '../components/charts/ConfusionMatrixChart.jsx';
import ModelComparisonChart, { MODEL_LABELS } from '../components/charts/ModelComparisonChart.jsx';
import RateBarChart from '../components/charts/RateBarChart.jsx';
import RocCurveChart from '../components/charts/RocCurveChart.jsx';
import { useModelsCompare } from '../hooks/useFlightLookup.js';
import { featureLabel, formatInt, formatMinutes } from '../utils/formatters.js';

const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '-');

function Content({ d }) {
  const delay = d.models.filter((m) => m.task === 'classifier' && m.target === 'delay');
  const prod = delay.find((m) => m.is_production) ?? delay[0];
  const cancel = d.models.find((m) => m.task === 'classifier' && m.target === 'cancel');
  const reg = d.models.find((m) => m.task === 'regressor');
  const rnd = d.random_split_experiment?.test?.metrics;
  const importance = Object.entries(d.feature_importance).slice(0, 12).map(([k, v]) => ({ label: featureLabel(k), value: v }));
  const auc = Object.fromEntries(delay.map((m) => [m.model_name, m.metrics.roc_auc]));
  const cal = d.calibration.delay;

  const columns = [
    { key: 'model_name', header: 'Model', sortable: true, render: (m) => <span className="font-medium">{MODEL_LABELS[m.model_name] ?? m.model_name}{m.is_production && <Badge tone="good" className="ml-2">In production</Badge>}</span> },
    { key: 'roc_auc', header: 'ROC AUC', align: 'right', sortable: true, sortValue: (m) => m.metrics.roc_auc, render: (m) => f3(m.metrics.roc_auc) },
    { key: 'pr_auc', header: 'PR AUC', align: 'right', sortable: true, sortValue: (m) => m.metrics.pr_auc, render: (m) => f3(m.metrics.pr_auc) },
    { key: 'f1', header: 'F1', align: 'right', sortable: true, sortValue: (m) => m.metrics.f1, render: (m) => f3(m.metrics.f1) },
    { key: 'precision', header: 'Precision', align: 'right', sortable: true, sortValue: (m) => m.metrics.precision, render: (m) => f3(m.metrics.precision) },
    { key: 'recall', header: 'Recall', align: 'right', sortable: true, sortValue: (m) => m.metrics.recall, render: (m) => f3(m.metrics.recall) },
    { key: 'accuracy', header: 'Accuracy', align: 'right', sortable: true, sortValue: (m) => m.metrics.accuracy, render: (m) => f3(m.metrics.accuracy) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Sigma} label="Production ROC AUC" value={f3(prod.metrics.roc_auc)} hint="0.5 = guessing, 1.0 = perfect" />
        <StatCard icon={Scale} label="Calibration (Brier)" value={f3(cal.brier_after)} hint={`was ${f3(cal.brier_before)} before calibration`} tone="good" />
        <StatCard icon={FlaskConical} label="Typical delay error" value={reg ? formatMinutes(reg.metrics.mae) : '-'} hint="mean absolute error, delayed flights" tone="warn" />
        <StatCard label="Trained on" value={formatInt(prod.n_train)} hint={`flights, Jan to Aug · v${d.version.slice(1, 9)}`} tone="brand" />
      </div>

      <Card className="border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/30">
        <CardBody className="space-y-2 text-sm">
          <h2 className="text-base font-semibold">How to read these numbers</h2>
          <p>All models were trained on <strong>January to August</strong>, tuned on <strong>September</strong> and scored on <strong>October to December</strong>, months they never saw. {rnd && <>A random split would have shown an AUC of <strong>{f3(rnd.roc_auc)}</strong> instead of <strong>{f3(prod.metrics.roc_auc)}</strong>, because it lets the model learn the same weather episodes and seasonal levels it is tested on. We report the honest number.</>}</p>
          <p>Delays are hard to predict from the schedule alone: the models do not know the aircraft’s live state or the exact departure time. All four model types land within a hair of each other, which says the limit is the information available, not the algorithm. The test months also had far fewer delays (about 15% against 22% in training), which lowers precision for every model.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Delay classifiers compared" subtitle="Scored on October to December flights. Only XGBoost is deployed." />
        <CardBody className="space-y-6">
          <ModelComparisonChart models={delay} />
          <DataTable columns={columns} rows={delay} rowKey={(m) => m.model_name} initialSort={{ key: 'roc_auc', dir: 'desc' }} caption="Delay classifier metrics" />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="ROC curves" subtitle="Further up and left is better" /><CardBody><RocCurveChart roc={d.roc} auc={auc} /></CardBody></Card>
        <Card><CardHeader title="Production model: confusion matrix" subtitle={`Threshold ${prod.threshold?.toFixed(2)}, chosen on September`} />
          <CardBody>{prod.confusion_matrix ? <ConfusionMatrixChart matrix={prod.confusion_matrix} title="XGBoost delay confusion matrix" /> : null}</CardBody></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Are the probabilities honest?" subtitle="Calibration of the delay probability on test months" />
          <CardBody><CalibrationChart before={cal.curve_before} after={cal.curve_after} brierBefore={cal.brier_before} brierAfter={cal.brier_after} /></CardBody></Card>
        <Card><CardHeader title="What the model relies on" subtitle="XGBoost feature importance (share of total gain)" />
          <CardBody><RateBarChart data={importance} horizontal label="Feature importance" valueLabel="Importance" format={(v) => `${(v * 100).toFixed(0)}%`} labelWidth={170} /></CardBody></Card>
      </div>

      {cancel && (
        <Card>
          <CardHeader title="Cancellation model" subtitle="Cancellations are rare and driven by episodes like storms, so they are much harder to call." />
          <CardBody className="grid gap-4 sm:grid-cols-4">
            <StatCard label="ROC AUC" value={f3(cancel.metrics.roc_auc)} />
            <StatCard label="Brier score" value={f3(cancel.metrics.brier)} hint="calibrated" tone="good" />
            <StatCard label="Cancel rate in test" value={`${(cancel.metrics.positive_rate * 100).toFixed(2)}%`} hint="vs 1.6% in training" tone="warn" />
            <StatCard label="Precision" value={f3(cancel.metrics.precision)} hint="of flagged flights" tone="bad" />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function ModelComparisonPage() {
  const q = useModelsCompare();
  return (
    <div>
      <PageHeader icon={FlaskConical} title="Model accuracy" subtitle="Four model families compared on flights the models never saw, with the unflattering numbers included." />
      <QueryState query={q} skeletonHeight="h-96">{(d) => <Content d={d} />}</QueryState>
    </div>
  );
}
