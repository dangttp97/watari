import type { CacheKey } from './types';

const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined) // { a: undefined } coi như {}
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : v
  );

export const createCacheKey = (name: string, params?: unknown): CacheKey =>
  params === undefined ? name : `${name}:${stableStringify(params)}`;
