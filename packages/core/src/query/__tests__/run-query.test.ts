import { expect, jest, test } from '@jest/globals';
import { createMemoryStore } from '../../cache/memory-store';
import { createQueryCache } from '../../cache/query-cache';
import { AbortedError } from '../../errors/AbortedError';
import { HttpError } from '../../errors/HttpError';
import { deferred } from '../../__fixtures__/deferred';
import { createInflight } from '../inflight';
import { runQuery } from '../run-query';

const setup = () => {
  let time = 1_000;
  const cache = createQueryCache(createMemoryStore(), { now: () => time });
  const deps = { cache, inflight: createInflight() };
  return { cache, deps, tick: (ms: number) => (time += ms) };
};

test('fresh data → fetcher is not called', async () => {
  const { deps } = setup();
  const fetcher = jest.fn(async () => 'data');

  await runQuery(deps, { key: 'k', fetcher, staleTime: 10_000 });
  const second = await runQuery(deps, { key: 'k', fetcher, staleTime: 10_000 });

  expect(second).toBe('data');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('stale data → fetches again', async () => {
  const { deps, tick } = setup();
  const fetcher = jest.fn(async () => 'data');

  await runQuery(deps, { key: 'k', fetcher, staleTime: 1_000 });
  tick(1_000);
  await runQuery(deps, { key: 'k', fetcher, staleTime: 1_000 });

  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('three concurrent calls → fetcher runs once', async () => {
  const { deps } = setup();
  const fetcher = jest.fn(async () => 'data');

  const results = await Promise.all([
    runQuery(deps, { key: 'k', fetcher }),
    runQuery(deps, { key: 'k', fetcher }),
    runQuery(deps, { key: 'k', fetcher }),
  ]);

  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(results).toEqual(['data', 'data', 'data']);
});

test('while refetching, the entry is loading and keeps previous data', async () => {
  const { cache, deps } = setup();
  await runQuery(deps, { key: 'k', fetcher: async () => 'old' });

  const d = deferred<string>();
  const pending = runQuery(deps, { key: 'k', fetcher: () => d.promise });

  expect(cache.getCache('k')).toMatchObject({ status: 'loading', data: 'old' });
  d.resolve('new');
  await pending;
  expect(cache.getCache('k')).toMatchObject({ status: 'success', data: 'new' });
});

test('fetcher throws HttpError → entry is error and keeps data', async () => {
  const { cache, deps } = setup();
  await runQuery(deps, { key: 'k', fetcher: async () => 'old' });
  const error = new HttpError(500, null, {});

  await expect(
    runQuery(deps, { key: 'k', fetcher: async () => Promise.reject(error) })
  ).rejects.toBe(error);

  expect(cache.getCache('k')).toMatchObject({
    status: 'error',
    error,
    data: 'old',
  });
});

test('fetcher throws AbortedError → entry is restored exactly', async () => {
  const { cache, deps } = setup();
  await runQuery(deps, { key: 'k', fetcher: async () => 'old' });
  const before = cache.getCache('k');

  await expect(
    runQuery(deps, {
      key: 'k',
      fetcher: async () => Promise.reject(new AbortedError()),
    })
  ).rejects.toBeInstanceOf(AbortedError);

  expect(cache.getCache('k')).toBe(before);
});

test('tags are stored so invalidateTags finds the key', async () => {
  const { cache, deps } = setup();
  await runQuery(deps, { key: 'k', fetcher: async () => 'x', tags: ['todos'] });

  expect(cache.invalidateTags(['todos'])).toEqual(['k']);
});
