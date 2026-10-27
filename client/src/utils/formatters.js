const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = MONTHS;
export const DAY_NAMES = DAYS;

const nf = new Intl.NumberFormat('en-US');

export const formatInt = (n) => (Number.isFinite(n) ? nf.format(Math.round(n)) : '-');

/** 0.2056 -> "20.6%" (input is a fraction). */
export const formatPct = (p, digits = 1) => (Number.isFinite(p) ? `${(p * 100).toFixed(digits)}%` : '-');

/** 45.7 -> "46 min", 125 -> "2 h 5 min", null -> "-" */
export function formatMinutes(m) {
  if (!Number.isFinite(m)) return '-';
  const r = Math.round(m);
  if (r < 60) return `${r} min`;
  const h = Math.floor(r / 60);
  const rest = r % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export const formatMiles = (m) => (Number.isFinite(m) ? `${formatInt(m)} mi` : '-');

/**
 * Flight times are airport-local wall clock, so they are formatted from the string parts and NEVER converted
 * through the browser's time zone ("2026-10-27T14:00:00+00:00" shows 14:00).
 */
function parts(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] === undefined ? null : +m[4], mi: m[5] === undefined ? null : +m[5] };
}

export function formatDate(iso) {
  const p = parts(iso);
  if (!p) return '-';
  const dow = DAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()];
  return `${dow}, ${MONTHS[p.mo - 1]} ${p.d}`;
}

export function formatTime(iso) {
  const p = parts(iso);
  if (!p || p.h === null) return '-';
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
}

export const formatDateTime = (iso) => {
  const d = formatDate(iso);
  const t = formatTime(iso);
  return t === '-' ? d : `${d} · ${t}`;
};

/** createdAt timestamps from the API are real instants (UTC): show them in the viewer's local time. */
export function formatInstant(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const toIsoLocal = (date, time) => (date && time ? `${date}T${time.length === 5 ? `${time}:00` : time}` : '');

export const todayIso = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ------------------------------------------------------------------------------ model feature names
const FEATURE_LABELS = {
  dep_time_idx: 'Time of day', day_of_week: 'Day of week', is_weekend: 'Weekend', is_holiday: 'Holiday', holiday_distance: 'Days from a holiday',
  distance_miles: 'Distance', airline_freq: 'Airline size', origin_freq: 'Origin airport traffic', dest_freq: 'Destination airport traffic',
  route_freq: 'Route popularity', route_daily_avg: 'Flights per day on route', origin_daily_avg: 'Flights per day at origin',
  airline_delay_roll: 'Airline recent delays', origin_delay_roll: 'Origin airport recent delays', dest_delay_roll: 'Destination airport recent delays',
  airline_cancel_roll: 'Airline recent cancellations', origin_cancel_roll: 'Origin recent cancellations', dest_cancel_roll: 'Destination recent cancellations',
  route_delay_rate: 'Route delay history', origin_time_delay_rate: 'Origin delay history at this hour',
  o_prcp_band: 'Rain at origin', o_snow_band: 'Snow at origin', o_wind_band: 'Wind at origin', o_freeze: 'Freezing at origin',
  o_severity: 'Weather severity at origin', o_tavg: 'Temperature at origin',
  d_prcp_band: 'Rain at destination', d_snow_band: 'Snow at destination', d_wind_band: 'Wind at destination', d_freeze: 'Freezing at destination',
  d_severity: 'Weather severity at destination', d_tavg: 'Temperature at destination', weather_missing: 'Weather unavailable',
};

export const featureLabel = (name) => FEATURE_LABELS[name] ?? String(name).replace(/_/g, ' ');

/** "Southwest Airlines Co." -> "Southwest Airlines", "Delta Air Lines Inc" -> "Delta Air Lines" */
export const shortAirline = (name) => String(name ?? '').replace(/\s+(Inc\.?|Co\.?)$/i, '').replace(/\s+Co\.$/i, '');

export const riskOf =(p) => (p >= 0.4 ? 'high' : p >= 0.2 ? 'medium' : 'low');

export function capitalize(s) {
  const str = String(s ?? '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}
