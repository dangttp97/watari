import type { CacheKey, CacheStore, FetchTicket, Tag } from './types';

export type QueryCacheOptions = {
  now?: () => number; // cho phép test truyền đồng hồ giả
};
export type QueryCache = ReturnType<typeof createQueryCache>;

export const createQueryCache = (
  store: CacheStore,
  { now = Date.now }: QueryCacheOptions = {}
) => {
  let counter = 0;
  const validTicket = new Map<CacheKey, number>();
  const tagIndex = new Map<Tag, Set<CacheKey>>();

  const getCache = <T = unknown>(key: CacheKey) => store.get<T>(key);

  const checkCacheFreshness = (key: CacheKey, staleTime: number) => {
    const entry = store.get(key);
    if (!entry || entry.status !== 'success' || entry.invalidated) return false;
    if (entry.updatedAt === undefined) return false;
    return now() - entry.updatedAt < staleTime;
  };

  const updateTagIndex = (
    key: CacheKey,
    oldTags: readonly Tag[],
    newTags: readonly Tag[]
  ) => {
    for (const tag of oldTags) {
      const keys = tagIndex.get(tag);
      keys?.delete(key);
      if (keys?.size === 0) tagIndex.delete(tag);
    }
    for (const tag of newTags) {
      const keys = tagIndex.get(tag) ?? new Set<CacheKey>();
      keys.add(key);
      tagIndex.set(tag, keys);
    }
  };

  const markTicketLoading = (
    key: CacheKey,
    tags?: readonly Tag[]
  ): FetchTicket => {
    const previous = store.get(key);
    const generation = ++counter;
    validTicket.set(key, generation);

    // Register tags as soon as loading starts, so invalidateTags can reach
    // a key whose very first fetch is still in flight.
    if (tags) updateTagIndex(key, previous?.tags ?? [], tags);

    store.set(key, {
      ...(previous ?? {}), // giữ data, updatedAt, tags cũ → UI không nhấp nháy
      ...(tags ? { tags } : {}),
      status: 'loading',
      error: undefined,
    });

    return { key, generation, previous };
  };

  const checkTicketValid = (ticket: FetchTicket) =>
    validTicket.get(ticket.key) === ticket.generation;

  const setCacheUpdateSuccess = <T>(
    ticket: FetchTicket,
    data: T,
    tags: readonly Tag[] = []
  ) => {
    if (!checkTicketValid(ticket)) return false; // vé cũ → bỏ qua
    validTicket.delete(ticket.key); // vé đã dùng xong

    updateTagIndex(ticket.key, store.get(ticket.key)?.tags ?? [], tags);
    store.set(ticket.key, {
      status: 'success',
      data,
      updatedAt: now(),
      tags,
      invalidated: false,
    });
    return true;
  };

  const setCacheUpdateError = (ticket: FetchTicket, error: unknown) => {
    if (!checkTicketValid(ticket)) return false;
    validTicket.delete(ticket.key);

    const current = store.get(ticket.key);
    store.set(ticket.key, {
      ...(current ?? {}), // vẫn giữ data cũ: UI có thể hiện "data cũ + báo lỗi"
      status: 'error',
      error,
    });
    return true;
  };

  const restoreCache = (ticket: FetchTicket) => {
    if (!checkTicketValid(ticket)) return false;
    validTicket.delete(ticket.key);

    if (ticket.previous) store.set(ticket.key, ticket.previous);
    else store.delete(ticket.key);
    return true;
  };

  const invalidateCache = (key: CacheKey) => {
    validTicket.delete(key);
    const entry = store.get(key);
    if (entry && !entry.invalidated) {
      store.set(key, { ...entry, invalidated: true });
    }
  };

  const invalidateTags = (tags: readonly Tag[]) => {
    const keys = new Set<CacheKey>();
    for (const tag of tags) tagIndex.get(tag)?.forEach((k) => keys.add(k));
    keys.forEach(invalidateCache);
    return [...keys];
  };

  const clearAll = () => {
    validTicket.clear();
    tagIndex.clear();
    for (const key of store.keys()) store.delete(key);
  };

  return {
    getCache,
    checkCacheFreshness,
    markTicketLoading,
    checkTicketValid,
    setCacheUpdateSuccess,
    setCacheUpdateError,
    invalidateCache,
    invalidateTags,
    restoreCache,
    clearAll,
  };
};
