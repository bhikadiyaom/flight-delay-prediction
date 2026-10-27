import { AlertTriangle, CheckCircle2, Database, FlaskConical, Radio, ShieldAlert } from 'lucide-react';
import { RISK } from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';

const TONES = {
  neutral: 'bg-slate-100 text-slate-800 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-400/30',
  brand: 'bg-brand-50 text-brand-800 ring-brand-600/20 dark:bg-brand-950 dark:text-brand-200 dark:ring-brand-400/30',
  warn: 'bg-amber-100 text-amber-900 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30',
  good: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30',
  bad: 'bg-red-100 text-red-800 ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-400/30',
};

export default function Badge({ tone = 'neutral', icon: Icon, children, className, title }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {Icon && <Icon size={12} aria-hidden="true" />}{children}
    </span>
  );
}

const RISK_ICON = { low: CheckCircle2, medium: AlertTriangle, high: ShieldAlert };

/** Risk is always icon + text + colour, never colour alone. */
export function RiskBadge({ level, className }) {
  const r = RISK[level];
  if (!r) return null;
  const Icon = RISK_ICON[level];
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', r.badge, className)}>
      <Icon size={12} aria-hidden="true" />{r.label}
    </span>
  );
}

/** Where a response came from: live API, cache (maybe stale) or demo data. */
export function SourceBadge({ source, stale, demo }) {
  if (demo || source === 'mock') return <Badge tone="warn" icon={FlaskConical} title="Live flight data is unavailable, so this uses built-in demo flights">Demo data</Badge>;
  if (source === 'cache') return <Badge tone="neutral" icon={Database} title={stale ? 'Cached copy: the live service did not answer' : 'Recently fetched, served from cache'}>{stale ? 'Cached (stale)' : 'Cached'}</Badge>;
  if (source === 'live') return <Badge tone="good" icon={Radio} title="Fetched just now">Live</Badge>;
  return null;
}
