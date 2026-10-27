import { Map as MapIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card, { CardBody, CardHeader } from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import { QueryError } from '../components/common/QueryState.jsx';
import { SkeletonCard } from '../components/common/Skeleton.jsx';
import Select from '../components/common/Select.jsx';
import Tabs from '../components/common/Tabs.jsx';
import AirportRiskMap from '../components/map/AirportRiskMap.jsx';
import { useRiskMap } from '../hooks/useFlightLookup.js';
import { formatInt, formatPct } from '../utils/formatters.js';

const METRICS = [{ value: 'delay_rate', label: 'Delay rate' }, { value: 'cancel_rate', label: 'Cancellation rate' }];

export default function RiskMapPage() {
  const [metric, setMetric] = useState('delay_rate');
  const [minFlights, setMinFlights] = useState(3000);
  const q = useRiskMap(minFlights);
  const airports = q.data?.airports ?? [];

  const columns = [
    { key: 'airport', header: 'Airport', sortable: true, render: (a) => <Link to={`/historical?origin=${a.airport}`} className="code font-semibold text-brand-800 hover:underline dark:text-brand-300">{a.airport}</Link> },
    { key: 'city', header: 'City', sortable: true, render: (a) => `${a.city}, ${a.state}` },
    { key: 'flights', header: 'Departures', align: 'right', sortable: true, render: (a) => formatInt(a.flights) },
    { key: 'delay_rate', header: 'Delayed 15+ min', align: 'right', sortable: true, render: (a) => formatPct(a.delay_rate) },
    { key: 'cancel_rate', header: 'Cancelled', align: 'right', sortable: true, render: (a) => formatPct(a.cancel_rate) },
    { key: 'avg_departure_delay', header: 'Avg departure delay', align: 'right', sortable: true, render: (a) => (Number.isFinite(a.avg_departure_delay) ? `${a.avg_departure_delay} min` : '-') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader icon={MapIcon} title="Airport risk map" subtitle="Which airports run late or cancel the most? Circle size shows traffic, colour shows how an airport compares with the rest."
        actions={<Select aria-label="Minimum departures" wrapperClassName="w-48" value={minFlights} onChange={(e) => setMinFlights(Number(e.target.value))}
          options={[{ value: 1000, label: '1,000+ departures' }, { value: 3000, label: '3,000+ departures' }, { value: 10000, label: '10,000+ departures' }, { value: 30000, label: '30,000+ departures' }]} />} />
      <Card>
        <CardHeader title="2023 by origin airport" actions={<Tabs tabs={METRICS} value={metric} onChange={setMetric} label="Map metric" idBase="map-metric" />} />
        <CardBody>
          <div role="tabpanel" id="map-metric-panel" aria-labelledby={`map-metric-${metric}`}>
            {q.isPending ? <SkeletonCard height="h-[480px]" className="border-0 shadow-none" /> : q.isError ? <QueryError error={q.error} onRetry={q.refetch} /> : <AirportRiskMap airports={airports} metric={metric} />}
          </div>
        </CardBody>
      </Card>
      {q.data && (
        <Card>
          <CardHeader title="All airports" subtitle={`${airports.length} airports with at least ${formatInt(minFlights)} departures. Sort any column.`} />
          <CardBody><DataTable columns={columns} rows={airports} rowKey={(a) => a.airport} pageSize={12} dense initialSort={{ key: metric, dir: 'desc' }} caption="Airport delay and cancellation rates" /></CardBody>
        </Card>
      )}
    </div>
  );
}
