import { AlertTriangle, Clock, Info } from 'lucide-react';
import { SourceBadge, RiskBadge } from '../common/Badge.jsx';
import Card, { CardBody, CardHeader } from '../common/Card.jsx';
import { formatMinutes, formatPct } from '../../utils/formatters.js';
import ProbabilityGauge from './ProbabilityGauge.jsx';
import ShapExplanation from './ShapExplanation.jsx';

/**
 * result = response of POST /predictions or /predictions/live: { prediction, source?, demo?, cached?, stale? }.
 * Probabilities are calibrated: 35% means roughly 35 of 100 similar flights arrived 15+ minutes late.
 */
export default function PredictionResultCard({ result, title = 'Prediction' }) {
  const p = result.prediction;
  const showSource = result.source || result.cached || result.demo;
  return (
    <Card aria-live="polite" data-testid="prediction-result">
      <CardHeader title={title} subtitle={`Model ${p.modelVersion}`}
        actions={<>
          <RiskBadge level={p.riskLevel} />
          {showSource && <SourceBadge source={result.source ?? (result.cached ? 'cache' : undefined)} stale={result.stale} demo={result.demo} />}
        </>} />
      <CardBody className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <ProbabilityGauge value={p.delayProbability} label="Chance of a delay (15+ min)" zones={{ medium: 0.2, high: 0.4 }} />
          <ProbabilityGauge value={p.cancelProbability} label="Chance of cancellation" max={0.25} zones={{ medium: 0.03, high: 0.08 }} digits={1} />
        </div>

        <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
          <Clock size={20} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300" aria-hidden="true" />
          <div>
            {p.predictedDelayMinutes != null
              ? <p className="text-sm"><span className="font-semibold">Typical delay if late: about {formatMinutes(p.predictedDelayMinutes)}.</span> <span className="muted">This is a median-style estimate; real delays vary a lot.</span></p>
              : <p className="text-sm"><span className="font-semibold">Most likely on time ({formatPct(1 - p.delayProbability, 0)}).</span> <span className="muted">Delay length is only estimated when a delay is likely.</span></p>}
          </div>
        </div>

        {p.warnings?.length > 0 && (
          <ul className="space-y-2" aria-label="Notes about this prediction">
            {p.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{w}
              </li>
            ))}
          </ul>
        )}

        <ShapExplanation factors={p.topFactors} />

        <p className="muted flex items-start gap-2 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Probabilities are calibrated on past data. The model sees schedule, route, airport and airline history and daily weather, but not the live state of the aircraft, so treat it as guidance, not a guarantee.
        </p>
      </CardBody>
    </Card>
  );
}
