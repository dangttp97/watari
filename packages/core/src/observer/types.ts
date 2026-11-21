import type { CacheEntry } from '../cache/types';

export type QueryObserver<T> = {
  getSnapshot: () => CacheEntry<T> | undefined;
  subscribe: (onChange: () => void) => () => void;
  refetch: () => Promise<T>;
};
