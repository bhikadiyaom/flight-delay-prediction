import { Activity, FlaskConical, ListChecks, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from '../api/adminApi.js';
import { getErrorMessage } from '../api/axiosClient.js';
import { SkeletonCard } from '../components/common/Skeleton.jsx';
import { QueryError } from '../components/common/QueryState.jsx';
import Card, { CardBody, CardHeader } from '../components/common/Card.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import Tabs from '../components/common/Tabs.jsx';
import { useToast } from '../components/common/Toast.jsx';
import ModelMetricsPanel from '../components/admin/ModelMetricsPanel.jsx';
import PredictionLogTable from '../components/admin/PredictionLogTable.jsx';
import UsageStatsCards from '../components/admin/UsageStatsCards.jsx';

const TABS = [
  { value: 'overview', label: 'Usage', icon: Activity },
  { value: 'models', label: 'Models', icon: FlaskConical },
  { value: 'predictions', label: 'Prediction log', icon: ListChecks },
];

function Overview() {
  const q = useQuery({ queryKey: ['admin', 'stats'], queryFn: adminApi.stats, staleTime: 30 * 1000 });
  if (q.isError) return <QueryError error={q.error} onRetry={q.refetch} />;
  const s = q.data;
  return (
    <div className="space-y-6">
      <UsageStatsCards stats={s} loading={q.isPending} />
      {s && (
        <div className="grid gap-6 md:grid-cols-3">
          {[['By source', s.predictions.bySource], ['By risk level', s.predictions.byRiskLevel], ['By model version', s.predictions.byModelVersion]].map(([title, map]) => (
            <Card key={title}><CardHeader title={title} as="h3" />
              <CardBody>
                {Object.keys(map).length === 0 ? <p className="muted text-sm">No predictions yet.</p> : (
                  <dl className="space-y-2 text-sm">{Object.entries(map).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="truncate">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>)}</dl>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Models() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'metrics'], queryFn: adminApi.metrics });
  const refresh = useMutation({
    mutationFn: adminApi.refreshMetrics,
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['admin', 'metrics'] }); qc.invalidateQueries({ queryKey: ['models-compare'] }); toast.success('Metrics refreshed', `${r.upserted} snapshots for ${r.version}`); },
    onError: (e) => toast.error('Refresh failed', getErrorMessage(e)),
  });
  if (q.isPending) return <SkeletonCard />;
  if (q.isError) return <QueryError error={q.error} onRetry={q.refetch} />;
  return <ModelMetricsPanel items={q.data} onRefresh={() => refresh.mutate()} refreshing={refresh.isPending} />;
}

function Predictions() {
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['admin', 'predictions', filters, page], queryFn: () => adminApi.predictions({ ...filters, page, limit: 15 }), placeholderData: (prev) => prev });
  if (q.isPending) return <SkeletonCard />;
  if (q.isError) return <QueryError error={q.error} onRetry={q.refetch} />;
  const { items, ...meta } = q.data;
  return (
    <Card>
      <CardHeader title="All predictions" subtitle={`${meta.total} total, newest first`} />
      <CardBody><PredictionLogTable items={items} meta={meta} filters={filters} onFilters={(f) => { setFilters(f); setPage(1); }} onPage={setPage} /></CardBody>
    </Card>
  );
}

export default function AdminPanelPage() {
  const [tab, setTab] = useState('overview');
  return (
    <div className="space-y-6">
      <PageHeader icon={ShieldCheck} title="Admin" subtitle="Usage, model metrics and the prediction log." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Admin sections" idBase="admin" />
      <div role="tabpanel" id="admin-panel" aria-labelledby={`admin-${tab}`}>
        {tab === 'overview' && <Overview />}
        {tab === 'models' && <Models />}
        {tab === 'predictions' && <Predictions />}
      </div>
    </div>
  );
}
