import { ArrowRight, Clock } from 'lucide-react';
import { formatDate, formatInstant, formatTime } from '../../utils/formatters.js';
import Badge, { SourceBadge } from '../common/Badge.jsx';
import Card, { CardBody } from '../common/Card.jsx';

const STATUS = {
  scheduled: { tone: 'brand', label: 'Scheduled' }, active: { tone: 'good', label: 'In the air' }, landed: { tone: 'neutral', label: 'Landed' },
  delayed: { tone: 'warn', label: 'Delayed' }, cancelled: { tone: 'bad', label: 'Cancelled' }, diverted: { tone: 'warn', label: 'Diverted' },
  incident: { tone: 'bad', label: 'Incident' }, unknown: { tone: 'neutral', label: 'Unknown' },
};

function End({ role, e }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="muted text-xs font-medium uppercase tracking-wide">{role}</p>
      <p className="code text-3xl font-semibold">{e.iata}</p>
      <p className="muted truncate text-sm" title={e.airport ?? ''}>{e.airport ?? '-'}</p>
      <dl className="mt-2 space-y-0.5 text-sm">
        <div className="flex gap-2"><dt className="muted w-20">Scheduled</dt><dd className="font-medium tabular-nums">{formatTime(e.scheduled)} <span className="muted font-normal">{formatDate(e.scheduled)}</span></dd></div>
        {e.estimated && <div className="flex gap-2"><dt className="muted w-20">Estimated</dt><dd className="font-medium tabular-nums">{formatTime(e.estimated)}</dd></div>}
        {(e.terminal || e.gate) && <div className="flex gap-2"><dt className="muted w-20">Terminal / gate</dt><dd className="font-medium">{e.terminal ?? '-'} / {e.gate ?? '-'}</dd></div>}
      </dl>
    </div>
  );
}

/** Normalised flight from GET /flights/live (airport-local times, never converted to the viewer's zone). */
export default function LiveFlightCard({ flight, source, stale, demo, fetchedAt }) {
  const st = STATUS[flight.status] ?? STATUS.unknown;
  const delay = flight.origin.delayMinutes;
  return (
    <Card data-testid="live-flight-card">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="code text-xl font-semibold">{flight.flightIata}</h2>
          <span className="muted text-sm">{flight.airline?.name}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            {delay > 0 && <Badge tone="warn" icon={Clock}>{delay} min late</Badge>}
            <SourceBadge source={source} stale={stale} demo={demo} />
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          <End role="Departure" e={flight.origin} />
          <ArrowRight className="mt-2 shrink-0 text-slate-400" size={28} aria-label="to" />
          <End role="Arrival" e={flight.destination} />
        </div>
        {fetchedAt && <p className="muted text-xs">Updated {formatInstant(fetchedAt)}{flight.aircraft ? ` · Aircraft ${flight.aircraft}` : ''}. Times are airport-local.</p>}
      </CardBody>
    </Card>
  );
}
