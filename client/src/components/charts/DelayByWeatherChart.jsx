import { useState } from 'react';
import Tabs from '../common/Tabs.jsx';
import RateBarChart from './RateBarChart.jsx';

const DIMS = [
  { value: 'precipitation', label: 'Rain / precipitation' },
  { value: 'wind', label: 'Wind' },
  { value: 'snow', label: 'Snow' },
];

/** Delay rate by weather band at the origin airport; tabs switch between precipitation, wind and snow. */
export default function DelayByWeatherChart({ data }) {
  const [dim, setDim] = useState('precipitation');
  const rows = data.filter((d) => d.dimension === dim).sort((a, b) => a.band.localeCompare(b.band))
    .map((d) => ({ label: d.band.replace(/^\d\s*/, ''), value: d.delay_rate }));
  return (
    <div>
      <Tabs tabs={DIMS} value={dim} onChange={setDim} label="Weather factor" idBase="weather" className="mb-3" />
      <div role="tabpanel" id="weather-panel" aria-labelledby={`weather-${dim}`}>
        <RateBarChart data={rows} label={`Delay rate by ${dim} band at the origin`} valueLabel="Delayed 15+ min" height={250} />
      </div>
    </div>
  );
}
