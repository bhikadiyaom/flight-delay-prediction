import 'leaflet/dist/leaflet.css';
import { useMemo } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip as MapTooltip } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme.js';
import { US_BOUNDS, US_CENTER, US_ZOOM } from '../../utils/airportCoords.js';
import { chartTheme } from '../../utils/constants.js';
import { formatInt, formatPct } from '../../utils/formatters.js';

/** Tercile cut points of a metric, so the three colours always split the airports evenly. */
export function terciles(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return [0, 0];
  return [s[Math.floor(s.length / 3)], s[Math.floor((2 * s.length) / 3)]];
}

export const bucketOf = (v, [lo, hi]) => (v >= hi ? 'high' : v >= lo ? 'medium' : 'low');

/**
 * react-leaflet map (OpenStreetMap tiles). Circle size = traffic, colour = the chosen rate relative to other airports.
 * `airports` = [{ airport, name, city, state, lat, lon, flights, delay_rate, cancel_rate }]. The map has a fixed height
 * (Leaflet renders nothing in a zero-height box). A keyboard/screen-reader list of the same data is on the page.
 */
export default function AirportRiskMap({ airports, metric = 'delay_rate', height = 520 }) {
  const { resolved } = useTheme();
  const t = chartTheme(resolved);
  const cuts = useMemo(() => terciles(airports.map((a) => a[metric])), [airports, metric]);
  const maxFlights = Math.max(...airports.map((a) => a.flights), 1);
  const metricLabel = metric === 'delay_rate' ? 'Delayed 15+ min' : 'Cancelled';
  const valid = airports.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));

  return (
    <div>
      <div style={{ height }} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <MapContainer center={US_CENTER} zoom={US_ZOOM} minZoom={3} maxBounds={US_BOUNDS} maxBoundsViscosity={0.8} scrollWheelZoom style={{ height: '100%', width: '100%' }}
          aria-label="Map of US airports coloured by delay risk">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {valid.map((a) => {
            const b = bucketOf(a[metric], cuts);
            return (
              <CircleMarker key={a.airport} center={[a.lat, a.lon]} radius={5 + 13 * Math.sqrt(a.flights / maxFlights)}
                pathOptions={{ color: t.dark ? '#0f172a' : '#ffffff', weight: 1.5, fillColor: t[b], fillOpacity: 0.85 }}>
                <MapTooltip direction="top" offset={[0, -4]}><span className="font-semibold">{a.airport}</span> {formatPct(a[metric])}</MapTooltip>
                <Popup>
                  <div className="min-w-[180px] text-sm">
                    <p className="font-semibold">{a.airport} · {a.city}, {a.state}</p>
                    <p className="text-xs opacity-80">{a.name}</p>
                    <dl className="mt-2 space-y-0.5">
                      <div className="flex justify-between gap-3"><dt>Delayed 15+ min</dt><dd className="font-semibold">{formatPct(a.delay_rate)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Cancelled</dt><dd className="font-semibold">{formatPct(a.cancel_rate)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>Departures</dt><dd className="font-semibold">{formatInt(a.flights)}</dd></div>
                    </dl>
                    <Link to={`/historical?origin=${a.airport}`} className="mt-2 inline-block text-xs font-semibold underline">Search flights from {a.airport}</Link>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" aria-label="Map legend">
        <span className="font-medium">{metricLabel}:</span>
        {[['low', `below ${formatPct(cuts[0])}`], ['medium', `${formatPct(cuts[0])} to ${formatPct(cuts[1])}`], ['high', `above ${formatPct(cuts[1])}`]].map(([k, text]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: t[k] }} aria-hidden="true" />{k === 'low' ? 'Lower' : k === 'medium' ? 'Middle' : 'Higher'} ({text})</span>
        ))}
        <span className="muted">Bigger circle = more departures</span>
      </div>
    </div>
  );
}
