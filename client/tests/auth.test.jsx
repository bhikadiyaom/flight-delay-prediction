import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_EXPIRED_EVENT, api, getErrorMessage, tokenStore } from '../src/api/axiosClient.js';
import { authApi } from '../src/api/authApi.js';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { ThemeProvider } from '../src/context/ThemeContext.jsx';
import { useAuth } from '../src/hooks/useAuth.js';
import AdminRoute from '../src/routes/AdminRoute.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import { TOKEN_KEY } from '../src/utils/constants.js';

vi.mock('../src/api/authApi.js', () => ({ authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), updateMe: vi.fn() } }));

const USER = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'user', preferences: { theme: 'dark', alertsEnabled: true } };
const ADMIN = { ...USER, id: 'a1', role: 'admin' };

function wrap(ui, { route = '/' } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider><MemoryRouter initialEntries={[route]}><AuthProvider>{ui}</AuthProvider></MemoryRouter></ThemeProvider>
    </QueryClientProvider>
  );
}

function Harness() {
  const a = useAuth();
  return (
    <div>
      <p data-testid="s">{a.loading ? 'loading' : a.user ? `user:${a.user.email}` : 'anon'}|{a.expired ? 'expired' : 'ok'}|{a.isAdmin ? 'admin' : 'nonadmin'}</p>
      <button onClick={() => a.login('ada@example.com', 'Password1').catch(() => {})}>login</button>
      <button onClick={a.logout}>logout</button>
    </div>
  );
}
const s = () => screen.getByTestId('s').textContent;

beforeEach(() => { vi.clearAllMocks(); });

describe('axios client', () => {
  const capture = () => {
    const seen = [];
    api.defaults.adapter = async (config) => { seen.push(config); return { data: {}, status: 200, statusText: 'OK', headers: {}, config }; };
    return seen;
  };

  it('sends the stored token as a Bearer header, and nothing when logged out', async () => {
    const seen = capture();
    await api.get('/x');
    expect(seen[0].headers.Authorization).toBeUndefined();
    tokenStore.set('abc.def.ghi');
    await api.get('/x');
    expect(seen[1].headers.Authorization).toBe('Bearer abc.def.ghi');
  });

  const reject401 = () => { api.defaults.adapter = async (config) => Promise.reject(Object.assign(new Error('401'), { config, response: { status: 401, data: { error: { message: 'Session expired' } }, config } })); };

  it('a 401 on a request that carried a token clears it and fires auth:expired', async () => {
    reject401();
    tokenStore.set('t');
    const fired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, fired);
    await expect(api.get('/users/me')).rejects.toBeTruthy();
    window.removeEventListener(AUTH_EXPIRED_EVENT, fired);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('a 401 WITHOUT a token (wrong password on /auth/login) does not log anything out', async () => {
    reject401();
    const fired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, fired);
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();
    window.removeEventListener(AUTH_EXPIRED_EVENT, fired);
    expect(fired).not.toHaveBeenCalled();
  });

  it('getErrorMessage prefers the server message, then validation details, then network wording', () => {
    expect(getErrorMessage({ response: { data: { error: { message: 'Flight AA1 was not found' } } } })).toBe('Flight AA1 was not found');
    expect(getErrorMessage({ response: { data: { error: { message: 'Validation failed', details: [{ path: 'origin', message: 'bad code' }] } } } })).toBe('Validation failed: origin bad code');
    expect(getErrorMessage({ request: {}, message: 'Network Error' })).toMatch(/Cannot reach the server/);
    expect(getErrorMessage({ code: 'ECONNABORTED' })).toMatch(/too long/);
    expect(getErrorMessage(new Error('boom'))).toMatch(/Something went wrong/);
  });
});

describe('AuthProvider', () => {
  it('rehydrates from the stored token; loading stays true until /users/me settles', async () => {
    tokenStore.set('tok');
    let resolve;
    authApi.me.mockReturnValue(new Promise((r) => { resolve = r; }));
    wrap(<Harness />);
    expect(s()).toBe('loading|ok|nonadmin');
    await act(async () => resolve(USER));
    expect(s()).toBe('user:ada@example.com|ok|nonadmin');
    expect(document.documentElement).toHaveClass('dark'); // account theme adopted
  });

  it('is not loading when there is no token, and never calls the API', () => {
    wrap(<Harness />);
    expect(s()).toBe('anon|ok|nonadmin');
    expect(authApi.me).not.toHaveBeenCalled();
  });

  it('login stores the token and the user; a failed login leaves no session', async () => {
    authApi.login.mockResolvedValueOnce({ token: 'new.jwt', user: ADMIN });
    wrap(<Harness />);
    await userEvent.setup().click(screen.getByText('login'));
    await waitFor(() => expect(s()).toBe('user:ada@example.com|ok|admin'));
    expect(localStorage.getItem(TOKEN_KEY)).toBe('new.jwt');

    await userEvent.setup().click(screen.getByText('logout'));
    expect(s()).toBe('anon|ok|nonadmin');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();

    authApi.login.mockRejectedValueOnce(new Error('Invalid email or password'));
    await userEvent.setup().click(screen.getByText('login'));
    await waitFor(() => expect(authApi.login).toHaveBeenCalledTimes(2));
    expect(s()).toBe('anon|ok|nonadmin');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('auth:expired logs the user out and raises the expired flag', async () => {
    tokenStore.set('tok');
    authApi.me.mockResolvedValue(USER);
    wrap(<Harness />);
    await waitFor(() => expect(s()).toMatch(/^user:/));
    act(() => { tokenStore.clear(); window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT)); });
    expect(s()).toBe('anon|expired|nonadmin');
  });

  it('keeps the token when /users/me fails for a non-401 reason (server down)', async () => {
    tokenStore.set('tok');
    authApi.me.mockRejectedValue({ response: { status: 503 } });
    wrap(<Harness />);
    await waitFor(() => expect(s()).toBe('anon|ok|nonadmin'));
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok');
  });

  it('drops the token when /users/me says 401', async () => {
    tokenStore.set('stale');
    authApi.me.mockRejectedValue({ response: { status: 401 } });
    wrap(<Harness />);
    await waitFor(() => expect(s()).toBe('anon|ok|nonadmin'));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.state?.from ? `<-${l.state.from.pathname}` : ''}</p>; }
const routes = (
  <>
    <Where />
    <Routes>
      <Route path="/login" element={<p>login page</p>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/saved" element={<p>saved page</p>} />
        <Route element={<AdminRoute />}><Route path="/admin" element={<p>admin page</p>} /></Route>
      </Route>
    </Routes>
  </>
);

describe('route guards', () => {
  it('redirects anonymous visitors to /login and remembers where they were going', async () => {
    wrap(routes, { route: '/saved' });
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/login<-/saved');
  });

  it('waits for the session check instead of bouncing a logged-in user on refresh', async () => {
    tokenStore.set('tok');
    let resolve;
    authApi.me.mockReturnValue(new Promise((r) => { resolve = r; }));
    wrap(routes, { route: '/saved' });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    await act(async () => resolve(USER));
    expect(await screen.findByText('saved page')).toBeInTheDocument();
  });

  it('shows "Admins only" to normal users and the page to admins', async () => {
    tokenStore.set('tok');
    authApi.me.mockResolvedValue(USER);
    const first = wrap(routes, { route: '/admin' });
    expect(await screen.findByText('Admins only')).toBeInTheDocument();
    first.unmount();
    authApi.me.mockResolvedValue(ADMIN);
    wrap(routes, { route: '/admin' });
    expect(await screen.findByText('admin page')).toBeInTheDocument();
  });
});
