import { useCallback, useState } from 'react';

/** useState that persists JSON to localStorage. Every access is guarded: storage can be blocked or full. */
export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });

  const set = useCallback((next) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* not persisted */ }
      return v;
    });
  }, [key]);

  return [value, set];
}
