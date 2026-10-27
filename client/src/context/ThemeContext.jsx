import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyTheme, nextPreference, PREFERENCES, readPreference, resolveTheme, savePreference } from '../utils/themeInit.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference);
  const [resolved, setResolved] = useState(() => resolveTheme(readPreference()));

  // apply + persist whenever the preference changes
  useEffect(() => {
    const r = resolveTheme(preference);
    setResolved(r);
    applyTheme(r);
    savePreference(preference);
  }, [preference]);

  // follow the OS only while the preference is "system"
  useEffect(() => {
    if (preference !== 'system' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const r = resolveTheme('system');
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((p) => {
    if (PREFERENCES.includes(p)) setPreferenceState(p);
  }, []);
  const cycle = useCallback(() => setPreferenceState((p) => nextPreference(p)), []);

  const value = useMemo(() => ({ preference, resolved, setPreference, cycle }), [preference, resolved, setPreference, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
