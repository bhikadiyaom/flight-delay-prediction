import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { cn } from '../../utils/cn.js';

const ToastContext = createContext(null);

const STYLES = {
  success: { icon: CheckCircle2, cls: 'border-emerald-600 text-emerald-900 dark:border-emerald-400 dark:text-emerald-100', ic: 'text-emerald-700 dark:text-emerald-400' },
  error: { icon: XCircle, cls: 'border-red-600 text-red-900 dark:border-red-400 dark:text-red-100', ic: 'text-red-700 dark:text-red-400' },
  warning: { icon: AlertTriangle, cls: 'border-amber-600 text-amber-950 dark:border-amber-400 dark:text-amber-100', ic: 'text-amber-700 dark:text-amber-400' },
  info: { icon: Info, cls: 'border-brand-600 text-slate-900 dark:border-brand-400 dark:text-slate-100', ic: 'text-brand-700 dark:text-brand-400' },
};

/** Toasts live in a polite aria-live region; errors stay longer. Dismissible with a button. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(({ type = 'info', title, message, duration }) => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((t) => [...t.slice(-3), { id, type, title, message }]);
    const ms = duration ?? (type === 'error' ? 8000 : 5000);
    if (ms > 0) setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    push, dismiss,
    success: (title, message) => push({ type: 'success', title, message }),
    error: (title, message) => push({ type: 'error', title, message }),
    info: (title, message) => push({ type: 'info', title, message }),
    warning: (title, message) => push({ type: 'warning', title, message }),
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((t) => {
          const s = STYLES[t.type];
          const Icon = s.icon;
          return (
            <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'}
              className={cn('pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-xl border-l-4 bg-white p-3.5 shadow-lg dark:bg-slate-900', s.cls)}>
              <Icon size={20} aria-hidden="true" className={cn('mt-0.5 shrink-0', s.ic)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.message && <p className="mt-0.5 text-sm opacity-90">{t.message}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="-m-1 rounded p-1.5 opacity-70 hover:opacity-100">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
