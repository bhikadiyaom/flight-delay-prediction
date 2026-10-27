import { cn } from '../../utils/cn.js';

export default function Card({ as: Tag = 'section', className, children, ...rest }) {
  return <Tag className={cn('card', className)} {...rest}>{children}</Tag>;
}

export function CardHeader({ title, subtitle, actions, icon: Icon, className, as: H = 'h2' }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <span className="mt-0.5 rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-950 dark:text-brand-300"><Icon size={18} aria-hidden="true" /></span>}
        <div className="min-w-0">
          <H className="text-base font-semibold">{title}</H>
          {subtitle && <p className="muted mt-0.5 text-sm">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const CardBody = ({ className, children }) => <div className={cn('p-5', className)}>{children}</div>;
