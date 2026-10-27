import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../utils/cn.js';
import EmptyState from './EmptyState.jsx';

/**
 * columns: [{ key, header, render?(row), sortable?, sortValue?(row), align?: 'left'|'right'|'center', className? }]
 * Client-side sort (+ optional client-side paging via pageSize). For server paging render <Pager> yourself.
 * Scrolls horizontally inside its own box on small screens, so the page never gets a horizontal scrollbar.
 */
export default function DataTable({ columns, rows, rowKey = (r) => r.id, caption, pageSize, initialSort, dense = false, empty, className }) {
  const [sort, setSort] = useState(initialSort ?? null); // { key, dir: 'asc'|'desc' }
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = (r) => (col.sortValue ? col.sortValue(r) : r[col.key]);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // empty values always last
      if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir;
    });
  }, [rows, sort, columns]);

  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const current = Math.min(page, pages);
  const visible = pageSize ? sorted.slice((current - 1) * pageSize, current * pageSize) : sorted;

  const toggle = (key) => { setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' })); setPage(1); };

  if (!rows.length) return empty ?? <EmptyState title="Nothing to show" description="There are no rows to display." />;

  const cellPad = dense ? 'px-3 py-2' : 'px-4 py-3';
  return (
    <div className={className}>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-max text-left text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined}
                    className={cn(cellPad, 'font-semibold', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}>
                    {c.sortable ? (
                      <button type="button" onClick={() => toggle(c.key)} className={cn('inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-slate-900 dark:hover:text-slate-100', c.align === 'right' && 'flex-row-reverse')}>
                        {c.header}
                        {active ? (sort.dir === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />) : <ArrowUpDown size={13} aria-hidden="true" className="opacity-50" />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
            {visible.map((r) => (
              <tr key={rowKey(r)} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn(cellPad, c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center', c.className)}>
                    {c.render ? c.render(r) : r[c.key] ?? '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize && pages > 1 && <Pager page={current} pages={pages} onChange={setPage} total={sorted.length} pageSize={pageSize} className="mt-3" />}
    </div>
  );
}

export function Pager({ page, pages, onChange, total, pageSize, className }) {
  const from = total && pageSize ? (page - 1) * pageSize + 1 : null;
  const to = total && pageSize ? Math.min(page * pageSize, total) : null;
  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-between gap-2 text-sm', className)}>
      <p className="muted">{from ? `${from}-${to} of ${total}` : `Page ${page} of ${pages}`}</p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page"
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="px-2 tabular-nums" aria-current="page">{page} / {pages}</span>
        <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Next page"
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
