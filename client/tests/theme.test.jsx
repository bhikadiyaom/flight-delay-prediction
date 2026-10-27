import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../src/context/ThemeContext.jsx';
import { useTheme } from '../src/hooks/useTheme.js';

function Probe() {
  const { preference, resolved, cycle, setPreference } = useTheme();
  return (
    <div>
      <p data-testid="state">{preference}/{resolved}</p>
      <button onClick={cycle}>cycle</button>
      <button onClick={() => setPreference('bogus')}>bogus</button>
      <button onClick={() => setPreference('dark')}>dark</button>
    </div>
  );
}
const state = () => screen.getByTestId('state').textContent;
const setup = () => render(<ThemeProvider><Probe /></ThemeProvider>);

describe('ThemeProvider', () => {
  it('starts on "system" and follows the OS', () => {
    setup();
    expect(state()).toBe('system/light');
    act(() => globalThis.__setSystemDark(true));
    expect(state()).toBe('system/dark');
    expect(document.documentElement).toHaveClass('dark');
    act(() => globalThis.__setSystemDark(false));
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('cycles light -> dark -> system, applies the class and persists the choice', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByText('cycle')); // system -> light
    expect(state()).toBe('light/light');
    expect(localStorage.getItem('fdp-theme')).toBe('light');
    await user.click(screen.getByText('cycle')); // -> dark
    expect(state()).toBe('dark/dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem('fdp-theme')).toBe('dark');
    await user.click(screen.getByText('cycle')); // -> system
    expect(state()).toBe('system/light');
  });

  it('listens to prefers-color-scheme ONLY while the preference is "system"', async () => {
    setup();
    const user = userEvent.setup();
    expect(globalThis.__systemListeners()).toBe(1);
    await user.click(screen.getByText('dark'));
    expect(globalThis.__systemListeners()).toBe(0);
    act(() => globalThis.__setSystemDark(false));
    expect(state()).toBe('dark/dark'); // an explicit choice is not overridden by the OS
  });

  it('restores the saved preference on load and ignores invalid values', async () => {
    localStorage.setItem('fdp-theme', 'dark');
    setup();
    expect(state()).toBe('dark/dark');
    await userEvent.setup().click(screen.getByText('bogus'));
    expect(state()).toBe('dark/dark');
  });
});
