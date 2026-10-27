import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { featureLabel } from '../../utils/formatters.js';
import { cn } from '../../utils/cn.js';

/**
 * Top factors behind a delay prediction (SHAP values from the model). Bars grow right (raises delay risk) or left
 * (lowers it) from a centre line; each row also says it in words, so colour is never the only signal.
 */
export default function ShapExplanation({ factors }) {
  if (!factors?.length) return null;
  const max = Math.max(...factors.map((f) => Math.abs(f.shapValue)), 0.01);
  return (
    <div>
      <h3 className="text-base font-semibold">Why this score?</h3>
      <p className="muted mt-0.5 text-sm">The five factors that moved this prediction the most. Bars to the right raise the delay risk, bars to the left lower it.</p>
      <ul className="mt-4 space-y-3">
        {factors.map((f) => {
          const up = f.direction === 'increases_delay_risk';
          const w = `${Math.max((Math.abs(f.shapValue) / max) * 50, 3)}%`;
          return (
            <li key={f.feature} data-testid="shap-row">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{featureLabel(f.feature)}<span className="muted font-normal">: {f.value}</span></span>
                <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs font-semibold', up ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')}>
                  {up ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
                  {up ? 'raises risk' : 'lowers risk'}
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800" role="presentation">
                <span className="absolute inset-y-0 left-1/2 w-px bg-slate-400 dark:bg-slate-500" aria-hidden="true" />
                <span className={cn('absolute inset-y-0 rounded-full', up ? 'left-1/2 bg-red-600 dark:bg-red-400' : 'right-1/2 bg-emerald-600 dark:bg-emerald-400')} style={{ width: w }} aria-hidden="true" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
