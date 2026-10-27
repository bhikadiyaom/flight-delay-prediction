import RateBarChart from './RateBarChart.jsx';
import { useChartTheme } from './ChartFrame.jsx';

/** The 25 busiest origin airports, in order of delay rate. */
export default function DelayByAirportChart({ data, overall }) {
  const t = useChartTheme();
  const rows = [...data].sort((a, b) => b.delay_rate - a.delay_rate).map((d) => ({ label: d.airport, value: d.delay_rate }));
  return (
    <RateBarChart data={rows} horizontal label="Delay rate at the 25 busiest airports" valueLabel="Delayed 15+ min" labelWidth={44}
      colorBy={(v) => (overall != null && v > overall ? t.secondary : t.primary)} />
  );
}
