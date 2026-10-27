import { RiskBadge } from '../common/Badge.jsx';
import Badge from '../common/Badge.jsx';
import DataTable, { Pager } from '../common/DataTable.jsx';
import Select from '../common/Select.jsx';
import { formatInstant, formatPct } from '../../utils/formatters.js';

const routeOf = (i) => (i?.origin ? `${i.origin} → ${i.destination}` : '-');

/**
 * Server-paginated log (GET /admin/predictions). Filters and paging are controlled by the parent page so the
 * query key changes with them: filters = { source, riskLevel }, meta = { page, pages, total, limit }.
 */
export default function PredictionLogTable({ items, meta, filters, onFilters, onPage }) {
  const columns = [
    { key: 'createdAt', header: 'When', sortable: true, render: (r) => <span className="whitespace-nowrap">{formatInstant(r.createdAt)}</span> },
    { key: 'user', header: 'User', render: (r) => r.user?.email ?? <span className="muted">anonymous</span> },
    { key: 'source', header: 'Source', render: (r) => <Badge tone={r.source === 'live' ? 'brand' : r.source === 'bulk' ? 'warn' : 'neutral'}>{r.source}</Badge> },
    { key: 'route', header: 'Route', render: (r) => <span className="code">{routeOf(r.input)}</span> },
    { key: 'risk', header: 'Risk', render: (r) => <RiskBadge level={r.output?.riskLevel} /> },
    { key: 'delay', header: 'Delay', align: 'right', sortable: true, sortValue: (r) => r.output?.delayProbability, render: (r) => formatPct(r.output?.delayProbability) },
    { key: 'cancel', header: 'Cancel', align: 'right', render: (r) => formatPct(r.output?.cancelProbability) },
    { key: 'latencyMs', header: 'ms', align: 'right', render: (r) => (r.cached ? <span title="cache hit">cache</span> : r.latencyMs ?? '-') },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select label="Source" wrapperClassName="w-40" value={filters.source ?? ''} onChange={(e) => onFilters({ ...filters, source: e.target.value || undefined })}
          options={[{ value: '', label: 'All' }, { value: 'manual', label: 'Manual' }, { value: 'live', label: 'Live' }, { value: 'bulk', label: 'Bulk' }]} />
        <Select label="Risk" wrapperClassName="w-40" value={filters.riskLevel ?? ''} onChange={(e) => onFilters({ ...filters, riskLevel: e.target.value || undefined })}
          options={[{ value: '', label: 'All' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
      </div>
      <DataTable columns={columns} rows={items} caption="Prediction log" dense empty={<p className="muted rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm dark:border-slate-700">No predictions match these filters.</p>} />
      {meta.pages > 1 && <Pager page={meta.page} pages={meta.pages} total={meta.total} pageSize={meta.limit} onChange={onPage} />}
    </div>
  );
}
