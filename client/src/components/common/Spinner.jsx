import { cn } from '../../utils/cn.js';

export default function Spinner({ size = 20, label = 'Loading', className }) {
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin text-brand-600 dark:text-brand-400" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
