import type { CacheEntry, CacheStore } from './types';

export const createMemoryStore = (): CacheStore => {
  const entries = new Map<string, CacheEntry<unknown>>();
  const listeners = new Map<string, Set<() => void>>();
  const emit = (key: string) => listeners.get(key)?.forEach((cb) => cb());

  const store: CacheStore = {
    get(key) {
      return entries.get(key) as CacheEntry<any> | undefined;
    },
    set(key, entry) {
      entries.set(key, entry);
      emit(key);
    },
    delete(key) {
      // ← giữ nguyên tên delete
      if (entries.delete(key)) emit(key);
    },
    keys() {
      return [...entries.keys()];
    },
    subscribe(key, callback) {
      const set = listeners.get(key) ?? new Set<() => void>();
      listeners.set(key, set);
      set.add(callback);
      return () => {
        set.delete(callback);
        if (set.size === 0) listeners.delete(key);
      };
    },
  };

  return store;
};
