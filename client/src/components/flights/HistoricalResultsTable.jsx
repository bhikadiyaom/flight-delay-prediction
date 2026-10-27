import Badge from '../common/Badge.jsx';
import DataTable from '../common/DataTable.jsx';
import { formatDate, shortAirline } from '../../utils/formatters.js';

const CAUSES = [['delay_carrier', 'Carrier'], ['delay_weather', 'Weather'], ['delay_nas', 'Air system'], ['delay_security', 'Security'], ['delay_last_aircraft', 'Late aircraft']];

function mainCause(r) {
  let best = null;
  for (const [k, label] of CAUSES) if ((r[k] ?? 0) > (best?.v ?? 0)) best = { label, v: r[k] };
  return best?.label ?? '-';
}

function Outcome({ r }) {
  if (r.is_cancelled) return <Badge tone="bad">Cancelled</Badge>;
  const d = r.arr_delay;
  if (d == null) return '-';
  if (d >= 15) return <Badge tone="warn">{d} min late</Badge>;
  return <Badge tone="good">{d <= 0 ? 'On time / early' : `${d} min`}</Badge>;
}

/** Rows from GET /flights/historical. Sortable, paged 15 per page. */
export default function HistoricalResultsTable({ flights }) {
  const columns = [
    { key: 'flight_date', header: 'Date', sortable: true, render: (r) => formatDate(r.flight_date) },
    { key: 'airline', header: 'Airline', sortable: true, render: (r) => shortAirline(r.airline) },
    { key: 'route', header: 'Route', sortable: true, sortValue: (r) => `${r.origin}${r.dest}`, render: (r) => <span className="code font-medium">{r.origin} → {r.dest}</span> },
    { key: 'dep_time_label', header: 'Departed', sortable: true },
    { key: 'arr_delay', header: 'Outcome', sortable: true, sortValue: (r) => (r.is_cancelled ? 9999 : r.arr_delay), render: (r) => <Outcome r={r} /> },
    { key: 'cause', header: 'Main cause', render: (r) => (r.arr_delay >= 15 ? mainCause(r) : '-') },
    { key: 'tail_number', header: 'Aircraft', render: (r) => <span className="code text-xs">{r.tail_number ?? '-'}</span> },
  ];
  return <DataTable columns={columns} rows={flights} rowKey={(r) => `${r.flight_date}-${r.tail_number}-${r.origin}-${r.dest}-${r.dep_time_label}-${r.arr_delay}`} pageSize={15} caption="Historical 2023 flights" />;
}
