import axios from 'axios';
import { API_BASE, TOKEN_KEY } from '../utils/constants.js';

export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(t) {
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage blocked: session lasts until reload */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

export const AUTH_EXPIRED_EVENT = 'auth:expired';

export const api = axios.create({ baseURL: API_BASE, timeout: 20000 });

// Decision 2: single JWT in `Authorization: Bearer`, kept in localStorage.
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 on a request that carried a token means the session is over: clear it and tell AuthContext.
// (A 401 from /auth/login without a token is just "wrong password" and must not log anything out.)
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && error.config?.headers?.Authorization) {
      tokenStore.clear();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

/** A message that is safe to show a user, from any axios/Error value. */
export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const e = err?.response?.data?.error;
  if (e?.details?.length) {
    const d = e.details[0];
    return `${e.message}: ${d.path ? `${d.path} ` : ''}${d.message ?? ''}`.trim();
  }
  if (e?.message) return e.message;
  if (err?.code === 'ECONNABORTED') return 'The server took too long to respond.';
  if (err?.request && !err?.response) return 'Cannot reach the server. Check your connection and try again.';
  return fallback;
}

export const errorStatus = (err) => err?.response?.status;
