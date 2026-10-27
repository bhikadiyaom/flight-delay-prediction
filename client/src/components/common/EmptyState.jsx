import { Inbox } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export default function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700', className)}>
      <span className="mb-3 rounded-full bg-slate-100 p-3 text-slate-600 dark:bg-slate-800 dark:text-slate-400"><Icon size={24} aria-hidden="true" /></span>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="muted mt-1 max-w-md text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
