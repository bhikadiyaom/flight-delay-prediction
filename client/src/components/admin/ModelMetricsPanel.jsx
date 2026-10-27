import { RefreshCw } from 'lucide-react';
import Badge from '../common/Badge.jsx';
import Button from '../common/Button.jsx';
import Card, { CardHeader } from '../common/Card.jsx';
import DataTable from '../common/DataTable.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { MODEL_LABELS } from '../charts/ModelComparisonChart.jsx';

const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '-');

/** Stored model snapshots (GET /admin/metrics) with a button that pulls fresh ones from the ml-service. */
export default function ModelMetricsPanel({ items, onRefresh, refreshing }) {
  const columns = [
    { key: 'modelName', header: 'Model', sortable: true, render: (r) => <span className="font-medium">{MODEL_LABELS[r.modelName] ?? r.modelName}{r.isProduction && <Badge tone="good" className="ml-2">Production</Badge>}</span> },
    { key: 'target', header: 'Target', render: (r) => r.target ?? r.task },
    { key: 'version', header: 'Version', render: (r) => <span className="code text-xs">{r.version}</span> },
    { key: 'rocAuc', header: 'ROC AUC', align: 'right', sortable: true, sortValue: (r) => r.metrics?.rocAuc, render: (r) => f3(r.metrics?.rocAuc) },
    { key: 'f1', header: 'F1', align: 'right', sortable: true, sortValue: (r) => r.metrics?.f1, render: (r) => f3(r.metrics?.f1) },
    { key: 'precision', header: 'Precision', align: 'right', render: (r) => f3(r.metrics?.precision) },
    { key: 'recall', header: 'Recall', align: 'right', render: (r) => f3(r.metrics?.recall) },
    { key: 'mae', header: 'MAE (min)', align: 'right', render: (r) => (Number.isFinite(r.metrics?.mae) ? r.metrics.mae.toFixed(1) : '-') },
  ];
  return (
    <Card>
      <CardHeader title="Model snapshots" subtitle="Test-period metrics stored in MongoDB"
        actions={<Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={onRefresh}>Refresh from ML service</Button>} />
      <div className="p-5">
        {items.length
          ? <DataTable columns={columns} rows={items} initialSort={{ key: 'rocAuc', dir: 'desc' }} caption="Stored model metric snapshots" />
          : <EmptyState title="No snapshots yet" description="Use “Refresh from ML service” to store the current model metrics." />}
      </div>
    </Card>
  );
}
