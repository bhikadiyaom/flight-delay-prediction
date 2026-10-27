import { Monitor, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useTheme } from '../../hooks/useTheme.js';
import { nextPreference } from '../../utils/themeInit.js';
import { cn } from '../../utils/cn.js';

const META = { light: { icon: Sun, label: 'Light' }, dark: { icon: Moon, label: 'Dark' }, system: { icon: Monitor, label: 'System' } };

/** Cycles light -> dark -> system. For a signed-in user the choice is also saved to their profile. */
export default function ThemeToggle({ showLabel = false, className }) {
  const { preference } = useTheme();
  const { setTheme } = useAuth();
  const { icon: Icon, label } = META[preference];
  const next = nextPreference(preference);
  return (
    <button type="button" onClick={() => setTheme(next)} aria-label={`Theme: ${label.toLowerCase()}. Switch to ${META[next].label.toLowerCase()}.`}
      title={`Theme: ${label}`}
      className={cn('inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2.5 text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800', className)}>
      <Icon size={18} aria-hidden="true" />
      {showLabel && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}
