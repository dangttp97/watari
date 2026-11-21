import type { QueryCache } from '../cache/query-cache';
import type { CacheKey } from '../cache/types';
import type { QueryObserver } from './types';

export const createQueryObserver = <T>(
  cache: QueryCache,
  key: CacheKey,
  run: (signal: AbortSignal, force?: boolean) => Promise<T>,
  staleTime = 0
): QueryObserver<T> => {
  let subscribers = 0;
  let abortController: AbortController | undefined;

  const fetchNow = (force: boolean = false) => {
    abortController?.abort();
    abortController = new AbortController();

    return run(abortController.signal, force);
  };

  const fetchInBackground = () => {
    fetchNow().catch(() => {});
  };

  const subscribe = (onChange: () => void) => {
    subscribers++;

    const unsubscribe = cache.subscribe(key, () => {
      const entry = cache.getCache(key);
      if (entry?.invalidated && entry.status !== 'loading') {
        queueMicrotask(fetchInBackground);
      }

      onChange();
    });

    if (subscribers === 1 && !cache.checkCacheFreshness(key, staleTime)) {
      fetchInBackground();
    }

    return () => {
      unsubscribe();
      subscribers--;
      if (subscribers === 0) abortController?.abort();
    };
  };

  return {
    getSnapshot: () => cache.getCache<T>(key),
    subscribe,
    refetch: () => fetchNow(true),
  };
};
