import { CloudOff, CloudRain, Snowflake, Sun, Thermometer, Wind } from 'lucide-react';
import Card, { CardBody, CardHeader } from '../common/Card.jsx';

const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-2 text-sm">
    <Icon size={15} className="shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
    <dt className="muted flex-1">{label}</dt>
    <dd className="font-medium tabular-nums">{value}</dd>
  </div>
);
const num = (v, unit, d = 1) => (Number.isFinite(v) ? `${Number(v).toFixed(d)} ${unit}` : '-');

function Side({ code, w }) {
  if (!w) {
    return (
      <div className="flex-1 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
        <h3 className="code font-semibold">{code}</h3>
        <p className="muted mt-2 flex items-start gap-2 text-sm"><CloudOff size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Forecast unavailable. The model will use typical weather for this airport and month.</p>
      </div>
    );
  }
  const wet = (w.precipitationMm ?? 0) >= 0.1;
  return (
    <div className="flex-1 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
      <h3 className="code font-semibold">{code}</h3>
      <dl className="mt-2 space-y-1.5">
        <Row icon={Thermometer} label="Temperature" value={num(w.temperatureC, '°C')} />
        <Row icon={wet ? CloudRain : Sun} label="Precipitation" value={num(w.precipitationMm, 'mm')} />
        <Row icon={Wind} label="Wind" value={num(w.windSpeedKmh, 'km/h', 0)} />
        <Row icon={Snowflake} label="Snowfall" value={num(w.snowfallCm, 'cm')} />
      </dl>
    </div>
  );
}

/** Daily weather at both airports (Open-Meteo). Missing data is explained, not hidden. */
export default function WeatherSummaryCard({ origin, destination, weather }) {
  return (
    <Card>
      <CardHeader title="Weather on the day" subtitle="Daily forecast used as model input" icon={CloudRain} />
      <CardBody className="flex flex-col gap-3 sm:flex-row">
        <Side code={origin} w={weather?.origin} />
        <Side code={destination} w={weather?.destination} />
      </CardBody>
    </Card>
  );
}
