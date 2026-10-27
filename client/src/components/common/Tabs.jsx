import { useRef } from 'react';
import { cn } from '../../utils/cn.js';

/** WAI-ARIA tabs with arrow-key navigation. Render the panel yourself, keyed on `value`: <div role="tabpanel" id={`${idBase}-panel`}>. */
export default function Tabs({ tabs, value, onChange, label, idBase = 'tabs', className }) {
  const refs = useRef([]);
  const onKeyDown = (e, i) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : tabs.length - 1;
      onChange(tabs[j].value); refs.current[j]?.focus();
    } else if (dir) {
      e.preventDefault();
      const j = (i + dir + tabs.length) % tabs.length;
      onChange(tabs[j].value); refs.current[j]?.focus();
    }
  };
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70', className)}>
      {tabs.map((t, i) => {
        const selected = t.value === value;
        return (
          <button key={t.value} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${idBase}-${t.value}`} aria-selected={selected}
            aria-controls={`${idBase}-panel`} tabIndex={selected ? 0 : -1} onClick={() => onChange(t.value)} onKeyDown={(e) => onKeyDown(e, i)}
            className={cn('inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors',
              selected ? 'bg-white text-brand-800 shadow-sm dark:bg-slate-950 dark:text-brand-300' : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white')}>
            {t.icon && <t.icon size={16} aria-hidden="true" />}{t.label}
          </button>
        );
      })}
    </div>
  );
}
