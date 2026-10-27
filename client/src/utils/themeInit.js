// Theme helpers shared by ThemeContext and tests. The inline script in index.html does the same first-paint work
// before React loads (keep the storage key in sync with it).
export const THEME_KEY = 'fdp-theme';
export const PREFERENCES = ['light', 'dark', 'system'];

export function readPreference() {
  try {
    const p = localStorage.getItem(THEME_KEY);
    return PREFERENCES.includes(p) ? p : 'system';
  } catch {
    return 'system';
  }
}

export function savePreference(pref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch { /* private mode: the theme just will not persist */ }
}

export const systemPrefersDark = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;

/** 'light' | 'dark' | 'system' -> 'light' | 'dark' */
export const resolveTheme = (pref) => (pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref === 'dark' ? 'dark' : 'light');

export function applyTheme(resolved) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

/** light -> dark -> system -> light */
export const nextPreference = (pref) => PREFERENCES[(PREFERENCES.indexOf(pref) + 1) % PREFERENCES.length];
