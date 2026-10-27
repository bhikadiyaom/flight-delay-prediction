import { Bookmark, Gauge } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorStatus, getErrorMessage } from '../api/axiosClient.js';
import { savedSearchApi } from '../api/savedSearchApi.js';
import Button from '../components/common/Button.jsx';
import Card, { CardBody, CardHeader } from '../components/common/Card.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import { useToast } from '../components/common/Toast.jsx';
import PredictionForm from '../components/prediction/PredictionForm.jsx';
import PredictionResultCard from '../components/prediction/PredictionResultCard.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useManualPrediction } from '../hooks/usePrediction.js';

export function predictionErrorMessage(err, signedIn) {
  if (errorStatus(err) === 429) {
    return signedIn ? 'You have reached the prediction limit for now. Please wait a few minutes.'
      : 'You have reached the free prediction limit. Sign in for a higher limit, or wait a few minutes.';
  }
  return getErrorMessage(err, 'Could not get a prediction.');
}

export default function PredictPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const mutation = useManualPrediction();
  const lastInput = useRef(null);
  const resultRef = useRef(null);

  const initial = {
    origin: /^[A-Za-z]{3}$/.test(params.get('origin') ?? '') ? params.get('origin').toUpperCase() : '',
    destination: /^[A-Za-z]{3}$/.test(params.get('destination') ?? '') ? params.get('destination').toUpperCase() : '',
    airline: params.get('airline') ?? '',
  };

  const save = useMutation({
    mutationFn: () => savedSearchApi.create({ type: 'route', label: `${lastInput.current.origin} to ${lastInput.current.destination}`, origin: lastInput.current.origin, destination: lastInput.current.destination, airline: undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved'] }); toast.success('Route saved', 'Find it under Saved searches.'); },
    onError: (e) => toast.error('Could not save', getErrorMessage(e)),
  });

  const onSubmit = (payload) => {
    lastInput.current = payload;
    mutation.mutate(payload, { onSuccess: () => requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })) });
  };

  return (
    <div>
      <PageHeader icon={Gauge} title="Predict a flight" subtitle="Enter the flight details to get the chance of a delay or cancellation. Add weather if you know it; otherwise typical conditions are used." />
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Flight details" subtitle="Times are local to the departure airport" />
          <CardBody><PredictionForm initial={initial} onSubmit={onSubmit} loading={mutation.isPending} /></CardBody>
        </Card>
        <div className="min-w-0 xl:col-span-3" ref={resultRef}>
          {mutation.isError && <p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">{predictionErrorMessage(mutation.error, Boolean(user))}</p>}
          {mutation.data ? (
            <div className="space-y-3">
              <PredictionResultCard result={mutation.data} title={`${lastInput.current?.origin} → ${lastInput.current?.destination}`} />
              <div className="flex flex-wrap gap-2">
                {user
                  ? <Button variant="secondary" icon={Bookmark} loading={save.isPending} onClick={() => save.mutate()}>Save this route</Button>
                  : <Button as={Link} to="/login" state={{ from: { pathname: '/predict' } }} variant="secondary" icon={Bookmark}>Log in to save this route</Button>}
              </div>
            </div>
          ) : !mutation.isPending && (
            <div className="card flex h-full min-h-[18rem] flex-col items-center justify-center p-8 text-center">
              <Gauge size={40} className="text-slate-400" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold">Your prediction appears here</h2>
              <p className="muted mt-1 max-w-sm text-sm">You will see the delay and cancellation chances, the typical delay length and the reasons behind the score.</p>
            </div>
          )}
          {mutation.isPending && <div className="card grid min-h-[18rem] place-items-center p-8" role="status" aria-label="Calculating prediction"><p className="muted text-sm">Calculating…</p></div>}
        </div>
      </div>
    </div>
  );
}
