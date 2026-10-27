import { describe, expect, it } from 'vitest';
import { chartTheme } from '../src/utils/constants.js';
import { cn } from '../src/utils/cn.js';
import {
  capitalize, featureLabel, formatDate, formatDateTime, formatInt, formatMinutes, formatPct, formatTime, riskOf, shortAirline, toIsoLocal,
} from '../src/utils/formatters.js';
import { applyTheme, nextPreference, readPreference, resolveTheme, THEME_KEY } from '../src/utils/themeInit.js';

describe('formatters', () => {
  it('formats percentages from fractions and survives bad input', () => {
    expect(formatPct(0.2056)).toBe('20.6%');
    expect(formatPct(0.2056, 0)).toBe('21%');
    expect(formatPct(null)).toBe('-');
    expect(formatPct(undefined)).toBe('-');
    expect(formatPct(Number.NaN)).toBe('-');
  });

  it('formats minutes as minutes or hours', () => {
    expect(formatMinutes(45.7)).toBe('46 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(125)).toBe('2 h 5 min');
    expect(formatMinutes(null)).toBe('-');
  });

  it('groups thousands', () => {
    expect(formatInt(6830352)).toBe('6,830,352');
    expect(formatInt(undefined)).toBe('-');
  });

  it('shows airport-local times exactly as written, with no time zone conversion', () => {
    expect(formatTime('2026-10-27T14:00:00+00:00')).toBe('14:00');
    expect(formatTime('2026-10-27T23:59:00')).toBe('23:59');
    expect(formatDate('2026-10-27T14:00:00+00:00')).toBe('Tue, Oct 27');
    expect(formatDateTime('2023-07-04T09:05:00')).toBe('Tue, Jul 4 · 09:05');
    expect(formatTime(null)).toBe('-');
    expect(formatDate('garbage')).toBe('-');
  });

  it('builds the API departure string from date + time inputs', () => {
    expect(toIsoLocal('2026-12-22', '09:30')).toBe('2026-12-22T09:30:00');
    expect(toIsoLocal('2026-12-22', '09:30:15')).toBe('2026-12-22T09:30:15');
    expect(toIsoLocal('', '09:30')).toBe('');
  });

  it('turns model feature names into readable labels, with a safe fallback', () => {
    expect(featureLabel('o_prcp_band')).toBe('Rain at origin');
    expect(featureLabel('origin_time_delay_rate')).toBe('Origin delay history at this hour');
    expect(featureLabel('some_new_feature')).toBe('some new feature');
  });

  it('cleans airline names and classifies risk like the server', () => {
    expect(shortAirline('Southwest Airlines Co.')).toBe('Southwest Airlines');
    expect(shortAirline('Delta Air Lines Inc')).toBe('Delta Air Lines');
    expect(shortAirline('JetBlue Airways')).toBe('JetBlue Airways');
    expect([riskOf(0.05), riskOf(0.2), riskOf(0.39), riskOf(0.4)]).toEqual(['low', 'medium', 'medium', 'high']);
    expect(capitalize('live')).toBe('Live');
  });

  it('cn joins classes and skips falsy values', () => {
    expect(cn('a', false, null, undefined, ['b', 'c'])).toBe('a b c');
  });
});

describe('theme helpers', () => {
  it('cycles light -> dark -> system -> light', () => {
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
    expect(nextPreference('system')).toBe('light');
  });

  it('resolves system from the OS setting', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('system')).toBe('light');
    globalThis.__setSystemDark(true);
    expect(resolveTheme('system')).toBe('dark');
  });

  it('reads the stored preference, ignoring garbage', () => {
    expect(readPreference()).toBe('system');
    localStorage.setItem(THEME_KEY, 'dark');
    expect(readPreference()).toBe('dark');
    localStorage.setItem(THEME_KEY, 'neon');
    expect(readPreference()).toBe('system');
  });

  it('applyTheme toggles the class on <html>', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    applyTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('chart themes differ for light and dark and always carry a full palette', () => {
    const l = chartTheme('light');
    const d = chartTheme('dark');
    expect(l.dark).toBe(false);
    expect(d.dark).toBe(true);
    expect(l.text).not.toBe(d.text);
    expect(l.series).toHaveLength(6);
    expect(d.series).toHaveLength(6);
    for (const k of ['low', 'medium', 'high', 'grid', 'tooltipBg']) expect(d[k]).toMatch(/^#|rgba/);
  });
});
