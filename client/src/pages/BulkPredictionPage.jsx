import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react';
import { useRef } from 'react';
import { getErrorMessage } from '../api/axiosClient.js';
import Badge, { RiskBadge } from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card, { CardBody, CardHeader } from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatCard from '../components/common/StatCard.jsx';
import BulkUploadPanel, { downloadText } from '../components/prediction/BulkUploadPanel.jsx';
import { useBulkPrediction } from '../hooks/usePrediction.js';
import { formatMinutes, formatPct } from '../utils/formatters.js';

/** Quote a CSV cell and defuse spreadsheet formulas (=, +, -, @) in values that came from the user's own file. */
export const csvCell = (v) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function resultsToCsv(results) {
  const head = ['row', 'status', 'airline', 'origin', 'destination', 'scheduled_departure', 'risk', 'delay_probability', 'cancel_probability', 'typical_delay_minutes', 'notes'];
  const lines = results.map((r) => (r.status === 'ok'
    ? [r.row, 'ok', r.input.airline, r.input.origin, r.input.destination, r.input.scheduledDeparture, r.prediction.riskLevel, r.prediction.delayProbability, r.prediction.cancelProbability, r.prediction.predictedDelayMinutes ?? '', r.prediction.warnings.join('; ')]
    : [r.row, 'error', '', '', '', '', '', '', '', '', r.errors.join('; ')]));
  return [head, ...lines].map((l) => l.map(csvCell).join(',')).join('\n');
}

export default function BulkPredictionPage() {
  const m = useBulkPrediction();
  const resultsRef = useRef(null);
  const d = m.data;

  const columns = [
    { key: 'row', header: 'Row', align: 'right', sortable: true },
    { key: 'status', header: 'Status', render: (r) => (r.status === 'ok' ? <Badge tone="good" icon={CheckCircle2}>Predicted</Badge> : <Badge tone="bad" icon={AlertTriangle}>Error</Badge>) },
    { key: 'route', header: 'Flight', sortValue: (r) => (r.input ? `${r.input.origin}${r.input.destination}` : ''), sortable: true,
      render: (r) => (r.input ? <span><span className="code font-medium">{r.input.origin} → {r.input.destination}</span> <span className="muted text-xs">{r.input.airline} · {String(r.input.scheduledDeparture).replace('T', ' ').slice(0, 16)}</span></span> : '-') },
    { key: 'risk', header: 'Risk', render: (r) => (r.prediction ? <RiskBadge level={r.prediction.riskLevel} /> : '-') },
    { key: 'delay', header: 'Delay', align: 'right', sortable: true, sortValue: (r) => r.prediction?.delayProbability, render: (r) => (r.prediction ? formatPct(r.prediction.delayProbability) : '-') },
    { key: 'cancel', header: 'Cancel', align: 'right', sortable: true, sortValue: (r) => r.prediction?.cancelProbability, render: (r) => (r.prediction ? formatPct(r.prediction.cancelProbability) : '-') },
    { key: 'minutes', header: 'Typical delay', align: 'right', render: (r) => (r.prediction?.predictedDelayMinutes != null ? formatMinutes(r.prediction.predictedDelayMinutes) : '-') },
    { key: 'notes', header: 'Notes', className: 'max-w-xs whitespace-normal text-xs', render: (r) => (r.errors ? <span className="text-red-700 dark:text-red-400">{r.errors.join('; ')}</span> : <span className="muted">{r.prediction.warnings.join('; ') || '-'}</span>) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader icon={FileSpreadsheet} title="Bulk prediction" subtitle="Upload a CSV of up to 500 flights and get a risk score for each. Rows with problems are listed so you can fix them." />
      <Card>
        <CardHeader title="Upload a CSV" subtitle="Weather columns are optional; typical conditions are used when they are empty." />
        <CardBody>
          <BulkUploadPanel loading={m.isPending} onSubmit={(file) => m.mutate(file, { onSuccess: () => requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' })) })} />
          {m.isError && <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">{getErrorMessage(m.error, 'The upload failed.')}</p>}
        </CardBody>
      </Card>

      {d && (
        <div ref={resultsRef} className="space-y-4" aria-live="polite">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Rows" value={d.summary.total} icon={FileSpreadsheet} />
            <StatCard label="Predicted" value={d.summary.ok} tone="good" icon={CheckCircle2} />
            <StatCard label="Need attention" value={d.summary.failed} tone={d.summary.failed ? 'bad' : 'good'} icon={AlertTriangle} />
          </div>
          <Card>
            <CardHeader title="Results" actions={<Button variant="secondary" icon={Download} onClick={() => downloadText('flight-delay-results.csv', resultsToCsv(d.results))}>Download CSV</Button>} />
            <CardBody><DataTable columns={columns} rows={d.results} rowKey={(r) => r.row} pageSize={25} dense caption="Bulk prediction results" /></CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
