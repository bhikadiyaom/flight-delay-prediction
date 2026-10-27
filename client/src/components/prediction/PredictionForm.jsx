import { ChevronDown, Gauge } from 'lucide-react';
import { useState } from 'react';
import { AIRLINES } from '../../utils/constants.js';
import { todayIso, toIsoLocal } from '../../utils/formatters.js';
import AirportInput from '../flights/AirportInput.jsx';
import Button from '../common/Button.jsx';
import Input from '../common/Input.jsx';
import Select from '../common/Select.jsx';

const WX_FIELDS = [
  { key: 'temp', label: 'Temperature (°C)', min: -80, max: 60, api: 'temperatureC', step: '0.1' },
  { key: 'rain', label: 'Rain / precipitation (mm)', min: 0, max: 1500, api: 'precipitationMm', step: '0.1' },
  { key: 'wind', label: 'Wind speed (km/h)', min: 0, max: 450, api: 'windSpeedKmh', step: '1' },
  { key: 'snow', label: 'Snowfall (cm)', min: 0, max: 500, api: 'snowfallCm', step: '0.1' },
];

export const emptyWeather = () => ({ temp: '', rain: '', wind: '', snow: '' });
export const defaultValues = (over = {}) => ({
  airline: '', origin: '', destination: '', date: todayIso(1), time: '09:00', distance: '',
  originWeather: emptyWeather(), destWeather: emptyWeather(), ...over,
});

/** Form state -> API body (camelCase, empty optionals omitted). */
export function buildPredictionPayload(v) {
  const wx = (w) => {
    const out = {};
    for (const f of WX_FIELDS) if (w[f.key] !== '' && w[f.key] != null) out[f.api] = Number(w[f.key]);
    return Object.keys(out).length ? out : undefined;
  };
  const body = { airline: v.airline, origin: v.origin, destination: v.destination, scheduledDeparture: toIsoLocal(v.date, v.time) };
  if (v.distance !== '') body.distanceMiles = Number(v.distance);
  const ow = wx(v.originWeather);
  const dw = wx(v.destWeather);
  if (ow) body.originWeather = ow;
  if (dw) body.destWeather = dw;
  return body;
}

/** @returns {Record<string,string>} field -> message (empty object = valid) */
export function validatePredictionForm(v) {
  const e = {};
  if (!v.airline) e.airline = 'Choose an airline';
  if (!/^[A-Z]{3}$/.test(v.origin)) e.origin = 'Pick the departure airport';
  if (!/^[A-Z]{3}$/.test(v.destination)) e.destination = 'Pick the arrival airport';
  if (!e.origin && !e.destination && v.origin === v.destination) e.destination = 'Destination must differ from the origin';
  if (!v.date) e.date = 'Choose a date';
  if (!v.time) e.time = 'Choose a time';
  if (v.distance !== '' && !(Number(v.distance) >= 1 && Number(v.distance) <= 8000)) e.distance = 'Between 1 and 8000 miles';
  for (const [k, w] of [['originWeather', v.originWeather], ['destWeather', v.destWeather]]) {
    for (const f of WX_FIELDS) {
      const raw = w[f.key];
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < f.min || n > f.max) e[`${k}.${f.key}`] = `${f.min} to ${f.max}`;
    }
  }
  return e;
}

function WeatherFields({ title, prefix, value, onChange, errors }) {
  return (
    <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid grid-cols-2 gap-3">
        {WX_FIELDS.map((f) => (
          <Input key={f.key} label={f.label} type="number" inputMode="decimal" step={f.step} value={value[f.key]} error={errors[`${prefix}.${f.key}`]}
            onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} />
        ))}
      </div>
    </fieldset>
  );
}

export default function PredictionForm({ initial, onSubmit, loading, submitLabel = 'Predict delay risk' }) {
  const [v, setV] = useState(() => defaultValues(initial));
  const [errors, setErrors] = useState({});
  const [showWx, setShowWx] = useState(() => Boolean(initial?.originWeather || initial?.destWeather));
  const set = (patch) => setV((cur) => ({ ...cur, ...patch }));

  const submit = (e) => {
    e.preventDefault();
    const errs = validatePredictionForm(v);
    setErrors(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    onSubmit(buildPredictionPayload(v), v);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-label="Flight details">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Airline" required value={v.airline} error={errors.airline} onChange={(e) => set({ airline: e.target.value })}>
          <option value="">Select an airline</option>
          {AIRLINES.map((a) => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
        </Select>
        <Input label="Distance (miles)" hint="Optional, calculated from the airports if empty" type="number" inputMode="numeric" min="1" max="8000" value={v.distance} error={errors.distance}
          onChange={(e) => set({ distance: e.target.value })} />
        <AirportInput label="From" required value={v.origin} error={errors.origin} onChange={(origin) => set({ origin })} />
        <AirportInput label="To" required value={v.destination} error={errors.destination} onChange={(destination) => set({ destination })} placeholder="City or code, e.g. LAX" />
        <Input label="Departure date" required type="date" value={v.date} error={errors.date} onChange={(e) => set({ date: e.target.value })} />
        <Input label="Departure time (local)" required type="time" value={v.time} error={errors.time} onChange={(e) => set({ time: e.target.value })} />
      </div>

      <div>
        <button type="button" onClick={() => setShowWx((s) => !s)} aria-expanded={showWx} aria-controls="weather-fields"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-brand-800 hover:underline dark:text-brand-300">
          <ChevronDown size={16} aria-hidden="true" className={showWx ? 'rotate-180 transition-transform' : 'transition-transform'} />
          <span className="text-left">Weather conditions <span className="muted font-normal">(optional)</span></span>
        </button>
        {showWx && (
          <div id="weather-fields" className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <WeatherFields title="Origin airport" prefix="originWeather" value={v.originWeather} onChange={(originWeather) => set({ originWeather })} errors={errors} />
            <WeatherFields title="Destination airport" prefix="destWeather" value={v.destWeather} onChange={(destWeather) => set({ destWeather })} errors={errors} />
          </div>
        )}
      </div>

      <Button type="submit" size="lg" icon={Gauge} loading={loading} className="w-full sm:w-auto">{submitLabel}</Button>
    </form>
  );
}
