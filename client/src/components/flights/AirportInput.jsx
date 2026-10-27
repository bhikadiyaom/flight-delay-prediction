import { MapPin } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useAirportSearch } from '../../hooks/useFlightLookup.js';
import { cn } from '../../utils/cn.js';
import { fieldClasses } from '../common/Input.jsx';

/**
 * Airport autocomplete (WAI-ARIA combobox). `value` is the 3-letter IATA code; typing a code directly also works.
 * Keyboard: Up/Down to move, Enter to pick, Esc to close.
 */
export default function AirportInput({ label, value, onChange, error, required, placeholder = 'City or code, e.g. JFK', id }) {
  const uid = useId();
  const fid = id ?? uid;
  const [text, setText] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const { data: options = [] } = useAirportSearch(open ? text : '');

  useEffect(() => { setText((cur) => (value && cur.toUpperCase() !== value ? value : cur)); }, [value]);
  useEffect(() => {
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (a) => { setText(a.iata); onChange(a.iata); setOpen(false); };
  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && options[active]) { e.preventDefault(); pick(options[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const listId = `${fid}-list`;
  return (
    <div ref={box} className="relative">
      <label htmlFor={fid} className="field-label">{label}{required && <span className="ml-0.5 text-red-700 dark:text-red-400" aria-hidden="true">*</span>}</label>
      <div className="relative">
        <MapPin size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
        <input id={fid} type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" spellCheck={false}
          aria-activedescendant={open && options[active] ? `${fid}-opt-${active}` : undefined} aria-invalid={error ? true : undefined} aria-describedby={error ? `${fid}-err` : undefined}
          value={text} placeholder={placeholder} className={cn(fieldClasses(error), 'pl-9 uppercase placeholder:normal-case')}
          onChange={(e) => {
            const v = e.target.value;
            setText(v); setOpen(true); setActive(0);
            onChange(/^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : '');
          }}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
      </div>
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {options.map((a, i) => (
            <li key={a.iata} id={`${fid}-opt-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(a); }}
              className={cn('flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm', i === active && 'bg-brand-50 dark:bg-brand-950')}>
              <span className="code w-10 font-semibold">{a.iata}</span>
              <span className="min-w-0 flex-1 truncate">{a.city}, {a.state} <span className="muted">· {a.name}</span></span>
            </li>
          ))}
        </ul>
      )}
      {error && <p id={`${fid}-err`} role="alert" className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
