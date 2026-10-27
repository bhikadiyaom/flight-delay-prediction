import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';
import Spinner from './Spinner.jsx';

const VARIANTS = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 dark:bg-brand-500 dark:text-slate-950 dark:hover:bg-brand-400',
  accent: 'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  ghost: 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-red-700 text-white hover:bg-red-800 dark:bg-red-500 dark:text-slate-950 dark:hover:bg-red-400',
};
// md/lg meet the 44px touch target; sm is for dense desktop toolbars only
const SIZES = { sm: 'min-h-9 px-3 text-sm', md: 'min-h-11 px-4 text-sm', lg: 'min-h-12 px-6 text-base' };

/** `as` lets it render a router <Link> (pass `to`) while keeping button styling. */
const Button = forwardRef(function Button(
  { as: Tag = 'button', variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, type, ...rest }, ref) {
  const isButton = Tag === 'button';
  return (
    <Tag
      ref={ref}
      {...(isButton ? { type: type ?? 'button', disabled: disabled || loading } : {})}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-60', VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {loading ? <Spinner size={16} label="Working" className="[&_svg]:text-current" /> : Icon ? <Icon size={size === 'sm' ? 15 : 18} aria-hidden="true" /> : null}
      {children}
    </Tag>
  );
});

export default Button;
