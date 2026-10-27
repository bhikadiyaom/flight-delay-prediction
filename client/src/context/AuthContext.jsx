import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authApi } from '../api/authApi.js';
import { AUTH_EXPIRED_EVENT, tokenStore } from '../api/axiosClient.js';
import { queryClient } from '../lib/queryClient.js';
import { useThemeContext } from './ThemeContext.jsx';

const AuthContext = createContext(null);

/**
 * Exposes { user, token, login, register, logout, isAdmin, loading, setTheme, expired }.
 * Rehydrates from the stored token via GET /users/me; `loading` stays true until that settles so ProtectedRoute
 * never redirects a logged-in user to /login during a page refresh.
 */
export function AuthProvider({ children }) {
  const { setPreference, preference } = useThemeContext();
  const [token, setToken] = useState(() => tokenStore.get());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));
  const [expired, setExpired] = useState(false);
  const themeRef = useRef(preference);
  themeRef.current = preference;

  const adoptSession = useCallback((nextToken, nextUser) => {
    tokenStore.set(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setExpired(false);
    // on login the account's saved theme wins over this device's preference
    if (nextUser?.preferences?.theme) setPreference(nextUser.preferences.theme);
  }, [setPreference]);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setToken(null);
    setUser(null);
    queryClient.removeQueries(); // no private data (history, saved searches, admin stats) may survive a logout
  }, []);

  // rehydrate
  useEffect(() => {
    if (!tokenStore.get()) return undefined;
    let cancelled = false;
    authApi.me()
      .then((u) => { if (!cancelled) { setUser(u); if (u.preferences?.theme) setPreference(u.preferences.theme); } })
      .catch((err) => {
        // 401 is handled by the axios interceptor (auth:expired); anything else (server down) keeps the token for a retry
        if (!cancelled && err?.response?.status === 401) clearSession();
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clearSession, setPreference]);

  // 401 anywhere -> logged out + a flag the UI can turn into a toast
  useEffect(() => {
    const onExpired = () => { clearSession(); setExpired(true); setLoading(false); };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const r = await authApi.login({ email, password });
    adoptSession(r.token, r.user);
    return r.user;
  }, [adoptSession]);

  const register = useCallback(async (name, email, password) => {
    const r = await authApi.register({ name, email, password });
    adoptSession(r.token, r.user);
    return r.user;
  }, [adoptSession]);

  const logout = useCallback(() => { clearSession(); setExpired(false); }, [clearSession]);

  /** Change the theme and, for a signed-in user, save it to their profile (fire and forget). */
  const setTheme = useCallback((pref) => {
    setPreference(pref);
    if (tokenStore.get()) {
      authApi.updateMe({ preferences: { theme: pref } }).then(setUser).catch(() => { /* local preference still applies */ });
    }
  }, [setPreference]);

  const updateProfile = useCallback(async (body) => {
    const u = await authApi.updateMe(body);
    setUser(u);
    return u;
  }, []);

  const value = useMemo(() => ({
    user, token, loading, expired, isAdmin: user?.role === 'admin', isAuthenticated: Boolean(user),
    login, register, logout, setTheme, updateProfile, dismissExpired: () => setExpired(false),
  }), [user, token, loading, expired, login, register, logout, setTheme, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
