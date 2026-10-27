import { ChevronDown, LogOut, Menu, PlaneTakeoff, ShieldCheck, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { cn } from '../../utils/cn.js';
import Button from '../common/Button.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export function Logo({ className }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5 rounded-lg font-semibold tracking-tight', className)} aria-label="Flight Delay Predictor home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-700 text-white dark:bg-brand-500 dark:text-slate-950"><PlaneTakeoff size={20} aria-hidden="true" /></span>
      <span className="hidden text-lg sm:inline">Flight<span className="text-brand-700 dark:text-brand-400">Delay</span></span>
    </Link>
  );
}

function UserMenu() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const item = 'flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800';
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-slate-100 dark:hover:bg-slate-800">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-700 text-xs font-semibold text-white dark:bg-brand-500 dark:text-slate-950" aria-hidden="true">{initials}</span>
        <span className="hidden max-w-[10rem] truncate text-sm font-medium md:inline">{user.name}</span>
        <ChevronDown size={16} aria-hidden="true" className="hidden md:block" />
        <span className="sr-only">Account menu for {user.name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="muted truncate text-xs">{user.email}</p>
          </div>
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className={item}><User size={16} aria-hidden="true" />Profile</Link>
          {isAdmin && <Link role="menuitem" to="/admin" onClick={() => setOpen(false)} className={item}><ShieldCheck size={16} aria-hidden="true" />Admin panel</Link>}
          <button role="menuitem" type="button" className={cn(item, 'border-t border-slate-200 dark:border-slate-800')}
            onClick={() => { setOpen(false); logout(); navigate('/'); }}><LogOut size={16} aria-hidden="true" />Log out</button>
        </div>
      )}
    </div>
  );
}

const TOP_LINKS = [{ to: '/predict', label: 'Predict' }, { to: '/live', label: 'Live flight' }, { to: '/eda', label: 'Insights' }, { to: '/risk-map', label: 'Risk map' }];

export default function Navbar({ onMenu, showMenuButton = true, showTopLinks = false }) {
  const { user, loading } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-2 px-4 sm:px-6">
        {showMenuButton && (
          <button type="button" onClick={onMenu} aria-label="Open navigation menu"
            className="-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800">
            <Menu size={22} aria-hidden="true" />
          </button>
        )}
        <Logo />
        {showTopLinks && (
          <nav aria-label="Primary" className="ml-6 hidden items-center gap-1 md:flex">
            {TOP_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-300' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>{l.label}</NavLink>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {loading ? <span className="h-8 w-20" aria-hidden="true" />
            : user ? <UserMenu />
              : (
                <div className="flex items-center gap-1.5">
                  <Button as={Link} to="/login" variant="ghost" size="md" className="hidden sm:inline-flex">Log in</Button>
                  <Button as={Link} to="/register" size="md">Sign up</Button>
                </div>
              )}
        </div>
      </div>
    </header>
  );
}
