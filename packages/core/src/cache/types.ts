export type CacheKey = string;
export type Tag = string;

export type CacheStatus = 'idle' | 'loading' | 'success' | 'error';

export type CacheEntry<T> = {
  status: CacheStatus;
  data?: T;
  error?: Error;
  expiresAt?: number;
  updatedAt?: number;
  tags?: Tag[];
  version?: number;
};

export type CacheStore = {
  get: <T = unknown>(key: string) => CacheEntry<T> | undefined;
  set: <T = unknown>(key: string, entry: CacheEntry<T>) => void;
  delete: (key: string) => void;
  keys: () => string[];
  subscribe: (key: string, callback: () => void) => () => void;
};
