import { forwardRef, useId } from 'react';
import { cn } from '../../utils/cn.js';
import { fieldClasses } from './Input.jsx';

/** Native <select> (best mobile + a11y behaviour). Pass <option>s as children or `options=[{value,label}]`. */
const Select = forwardRef(function Select({ label, hint, error, options, className, wrapperClassName, id, required, children, ...rest }, ref) {
  const uid = useId();
  const fid = id ?? uid;
  const describedBy = [error && `${fid}-err`, hint && `${fid}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={wrapperClassName}>
      {label && <label htmlFor={fid} className="field-label">{label}{required && <span className="ml-0.5 text-red-700 dark:text-red-400" aria-hidden="true">*</span>}</label>}
      <select ref={ref} id={fid} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy}
        className={cn(fieldClasses(error), 'pr-8', className)} {...rest}>
        {options ? options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>) : children}
      </select>
      {hint && !error && <p id={`${fid}-hint`} className="muted mt-1 text-xs">{hint}</p>}
      {error && <p id={`${fid}-err`} role="alert" className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
});

export default Select;
