import { forwardRef, useId } from 'react';
import { cn } from '../../utils/cn.js';

export const fieldClasses = (error) =>
  cn(
    'block w-full min-h-11 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-500',
    'dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400',
    'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-70 dark:disabled:bg-slate-800',
    error ? 'border-red-600 dark:border-red-400' : 'border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600');

/** Labelled input with hint + inline error (error text is tied to the field via aria-describedby, not colour alone). */
const Input = forwardRef(function Input({ label, hint, error, className, wrapperClassName, id, required, icon: Icon, ...rest }, ref) {
  const uid = useId();
  const fid = id ?? uid;
  const describedBy = [error && `${fid}-err`, hint && `${fid}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={fid} className="field-label">
          {label}{required && <span className="ml-0.5 text-red-700 dark:text-red-400" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && <Icon size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />}
        <input ref={ref} id={fid} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy}
          className={cn(fieldClasses(error), Icon && 'pl-9', className)} {...rest} />
      </div>
      {hint && !error && <p id={`${fid}-hint`} className="muted mt-1 text-xs">{hint}</p>}
      {error && <p id={`${fid}-err`} role="alert" className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
});

export default Input;
