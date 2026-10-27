import { cn } from '../../utils/cn.js';

/** Placeholder block that reserves the final layout space (no layout shift when data arrives). */
export default function Skeleton({ className, ...rest }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-slate-200 dark:bg-slate-800', className)} {...rest} />;
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />)}
    </div>
  );
}

export function SkeletonCard({ height = 'h-64', className }) {
  return (
    <div className={cn('card p-5', className)} role="status" aria-label="Loading">
      <Skeleton className="mb-4 h-4 w-1/3" />
      <Skeleton className={cn('w-full', height)} />
    </div>
  );
}
