import { Bookmark, Gauge, PlaneTakeoff } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorStatus, getErrorMessage } from '../api/axiosClient.js';
import { savedSearchApi } from '../api/savedSearchApi.js';
import Badge, { SourceBadge } from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import Card, { CardBody, CardHeader } from '../components/common/Card.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import { SkeletonCard } from '../components/common/Skeleton.jsx';
import { useToast } from '../components/common/Toast.jsx';
import FlightSearchForm from '../components/flights/FlightSearchForm.jsx';
import LiveFlightCard from '../components/flights/LiveFlightCard.jsx';
import WeatherSummaryCard from '../components/flights/WeatherSummaryCard.jsx';
import PredictionResultCard from '../components/prediction/PredictionResultCard.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { isFlightCode, normalizeFlight, useFlightLookup, useRouteFlights } from '../hooks/useFlightLookup.js';
import { useLivePrediction } from '../hooks/usePrediction.js';
import { formatTime } from '../utils/formatters.js';
import { predictionErrorMessage } from './PredictPage.jsx';

const lookupError = (err) => (errorStatus(err) === 404 ? getErrorMessage(err) : errorStatus(err) === 400 ? 'That does not look like a flight number. Try something like AA100.' : getErrorMessage(err));

export default function LivePredictionPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const urlFlight = normalizeFlight(params.get('flight'));
  const urlOrigin = (params.get('origin') ?? '').toUpperCase();
  const urlDest = (params.get('destination') ?? '').toUpperCase();
  const [mode, setMode] = useState(urlOrigin && urlDest && !urlFlight ? 'route' : 'flight');
  const [flight, setFlight] = useState(isFlightCode(urlFlight) ? urlFlight : '');
  const [route, setRoute] = useState(urlOrigin && urlDest ? { origin: urlOrigin, destination: urlDest } : null);

  const lookup = useFlightLookup(flight);
  const routeQ = useRouteFlights(route?.origin, route?.destination, mode === 'route');
  const predict = useLivePrediction();
  const { reset: resetPrediction } = predict;
  useEffect(() => { resetPrediction(); }, [flight, resetPrediction]); // a new flight invalidates the old prediction

  const saveFlight = useMutation({
    mutationFn: () => savedSearchApi.create({ type: 'flight', label: `Flight ${flight}`, flightNumber: flight }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved'] }); toast.success('Flight saved', 'Turn on an email alert from Saved searches.'); },
    onError: (e) => toast.error('Could not save', getErrorMessage(e)),
  });

  const onSearch = (s) => {
    if (s.flight) { setFlight(s.flight); setParams({ flight: s.flight }); }
    else { setRoute(s); setParams({ origin: s.origin, destination: s.destination }); }
  };
  const pickFlight = (code) => { setMode('flight'); setFlight(code); setParams({ flight: code }); };

  const d = lookup.data;
  return (
    <div>
      <PageHeader icon={PlaneTakeoff} title="Live flight" subtitle="Look up a flight, see its status and the weather at both airports, then predict the chance it runs late." />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Find a flight" />
            <CardBody>
              <FlightSearchForm mode={mode} onModeChange={setMode} initial={{ flight, ...(route ?? {}) }} onSearch={onSearch} loading={lookup.isFetching || routeQ.isFetching} />
            </CardBody>
          </Card>

          {mode === 'route' && route && (
            <Card>
              <CardHeader title={`${route.origin} → ${route.destination}`} subtitle="Upcoming flights" actions={routeQ.data && <SourceBadge source={routeQ.data.source} stale={routeQ.data.stale} demo={routeQ.data.demo} />} />
              <CardBody>
                {routeQ.isPending ? <SkeletonCard height="h-24" className="border-0 shadow-none" />
                  : routeQ.isError ? <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{getErrorMessage(routeQ.error)}</p>
                    : routeQ.data.flights.length === 0 ? <EmptyState title="No upcoming flights found" description="Try the opposite direction or a nearby airport." />
                      : (
                        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                          {routeQ.data.flights.map((f) => (
                            <li key={f.flightIata}>
                              <button type="button" onClick={() => pickFlight(f.flightIata)} className="flex min-h-14 w-full items-center gap-3 px-1 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                <span className="code w-20 font-semibold">{f.flightIata}</span>
                                <span className="muted min-w-0 flex-1 truncate text-sm">{f.airline?.name}</span>
                                <span className="tabular-nums text-sm font-medium">{formatTime(f.origin.scheduled)}</span>
                                {f.origin.delayMinutes > 0 && <Badge tone="warn">+{f.origin.delayMinutes}m</Badge>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-6 xl:col-span-3">
          {!flight && <EmptyState icon={PlaneTakeoff} title="Search for a flight" description="Enter a flight number like AA100, or switch to “By route” to pick from upcoming flights." className="min-h-[18rem]" />}
          {flight && lookup.isPending && <div className="space-y-4"><SkeletonCard height="h-32" /><SkeletonCard height="h-24" /></div>}
          {flight && lookup.isError && (
            <div role="alert" className="card p-6"><h2 className="font-semibold">We could not find that flight</h2><p className="muted mt-1 text-sm">{lookupError(lookup.error)}</p></div>
          )}
          {d && (
            <>
              <LiveFlightCard flight={d.flight} source={d.source} stale={d.stale} demo={d.demo} fetchedAt={d.fetchedAt} />
              <WeatherSummaryCard origin={d.flight.origin.iata} destination={d.flight.destination.iata} weather={d.weather} />
              {!predict.data && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" icon={Gauge} loading={predict.isPending} onClick={() => predict.mutate(flight)}>Predict delay risk</Button>
                  {user
                    ? <Button variant="secondary" size="lg" icon={Bookmark} loading={saveFlight.isPending} onClick={() => saveFlight.mutate()}>Save flight</Button>
                    : <Button as={Link} to="/login" state={{ from: { pathname: '/live', search: `?flight=${flight}` } }} variant="secondary" size="lg" icon={Bookmark}>Log in to save</Button>}
                </div>
              )}
              {predict.isError && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">{predictionErrorMessage(predict.error, Boolean(user))}</p>}
              {predict.data && <PredictionResultCard result={predict.data} title={`Prediction for ${flight}`} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
