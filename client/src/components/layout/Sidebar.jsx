import { BarChart3, Bookmark, FileSpreadsheet, FlaskConical, Gauge, History, Lock, Map, PlaneTakeoff, ShieldCheck, User, X } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { ACCOUNT_NAV, NAV_ITEMS } from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';
import { Logo } from './Navbar.jsx';

const ICONS = { Gauge, PlaneTakeoff, BarChart3, History, Map, FlaskConical, Bookmark, FileSpreadsheet, User, ShieldCheck };

function Item({ to, label, icon, locked, onNavigate }) {
  const Icon = ICONS[icon];
  return (
    <NavLink to={to} onClick={onNavigate}
      className={({ isActive }) => cn('group flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
        isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-300' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
      <Icon size={18} aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {locked && <><Lock size={13} aria-hidden="true" className="opacity-60" /><span className="sr-only">(requires login)</span></>}
    </NavLink>
  );
}

function NavList({ onNavigate }) {
  const { user, isAdmin } = useAuth();
  return (
    <nav aria-label="Main" className="flex flex-col gap-6 px-3 py-4">
      <div>
        <p className="muted mb-2 px-3 text-xs font-semibold uppercase tracking-wider">Explore</p>
        <ul className="space-y-0.5">{NAV_ITEMS.map((i) => <li key={i.to}><Item {...i} onNavigate={onNavigate} /></li>)}</ul>
      </div>
      <div>
        <p className="muted mb-2 px-3 text-xs font-semibold uppercase tracking-wider">Your account</p>
        <ul className="space-y-0.5">
          {ACCOUNT_NAV.map((i) => <li key={i.to}><Item {...i} locked={!user} onNavigate={onNavigate} /></li>)}
          {isAdmin && <li><Item to="/admin" label="Admin" icon="ShieldCheck" onNavigate={onNavigate} /></li>}
        </ul>
      </div>
    </nav>
  );
}

/** Static column on lg+, slide-over drawer below. The drawer closes on navigation and on Escape. */
export default function Sidebar({ open, onClose }) {
  const { pathname } = useLocation();
  useEffect(() => { onClose?.(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-950">
        <NavList />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/60" onClick={onClose} aria-hidden="true" />
          <aside role="dialog" aria-modal="true" aria-label="Navigation" className="relative h-full w-72 max-w-[85vw] animate-fade-in overflow-y-auto bg-white shadow-xl dark:bg-slate-950">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
              <Logo />
              <button type="button" onClick={onClose} aria-label="Close navigation menu" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={20} aria-hidden="true" /></button>
            </div>
            <NavList onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
