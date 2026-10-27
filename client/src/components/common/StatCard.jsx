import { cn } from '../../utils/cn.js';
import Skeleton from './Skeleton.jsx';

/** KPI tile: big number, label, optional hint. `loading` keeps the tile's size so nothing jumps. */
export default function StatCard({ label, value, hint, icon: Icon, tone = 'brand', loading, className }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
    good: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    warn: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    bad: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  };
  return (
    <div className={cn('card flex items-start gap-3 p-4', className)}>
      {Icon && <span className={cn('rounded-lg p-2.5', tones[tone])}><Icon size={20} aria-hidden="true" /></span>}
      <div className="min-w-0">
        <p className="muted text-xs font-medium uppercase tracking-wide">{label}</p>
        {loading ? <Skeleton className="mt-1.5 h-7 w-24" /> : <p className="mt-0.5 truncate text-2xl font-semibold tabular-nums">{value}</p>}
        {hint && <p className="muted mt-0.5 text-xs">{hint}</p>}
      </div>
    </div>
  );
}
