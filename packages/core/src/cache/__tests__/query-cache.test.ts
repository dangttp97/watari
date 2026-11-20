import { expect, test } from '@jest/globals';
import { createMemoryStore } from '../memory-store';
import { createQueryCache } from '../query-cache';

const setup = () => {
  let time = 1_000;
  const store = createMemoryStore();
  const cache = createQueryCache(store, { now: () => time });
  return { store, cache, tick: (ms: number) => (time += ms) };
};

test('loading giữ data cũ', () => {
  const { cache } = setup();
  cache.setCacheUpdateSuccess(cache.markTicketLoading('k'), { n: 1 });
  cache.markTicketLoading('k');
  expect(cache.getCache('k')).toMatchObject({
    status: 'loading',
    data: { n: 1 },
  });
});

test('isFresh theo staleTime', () => {
  const { cache, tick } = setup();
  cache.setCacheUpdateSuccess(cache.markTicketLoading('k'), 'x');
  expect(cache.checkCacheFreshness('k', 5_000)).toBe(true);
  tick(5_000);
  expect(cache.checkCacheFreshness('k', 5_000)).toBe(false);
});

test('invalidate trong lúc đang fetch → response cũ bị bỏ qua', () => {
  const { cache } = setup();
  const ticket = cache.markTicketLoading('k');
  cache.invalidateCache('k');
  expect(cache.setCacheUpdateSuccess(ticket, 'stale')).toBe(false);
  expect(cache.getCache('k')?.data).toBeUndefined();
});
