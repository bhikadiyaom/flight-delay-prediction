import { BarChart3, CalendarClock, CloudRain, Hourglass, Plane, Timer, TrendingUp, XOctagon } from 'lucide-react';
import { useState } from 'react';
import { SourceBadge } from '../components/common/Badge.jsx';
import Card, { CardBody, CardHeader } from '../components/common/Card.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import { QueryError } from '../components/common/QueryState.jsx';
import { SkeletonCard } from '../components/common/Skeleton.jsx';
import StatCard from '../components/common/StatCard.jsx';
import Tabs from '../components/common/Tabs.jsx';
import DelayByAirlineChart from '../components/charts/DelayByAirlineChart.jsx';
import DelayByAirportChart from '../components/charts/DelayByAirportChart.jsx';
import DelayByDayChart from '../components/charts/DelayByDayChart.jsx';
import DelayByMonthChart from '../components/charts/DelayByMonthChart.jsx';
import DelayByWeatherChart from '../components/charts/DelayByWeatherChart.jsx';
import DelayCauseChart from '../components/charts/DelayCauseChart.jsx';
import TrendChart from '../components/charts/TrendChart.jsx';
import { useOverview, useTrends } from '../hooks/useFlightLookup.js';
import { formatInt, formatMinutes, formatPct } from '../utils/formatters.js';

const GRANULARITY = [{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }];

function Trends() {
  const [g, setG] = useState('day');
  const q = useTrends({ granularity: g });
  return (
    <Card>
      <CardHeader icon={TrendingUp} title="Delay rate through 2023" subtitle="Share of flights arriving 15 or more minutes late"
        actions={<Tabs tabs={GRANULARITY} value={g} onChange={setG} label="Time resolution" idBase="trend" />} />
      <CardBody>
        <div role="tabpanel" id="trend-panel" aria-labelledby={`trend-${g}`}>
          {q.isPending ? <SkeletonCard height="h-64" className="border-0 shadow-none" /> : q.isError ? <QueryError error={q.error} onRetry={q.refetch} /> : <TrendChart points={q.data.points} granularity={g} />}
        </div>
      </CardBody>
    </Card>
  );
}

export default function EdaDashboardPage() {
  const q = useOverview();
  const d = q.data;
  const t = d?.totals;
  return (
    <div className="space-y-6">
      <PageHeader icon={BarChart3} title="Insights from 2023" subtitle="What 6.8 million US domestic flights say about delays and cancellations."
        actions={d && <SourceBadge source={d.cached ? 'cache' : 'live'} stale={d.stale} />} />

      {q.isError ? <QueryError error={q.error} onRetry={q.refetch} title="Could not load the analytics" /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard loading={q.isPending} icon={Plane} label="Flights analysed" value={formatInt(t?.flights)} hint={`${t?.airlines ?? '-'} airlines · ${t?.airports ?? '-'} airports`} />
            <StatCard loading={q.isPending} icon={Hourglass} label="Delayed 15+ min" value={formatPct(t?.delay_rate)} hint="of flights that operated" tone="warn" />
            <StatCard loading={q.isPending} icon={XOctagon} label="Cancelled" value={formatPct(t?.cancel_rate)} hint={`${formatInt(t?.cancelled)} flights`} tone="bad" />
            <StatCard loading={q.isPending} icon={Timer} label="Typical delay when late" value={formatMinutes(t?.avg_delay_minutes_when_delayed)} hint="average, for delayed flights" tone="good" />
          </div>

          <Trends />

          {q.isPending ? <div className="grid gap-6 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div> : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader icon={CalendarClock} title="By month" subtitle="Summer storms and holiday travel push delays up" />
                  <CardBody><DelayByMonthChart data={d.by_month} /></CardBody>
                </Card>
                <Card>
                  <CardHeader icon={Hourglass} title="Where the delay minutes come from" subtitle="Share of all delay minutes by cause" />
                  <CardBody><DelayCauseChart data={d.delay_causes} /></CardBody>
                </Card>
              </div>
              <Card>
                <CardHeader title="By airline" subtitle="Amber bars are worse than the overall rate" />
                <CardBody><DelayByAirlineChart data={d.by_airline} overall={t.delay_rate} /></CardBody>
              </Card>
              <Card>
                <CardHeader title="By busy airport" subtitle="The 25 busiest origin airports, worst first" />
                <CardBody><DelayByAirportChart data={d.by_airport} overall={t.delay_rate} /></CardBody>
              </Card>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader icon={CloudRain} title="By weather at the origin" subtitle="Daily conditions at the departure airport" />
                  <CardBody><DelayByWeatherChart data={d.by_weather} /></CardBody>
                </Card>
                <Card>
                  <CardHeader title="By weekday and time of day" subtitle="Evenings run later, because delays accumulate through the day" />
                  <CardBody><DelayByDayChart days={d.by_day_of_week} times={d.by_time_of_day} /></CardBody>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
