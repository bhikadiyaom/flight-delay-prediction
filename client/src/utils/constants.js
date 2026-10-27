// Airlines present in the training data (code = IATA, sent to the API; name = what the model was trained on).
export const AIRLINES = [
  { code: 'WN', name: 'Southwest Airlines' }, { code: 'DL', name: 'Delta Air Lines' }, { code: 'AA', name: 'American Airlines' },
  { code: 'UA', name: 'United Airlines' }, { code: 'OO', name: 'SkyWest Airlines' }, { code: 'YX', name: 'Republic Airways' },
  { code: 'B6', name: 'JetBlue Airways' }, { code: 'NK', name: 'Spirit Airlines' }, { code: 'AS', name: 'Alaska Airlines' },
  { code: 'MQ', name: 'American Eagle' }, { code: '9E', name: 'Endeavor Air' }, { code: 'OH', name: 'PSA Airlines' },
  { code: 'F9', name: 'Frontier Airlines' }, { code: 'G4', name: 'Allegiant Air' }, { code: 'HA', name: 'Hawaiian Airlines' },
].sort((a, b) => a.name.localeCompare(b.name));

export const API_BASE = `${(import.meta.env?.VITE_API_URL ?? 'http://localhost:5000').replace(/\/$/, '')}/api/v1`;
export const TOKEN_KEY = 'fdp-token';
export const BULK_MAX_ROWS = 500;
export const BULK_MAX_BYTES = 512 * 1024;

export const RISK = {
  low: { label: 'Low risk', badge: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30', dot: '#16a34a', dotDark: '#4ade80' },
  medium: { label: 'Medium risk', badge: 'bg-amber-100 text-amber-900 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30', dot: '#d97706', dotDark: '#fbbf24' },
  high: { label: 'High risk', badge: 'bg-red-100 text-red-800 ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-400/30', dot: '#dc2626', dotDark: '#f87171' },
};

/**
 * Recharts ignores Tailwind `dark:` classes, so charts take their colours from the RESOLVED theme (light|dark).
 * `series` is a colour-blind-safe qualitative palette; every chart also labels values, never colour alone.
 */
export function chartTheme(resolved) {
  const dark = resolved === 'dark';
  return {
    dark,
    text: dark ? '#cbd5e1' : '#475569',
    strong: dark ? '#f1f5f9' : '#0f172a',
    grid: dark ? '#1e293b' : '#e2e8f0',
    axis: dark ? '#475569' : '#94a3b8',
    tooltipBg: dark ? '#0f172a' : '#ffffff',
    tooltipBorder: dark ? '#334155' : '#cbd5e1',
    cursor: dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.05)',
    primary: dark ? '#60a5fa' : '#1d4ed8',
    secondary: dark ? '#f59e0b' : '#d97706',
    low: dark ? '#4ade80' : '#16a34a',
    medium: dark ? '#fbbf24' : '#d97706',
    high: dark ? '#f87171' : '#dc2626',
    series: dark
      ? ['#60a5fa', '#fbbf24', '#34d399', '#f472b6', '#a78bfa', '#fb923c']
      : ['#1d4ed8', '#d97706', '#059669', '#db2777', '#7c3aed', '#ea580c'],
  };
}

export const NAV_ITEMS = [
  { to: '/predict', label: 'Predict', icon: 'Gauge', desc: 'Manual what-if prediction' },
  { to: '/live', label: 'Live flight', icon: 'PlaneTakeoff', desc: 'Look up a flight and predict it' },
  { to: '/eda', label: 'Insights', icon: 'BarChart3', desc: '2023 delay analytics' },
  { to: '/historical', label: 'History', icon: 'History', desc: 'Search 2023 flights' },
  { to: '/risk-map', label: 'Risk map', icon: 'Map', desc: 'Delay rate by airport' },
  { to: '/models', label: 'Models', icon: 'FlaskConical', desc: 'Model comparison' },
];

export const ACCOUNT_NAV = [
  { to: '/saved', label: 'Saved searches', icon: 'Bookmark' },
  { to: '/bulk', label: 'Bulk CSV', icon: 'FileSpreadsheet' },
  { to: '/profile', label: 'Profile', icon: 'User' },
];
