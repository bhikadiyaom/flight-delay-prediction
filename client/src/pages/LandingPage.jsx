import { ArrowRight, BarChart3, Bell, BrainCircuit, CloudRain, Gauge, Map, PlaneTakeoff, Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button.jsx';
import ProbabilityGauge from '../components/prediction/ProbabilityGauge.jsx';
import { RiskBadge } from '../components/common/Badge.jsx';
import { useOverview } from '../hooks/useFlightLookup.js';
import { formatInt, formatPct } from '../utils/formatters.js';

const FEATURES = [
  { icon: PlaneTakeoff, title: 'Live flights', text: 'Look up a flight number and get its status, gates and the weather at both airports.' },
  { icon: BrainCircuit, title: 'Explained predictions', text: 'See the five factors behind every score, from the airport’s recent delays to rain at departure.' },
  { icon: Scale, title: 'Honest probabilities', text: 'Scores are calibrated: 30% means about 30 in 100 similar flights ran 15+ minutes late.' },
  { icon: BarChart3, title: 'Insights from 6.8M flights', text: 'Delay rates by airline, airport, weekday, weather and cause across all of 2023.' },
  { icon: Map, title: 'Airport risk map', text: 'Spot the airports that run late or cancel most, sized by traffic.' },
  { icon: Bell, title: 'Alerts and bulk', text: 'Save routes, get an email when risk changes, or score a CSV of 500 flights at once.' },
];

const STEPS = [
  { n: 1, title: 'Pick a flight', text: 'Type a flight number, choose a route, or enter your own what-if details.' },
  { n: 2, title: 'We add the context', text: 'Airline and airport history, time of day, holidays and the day’s weather.' },
  { n: 3, title: 'Get a risk and the reasons', text: 'Delay and cancellation probability, a typical delay length, and what drives it.' },
];

export default function LandingPage() {
  const { data } = useOverview();
  const totals = data?.totals;
  return (
    <div>
      <section className="border-b border-slate-200 bg-gradient-to-b from-brand-50 to-slate-50 dark:border-slate-800 dark:from-brand-950/50 dark:to-slate-950">
        <div className="mx-auto grid max-w-screen-xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200 dark:bg-slate-900 dark:text-brand-300 dark:ring-brand-800">
              <CloudRain size={14} aria-hidden="true" /> Machine learning on 2023 US flights and weather
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">Will your flight be late? <span className="text-brand-700 dark:text-brand-400">Know before you go.</span></h1>
            <p className="muted mt-4 max-w-xl text-lg">Predict the chance of a delay or cancellation for any US flight, see why, and check live status and weather in one place.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button as={Link} to="/predict" size="lg" icon={Gauge}>Predict a flight</Button>
              <Button as={Link} to="/live" size="lg" variant="secondary" icon={PlaneTakeoff}>Check a live flight</Button>
            </div>
            {totals && (
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 text-sm">
                <div><dt className="muted">Flights analysed</dt><dd className="text-xl font-semibold tabular-nums">{formatInt(totals.flights)}</dd></div>
                <div><dt className="muted">Delayed 15+ min</dt><dd className="text-xl font-semibold tabular-nums">{formatPct(totals.delay_rate, 0)}</dd></div>
                <div><dt className="muted">Airports</dt><dd className="text-xl font-semibold tabular-nums">{totals.airports}</dd></div>
              </dl>
            )}
          </div>

          <div className="card mx-auto w-full max-w-md p-6" aria-label="Example prediction">
            <div className="mb-1 flex items-center justify-between">
              <p className="code text-sm font-semibold">ORD → LGA · evening</p>
              <RiskBadge level="high" />
            </div>
            <p className="muted mb-2 text-xs">Example output for a snowy Chicago departure</p>
            <ProbabilityGauge value={0.63} label="Chance of a delay (15+ min)" />
            <ul className="mt-3 space-y-1.5 text-sm">
              <li className="flex justify-between"><span>Snow at origin</span><span className="font-semibold text-red-700 dark:text-red-400">raises risk</span></li>
              <li className="flex justify-between"><span>Origin delay history at this hour</span><span className="font-semibold text-red-700 dark:text-red-400">raises risk</span></li>
              <li className="flex justify-between"><span>Mid-week</span><span className="font-semibold text-emerald-700 dark:text-emerald-400">lowers risk</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-screen-xl px-4 py-14 sm:px-6" aria-labelledby="features">
        <h2 id="features" className="text-2xl font-semibold sm:text-3xl">Everything in one place</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card p-5">
              <span className="inline-flex rounded-lg bg-brand-50 p-2.5 text-brand-700 dark:bg-brand-950 dark:text-brand-300"><Icon size={22} aria-hidden="true" /></span>
              <h3 className="mt-3 text-lg font-semibold">{title}</h3>
              <p className="muted mt-1 text-sm">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-14 dark:border-slate-800 dark:bg-slate-900/40" aria-labelledby="how">
        <div className="mx-auto max-w-screen-xl px-4 sm:px-6">
          <h2 id="how" className="text-2xl font-semibold sm:text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-700 font-semibold text-white dark:bg-brand-500 dark:text-slate-950">{s.n}</span>
                <div><h3 className="font-semibold">{s.title}</h3><p className="muted mt-1 text-sm">{s.text}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-screen-xl px-4 py-14 sm:px-6" aria-labelledby="limits">
        <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="limits" className="text-xl font-semibold">What it can and can’t do</h2>
            <p className="muted mt-1 max-w-2xl text-sm">Delays are hard to predict from the schedule alone. The model separates riskier flights from safer ones, but it cannot see the aircraft’s live state. We publish every metric, including the unflattering ones, and test on months the model never saw.</p>
          </div>
          <Button as={Link} to="/models" variant="secondary" icon={ArrowRight} className="shrink-0">See model accuracy</Button>
        </div>
      </section>
    </div>
  );
}
