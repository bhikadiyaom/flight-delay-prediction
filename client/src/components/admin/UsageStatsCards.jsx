import { Activity, Database, Gauge, Timer, Users, Zap } from 'lucide-react';
import { formatInt, formatPct } from '../../utils/formatters.js';
import StatCard from '../common/StatCard.jsx';

/** KPI tiles from GET /admin/stats. */
export default function UsageStatsCards({ stats, loading }) {
  const q = stats?.aviationStackQuota;
  const quotaTone = q && q.used >= q.stopsAt ? 'bad' : q && q.used >= q.stopsAt * 0.7 ? 'warn' : 'good';
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard loading={loading} icon={Users} label="Users" value={formatInt(stats?.users.total)} hint={`${stats?.users.admins ?? 0} admin${stats?.users.admins === 1 ? '' : 's'}`} />
      <StatCard loading={loading} icon={Gauge} label="Predictions" value={formatInt(stats?.predictions.total)} hint={`${formatInt(stats?.predictions.last24h)} in the last 24 h`} tone="good" />
      <StatCard loading={loading} icon={Timer} label="Avg latency" value={`${formatInt(stats?.performance.avgLatencyMs)} ms`} hint="per prediction request" tone="warn" />
      <StatCard loading={loading} icon={Zap} label="Served from cache" value={formatPct(stats?.performance.cachedShare, 0)} hint="10-minute prediction cache" />
      <StatCard loading={loading} icon={Activity} label="AviationStack quota" value={q ? `${q.used} / ${q.limit}` : '-'} hint={q ? `Calls stop at ${q.stopsAt} (${q.month})` : ''} tone={quotaTone} />
      <StatCard loading={loading} icon={Database} label="Cache entries" value={formatInt((stats?.cache ?? []).reduce((n, c) => n + c.entries, 0))}
        hint={(stats?.cache ?? []).map((c) => `${c.kind} ${c.entries}`).join(' · ')} />
    </div>
  );
}
