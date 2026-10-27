import RateBarChart from './RateBarChart.jsx';

/** Two small bar charts: weekday and time of day. */
export default function DelayByDayChart({ days, times }) {
  const d = days.map((x) => ({ label: x.day.slice(0, 3), value: x.delay_rate }));
  const t = times.map((x) => ({ label: x.time_of_day, value: x.delay_rate }));
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold">By weekday</h3>
        <RateBarChart data={d} label="Delay rate by weekday" valueLabel="Delayed 15+ min" height={240} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">By time of day</h3>
        <RateBarChart data={t} label="Delay rate by time of day" valueLabel="Delayed 15+ min" height={240} />
      </div>
    </div>
  );
}
