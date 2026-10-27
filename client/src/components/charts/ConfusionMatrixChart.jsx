import { formatInt, formatPct } from '../../utils/formatters.js';

/**
 * 2x2 confusion matrix as a labelled grid (not a chart library): counts + the share of each ACTUAL class.
 * matrix = [[tn, fp], [fn, tp]] (rows = actual on time / delayed, columns = predicted).
 */
export default function ConfusionMatrixChart({ matrix, title = 'Confusion matrix', classes = ['On time', 'Delayed'] }) {
  const [[tn, fp], [fn, tp]] = matrix;
  const rows = [
    { actual: classes[0], cells: [{ v: tn, ok: true }, { v: fp, ok: false }], total: tn + fp },
    { actual: classes[1], cells: [{ v: fn, ok: false }, { v: tp, ok: true }], total: fn + tp },
  ];
  return (
    <div>
      <table className="w-full table-fixed border-separate border-spacing-1.5 text-center text-sm">
        <caption className="sr-only">{title}: rows are the actual outcome, columns are the prediction.</caption>
        <thead>
          <tr>
            <th className="w-20" />
            {classes.map((c) => <th key={c} scope="col" className="pb-1 text-xs font-medium text-slate-600 dark:text-slate-400">Predicted<br />{c.toLowerCase()}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.actual}>
              <th scope="row" className="pr-1 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Actually<br />{r.actual.toLowerCase()}</th>
              {r.cells.map((c, i) => {
                const share = r.total ? c.v / r.total : 0;
                return (
                  <td key={i} className={c.ok ? 'rounded-lg bg-brand-100 text-brand-950 dark:bg-brand-900/60 dark:text-brand-50' : 'rounded-lg bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'}
                    style={{ boxShadow: c.ok ? `inset 0 0 0 ${Math.round(share * 6)}px rgba(29,78,216,0.25)` : undefined }}>
                    <div className="px-2 py-3.5">
                      <div className="text-lg font-semibold tabular-nums">{formatInt(c.v)}</div>
                      <div className="text-xs opacity-80">{formatPct(share, 1)} of actual {r.actual.toLowerCase()}</div>
                      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">{c.ok ? 'correct' : 'wrong'}</div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
