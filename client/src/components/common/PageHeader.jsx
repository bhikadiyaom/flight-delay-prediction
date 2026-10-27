import { cn } from '../../utils/cn.js';

export default function PageHeader({ title, subtitle, actions, icon: Icon, className }) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <span className="mt-1 hidden rounded-xl bg-brand-700 p-2.5 text-white sm:block dark:bg-brand-500 dark:text-slate-950"><Icon size={22} aria-hidden="true" /></span>}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
          {subtitle && <p className="muted mt-1 max-w-2xl text-sm sm:text-base">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
