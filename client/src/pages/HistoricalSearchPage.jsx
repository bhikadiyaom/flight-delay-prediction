import { History, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../api/axiosClient.js';
import Button from '../components/common/Button.jsx';
import Card, { CardBody, CardHeader } from '../components/common/Card.jsx';
import DataTable from '../components/common/DataTable.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Input from '../components/common/Input.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import { QueryError } from '../components/common/QueryState.jsx';
import { SkeletonCard } from '../components/common/Skeleton.jsx';
import Select from '../components/common/Select.jsx';
import StatCard from '../components/common/StatCard.jsx';
import AirportInput from '../components/flights/AirportInput.jsx';
import HistoricalResultsTable from '../components/flights/HistoricalResultsTable.jsx';
import { useHistoricalSearch } from '../hooks/useFlightLookup.js';
import { AIRLINES } from '../utils/constants.js';
import { formatInt, formatMinutes, formatPct, shortAirline } from '../utils/formatters.js';

const read = (p) => ({
  origin: /^[A-Za-z]{3}$/.test(p.get('origin') ?? '') ? p.get('origin').toUpperCase() : '',
  dest: /^[A-Za-z]{3}$/.test(p.get('dest') ?? '') ? p.get('dest').toUpperCase() : '',
  date: /^\d{4}-\d{2}-\d{2}$/.test(p.get('date') ?? '') ? p.get('date') : '',
  airline: AIRLINES.some((a) => a.code === p.get('airline')) ? p.get('airline') : '',
});

/** Search the 2023 data. The URL is the source of truth, so a search is shareable and survives refresh. */
export default function HistoricalSearchPage() {
  const [params, setParams] = useSearchParams();
  const active = read(params);
  const [form, setForm] = useState(active);
  const [error, setError] = useState('');
  const enabled = Boolean(active.origin || active.dest);
  const q = useHistoricalSearch({ ...Object.fromEntries(Object.entries(active).filter(([, v]) => v)), limit: 200 }, enabled);

  const submit = (e) => {
    e.preventDefault();
    if (!form.origin && !form.dest) { setError('Choose a departure or arrival airport (or both).'); return; }
    if (form.origin && form.origin === form.dest) { setError('Origin and destination must differ.'); return; }
    setError('');
    setParams(Object.fromEntries(Object.entries(form).filter(([, v]) => v)));
  };

  const s = q.data?.summary;
  return (
    <div className="space-y-6">
      <PageHeader icon={History} title="Flight history" subtitle="Search every 2023 flight by airport, date and airline, and see how often that route ran late." />
      <Card>
        <CardBody>
          <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-start">
            <AirportInput label="From" value={form.origin} onChange={(origin) => setForm((f) => ({ ...f, origin }))} placeholder="Any, e.g. ATL" />
            <AirportInput label="To" value={form.dest} onChange={(dest) => setForm((f) => ({ ...f, dest }))} placeholder="Any, e.g. JFK" />
            <Input label="Date" type="date" min="2023-01-01" max="2023-12-31" value={form.date} hint="Optional, 2023 only" onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            <Select label="Airline" value={form.airline} onChange={(e) => setForm((f) => ({ ...f, airline: e.target.value }))}>
              <option value="">Any airline</option>
              {AIRLINES.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
            </Select>
            <div className="lg:pt-7"><Button type="submit" icon={Search} size="lg" loading={q.isFetching} className="w-full">Search</Button></div>
          </form>
          {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700 dark:text-red-400">{error}</p>}
        </CardBody>
      </Card>

      {!enabled && <EmptyState icon={History} title="Start with an airport" description="Pick where flights depart from, where they arrive, or both. Add a date or airline to narrow it down." />}
      {enabled && q.isPending && <div className="space-y-4"><SkeletonCard height="h-20" /><SkeletonCard /></div>}
      {enabled && q.isError && <QueryError error={q.error} onRetry={q.refetch} title={getErrorMessage(q.error, 'Search failed')} />}
      {q.data && (s.flights === 0
        ? <EmptyState title="No flights match" description="Try removing the date or airline filter, or check the airport codes." />
        : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard icon={History} label="Flights" value={formatInt(s.flights)} hint={`${s.returned} shown below`} />
              <StatCard label="Delayed 15+ min" value={formatPct(s.delay_rate)} tone="warn" />
              <StatCard label="Cancelled" value={formatPct(s.cancel_rate)} hint={`${formatInt(s.cancelled)} flights`} tone="bad" />
              <StatCard label="Average arrival" value={formatMinutes(s.avg_arrival_delay)} hint="negative = early" tone="good" />
              <StatCard label="Worst 10%" value={formatMinutes(s.p90_arrival_delay)} hint="90th percentile delay" tone="warn" />
            </div>
            {q.data.by_airline.length > 1 && (
              <Card>
                <CardHeader title="By airline" subtitle="Same search, split by carrier" />
                <CardBody>
                  <DataTable dense caption="Delay rate by airline for this search" rows={q.data.by_airline} rowKey={(r) => r.airline} initialSort={{ key: 'flights', dir: 'desc' }}
                    columns={[
                      { key: 'airline', header: 'Airline', sortable: true, render: (r) => shortAirline(r.airline) },
                      { key: 'flights', header: 'Flights', align: 'right', sortable: true, render: (r) => formatInt(r.flights) },
                      { key: 'delay_rate', header: 'Delayed 15+ min', align: 'right', sortable: true, render: (r) => formatPct(r.delay_rate) },
                      { key: 'cancel_rate', header: 'Cancelled', align: 'right', sortable: true, render: (r) => formatPct(r.cancel_rate) },
                    ]} />
                </CardBody>
              </Card>
            )}
            <Card>
              <CardHeader title="Flights" subtitle={s.flights > s.returned ? `Showing the ${s.returned} most recent of ${formatInt(s.flights)}. Add a date to narrow it down.` : undefined} />
              <CardBody><HistoricalResultsTable flights={q.data.flights} /></CardBody>
            </Card>
          </>
        ))}
    </div>
  );
}
