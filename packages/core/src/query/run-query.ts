import type { QueryCache } from '../cache/query-cache';
import type { CacheKey, Tag } from '../cache/types';
import { AbortedError } from '../errors/AbortedError';
import type { Inflight } from './inflight';

export type QueryDeps = {
  cache: QueryCache;
  inflight: Inflight;
};

export type RunQueryOptions<T> = {
  key: CacheKey;
  fetcher: (signal: AbortSignal) => Promise<T>;
  staleTime?: number;
  tags?: readonly Tag[];
  signal?: AbortSignal;
};

export const runQuery = async <T>(
  { cache, inflight }: QueryDeps,
  { key, fetcher, staleTime = 0, tags = [], signal }: RunQueryOptions<T>
): Promise<T> => {
  if (cache.checkCacheFreshness(key, staleTime)) {
    return cache.getCache<T>(key)!.data as T;
  }

  return inflight.join<T>(
    key,
    async (sharedSignal) => {
      // ② dedupe
      const ticket = cache.markTicketLoading(key, tags);
      try {
        const data = await fetcher(sharedSignal);
        cache.setCacheUpdateSuccess(ticket, data, tags);
        return data;
      } catch (error) {
        if (error instanceof AbortedError) cache.restoreCache(ticket);
        else cache.setCacheUpdateError(ticket, error);
        throw error;
      }
    },
    signal
  );
};
