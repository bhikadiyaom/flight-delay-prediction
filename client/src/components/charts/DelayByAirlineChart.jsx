import { shortAirline } from '../../utils/formatters.js';
import RateBarChart from './RateBarChart.jsx';
import { useChartTheme } from './ChartFrame.jsx';

/** Share of flights arriving 15+ minutes late, by airline (worst first). Bars above the overall rate are amber. */
export default function DelayByAirlineChart({ data, overall }) {
  const t = useChartTheme();
  const rows = [...data].sort((a, b) => b.delay_rate - a.delay_rate).map((d) => ({ label: shortAirline(d.airline), value: d.delay_rate }));
  return (
    <RateBarChart data={rows} horizontal label="Delay rate by airline" valueLabel="Delayed 15+ min" labelWidth={118}
      colorBy={(v) => (overall != null && v > overall ? t.secondary : t.primary)} />
  );
}
