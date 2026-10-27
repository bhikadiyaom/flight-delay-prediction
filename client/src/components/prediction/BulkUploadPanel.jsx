import { Download, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { BULK_MAX_BYTES, BULK_MAX_ROWS } from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';
import Button from '../common/Button.jsx';

export const TEMPLATE_CSV = [
  'airline,origin,destination,scheduled_departure,distance_miles,origin_temperature_c,origin_precipitation_mm,origin_wind_speed_kmh,origin_snowfall_cm',
  'DL,ATL,JFK,2026-12-22T09:00:00,760,12,0,15,0',
  'UA,ORD,SFO,2026-12-22T11:15:00,,-4,3.5,30,2',
  'WN,DEN,LAS,2026-12-23T13:40:00,,,,,',
].join('\n');

/** Client-side pre-checks (the server validates again): .csv only, at most 512 KB. */
export function checkCsvFile(file) {
  if (!file) return 'Choose a CSV file';
  if (!/\.csv$/i.test(file.name)) return 'Only .csv files are accepted';
  if (file.size > BULK_MAX_BYTES) return `File is too large (${Math.round(file.size / 1024)} KB). The limit is 512 KB`;
  if (file.size === 0) return 'The file is empty';
  return null;
}

export function downloadText(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Drag-and-drop (or click / keyboard) CSV picker. Calls onSubmit(file) after the client-side checks pass. */
export default function BulkUploadPanel({ onSubmit, loading }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  const id = useId();

  const choose = (f) => { setError(checkCsvFile(f)); setFile(f ?? null); };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files?.[0]); };
  const submit = () => { const err = checkCsvFile(file); setError(err); if (!err) onSubmit(file); };

  return (
    <div className="space-y-4">
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
        className={cn('relative rounded-xl border-2 border-dashed p-8 text-center transition-colors', drag ? 'border-brand-600 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/40' : 'border-slate-300 dark:border-slate-700')}>
        <UploadCloud size={32} className="mx-auto text-brand-700 dark:text-brand-300" aria-hidden="true" />
        <p className="mt-2 font-medium">Drag a CSV here, or</p>
        <label htmlFor={id} className="mt-2 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Browse files
          <input ref={input} id={id} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
        </label>
        <p className="muted mt-3 text-xs">Up to {BULK_MAX_ROWS} rows and 512 KB. Required columns: airline, origin, destination, scheduled_departure.</p>
      </div>

      {file && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <FileSpreadsheet size={20} className="shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="muted text-xs">{(file.size / 1024).toFixed(1)} KB</p></div>
          <button type="button" aria-label="Remove file" onClick={() => { choose(null); if (input.current) input.current.value = ''; }} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button onClick={submit} loading={loading} disabled={!file || Boolean(error)} size="lg" icon={UploadCloud}>Predict all rows</Button>
        <Button variant="secondary" size="lg" icon={Download} onClick={() => downloadText('flight-delay-template.csv', TEMPLATE_CSV)}>Download template</Button>
      </div>
    </div>
  );
}
