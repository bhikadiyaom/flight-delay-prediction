import { PlaneTakeoff, Route, Search } from 'lucide-react';
import { useState } from 'react';
import { isFlightCode, normalizeFlight } from '../../hooks/useFlightLookup.js';
import Button from '../common/Button.jsx';
import Input from '../common/Input.jsx';
import Tabs from '../common/Tabs.jsx';
import AirportInput from './AirportInput.jsx';

const MODES = [
  { value: 'flight', label: 'By flight number', icon: PlaneTakeoff },
  { value: 'route', label: 'By route', icon: Route },
];
const EXAMPLES = ['AA100', 'DL400', 'UA200', 'WN500'];

/** onSearch({ flight }) or onSearch({ origin, destination }). Examples are demo flights that always work. */
export default function FlightSearchForm({ mode, onModeChange, initial = {}, onSearch, loading }) {
  const [flight, setFlight] = useState(initial.flight ?? '');
  const [origin, setOrigin] = useState(initial.origin ?? '');
  const [destination, setDestination] = useState(initial.destination ?? '');
  const [errors, setErrors] = useState({});

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'flight') {
      if (!isFlightCode(flight)) { setErrors({ flight: 'Enter an airline code and number, like AA100' }); return; }
      setErrors({});
      onSearch({ flight: normalizeFlight(flight) });
    } else {
      const errs = {};
      if (!origin) errs.origin = 'Pick the departure airport';
      if (!destination) errs.destination = 'Pick the arrival airport';
      if (origin && origin === destination) errs.destination = 'Must differ from the origin';
      setErrors(errs);
      if (!Object.keys(errs).length) onSearch({ origin, destination });
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Tabs tabs={MODES} value={mode} onChange={onModeChange} label="Search type" idBase="live-mode" />
      <div role="tabpanel" id="live-mode-panel" aria-labelledby={`live-mode-${mode}`} className="space-y-4">
        {mode === 'flight' ? (
          <div>
            <Input label="Flight number" required icon={Search} value={flight} placeholder="e.g. AA100" autoComplete="off" spellCheck={false} maxLength={12}
              className="code uppercase placeholder:normal-case" error={errors.flight} onChange={(e) => setFlight(e.target.value)} />
            <p className="muted mt-2 text-xs">
              Try a demo flight:{' '}
              {EXAMPLES.map((x) => (
                <button key={x} type="button" onClick={() => { setFlight(x); setErrors({}); onSearch({ flight: x }); }}
                  className="code mr-1.5 inline-flex min-h-9 items-center rounded-md border border-slate-300 px-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">{x}</button>
              ))}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <AirportInput label="From" required value={origin} onChange={setOrigin} error={errors.origin} />
            <AirportInput label="To" required value={destination} onChange={setDestination} error={errors.destination} placeholder="City or code, e.g. LAX" />
          </div>
        )}
      </div>
      <Button type="submit" size="lg" icon={Search} loading={loading}>{mode === 'flight' ? 'Look up flight' : 'Find flights'}</Button>
    </form>
  );
}
