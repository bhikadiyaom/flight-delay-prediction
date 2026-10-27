import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Node 25+/26 ships an experimental global `localStorage` that shadows jsdom's (and is unusable without a file),
// so tests get a plain in-memory Storage on both globalThis and window.
class MemoryStorage {
  #m = new Map();
  get length() { return this.#m.size; }
  key(i) { return [...this.#m.keys()][i] ?? null; }
  getItem(k) { return this.#m.has(String(k)) ? this.#m.get(String(k)) : null; }
  setItem(k, v) { this.#m.set(String(k), String(v)); }
  removeItem(k) { this.#m.delete(String(k)); }
  clear() { this.#m.clear(); }
}
for (const target of [globalThis, window]) {
  Object.defineProperty(target, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });
}

// controllable prefers-color-scheme
let systemDark = false;
const listeners = new Set();
window.matchMedia = (query) => ({
  matches: query.includes('dark') ? systemDark : false,
  media: query,
  addEventListener: (_t, fn) => listeners.add(fn),
  removeEventListener: (_t, fn) => listeners.delete(fn),
  addListener() {}, removeListener() {}, dispatchEvent: () => false,
});
globalThis.__setSystemDark = (v) => { systemDark = v; listeners.forEach((fn) => fn({ matches: v })); };
globalThis.__systemListeners = () => listeners.size;

window.scrollTo = () => {};
window.confirm = () => true;
Element.prototype.scrollIntoView = () => {};
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

beforeEach(() => {
  systemDark = false;
  listeners.clear();
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});
afterEach(() => cleanup());
